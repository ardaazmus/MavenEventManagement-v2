// PWA Katılımcı Dış Portalı — OYUNLAŞTIRMA DURUMU (gamification)
// GET: oturumun puanı, seviyesi, görev listesi (formlar + Q&A + B2B) ve liderlik tablosu.
// • Oturum kapılı (GUEST de puan toplayabilir); gameEnabled kapalıysa {enabled:false}.
// • Liderlik tablosu gizlilik: AUTH adları maskeli ("Ayşe Y."), GUEST "Misafir".
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { enforceRateLimit } from "@/lib/rate-limit";
import { extractSession, validatePortalSession } from "@/lib/api/portal-access";

export const dynamic = "force-dynamic";

const DEFAULT_POINTS: Record<string, number> = { FORM_SUBMIT: 20, QA_SUBMIT: 10, B2B_ACCEPT: 15 };
// Liderlik gizlilik politikası (organizatör seçimi): MASKED="Ayşe Y." | FULL="Ayşe Yılmaz"
// | HIDDEN=isim yok (istemci "Katılımcı" gösterir). Varsayılan MASKED.
type Masking = "MASKED" | "FULL" | "HIDDEN";
const MASKING_VALUES: Masking[] = ["MASKED", "FULL", "HIDDEN"];
const DEFAULT_LEVELS = [
  { name: "Bronz", min: 0 },
  { name: "Gümüş", min: 50 },
  { name: "Altın", min: 150 },
  { name: "Elmas", min: 300 },
];

export async function GET(req: NextRequest) {
  const denied = enforceRateLimit(req, { key: "portal-game", limit: 90, windowMs: 60_000 });
  if (denied) return denied;
  try {
    const raw = extractSession(req);
    if (!raw) return NextResponse.json({ error: "Oturum gerekli" }, { status: 401 });
    const check = await validatePortalSession(raw);
    if (!check.ok) return NextResponse.json({ error: "Oturum geçersiz" }, { status: check.reason === "UNKNOWN" ? 404 : 410 });
    const session = check.session;
    const editionId = session.editionId;

    const config = await db.eventPortalConfig.findUnique({
      where: { editionId },
      select: { gameEnabled: true, gameConfigJson: true },
    });
    if (!config?.gameEnabled) return NextResponse.json({ enabled: false });

    let pointsCfg = { ...DEFAULT_POINTS };
    let qaCap = 5;
    let levels = DEFAULT_LEVELS;
    let masking: Masking = "MASKED";
    if (config.gameConfigJson) {
      try {
        const p = JSON.parse(config.gameConfigJson) as { points?: Record<string, number>; qaCap?: number; levels?: { name: string; min: number }[]; masking?: string };
        if (p.points && typeof p.points === "object") pointsCfg = { ...pointsCfg, ...p.points };
        if (Number.isFinite(p.qaCap)) qaCap = Math.max(1, Math.min(50, Math.round(Number(p.qaCap))));
        if (Array.isArray(p.levels) && p.levels.length >= 2) levels = p.levels;
        if (p.masking && MASKING_VALUES.includes(p.masking as Masking)) masking = p.masking as Masking;
      } catch {
        /* bozuk json → varsayılan */
      }
    }
    levels = [...levels].sort((a, b) => a.min - b.min);

    const progress = await db.portalGameProgress.findUnique({
      where: { editionId_sessionId: { editionId, sessionId: session.id } },
    });
    const total = progress?.points ?? 0;
    const actions = progress?.actionsJson ? (JSON.parse(progress.actionsJson) as Record<string, number>) : {};

    // seviye hesabı — mevcut ve bir sonraki eşik
    let levelIdx = 0;
    for (let i = 0; i < levels.length; i++) {
      if (total >= levels[i].min) levelIdx = i;
    }
    const level = levels[levelIdx];
    const nextLevel = levels[levelIdx + 1] ?? null;
    const pct = nextLevel
      ? Math.min(100, Math.round(((total - level.min) / Math.max(1, nextLevel.min - level.min)) * 100))
      : 100;

    // ── görev listesi (§ modüllerdeki formlar ile etkileşimli) ──
    type Quest = { key: string; kind: string; label: string; points: number; done: boolean; progress?: number; target?: number };
    const quests: Quest[] = [];

    // form görevleri — edisyonun açık formları (en fazla 8)
    const forms = await db.formDefinition.findMany({
      where: { editionId, isPublic: true },
      select: { id: true, name: true },
      orderBy: { createdAt: "asc" },
      take: 8,
    });
    for (const f of forms) {
      quests.push({
        key: `form:${f.id}`,
        kind: "FORM",
        label: f.name,
        points: Math.round(pointsCfg.FORM_SUBMIT ?? 0),
        done: Boolean(actions[`FORM_SUBMIT:${f.id}`]),
      });
    }

    // Q&A görevi — tavana kadar her soru puan getirir
    const qaPts = Math.round(pointsCfg.QA_SUBMIT ?? 0);
    if (qaPts > 0) {
      const qaCount = Number(actions["QA_SUBMIT"] ?? 0);
      quests.push({ key: "qa", kind: "QA", label: "", points: qaPts, done: qaCount >= qaCap, progress: qaCount, target: qaCap });
    }

    // B2B görevi — yalnız AUTH oturumda anlamlı
    if (session.kind === "AUTH" && session.personId) {
      const b2bPts = Math.round(pointsCfg.B2B_ACCEPT ?? 0);
      if (b2bPts > 0) {
        const acceptedCount = Object.keys(actions).filter((k) => k.startsWith("B2B_ACCEPT:")).length;
        const myAssignments = await db.b2bAssignment.count({ where: { personId: session.personId, plan: { editionId } } });
        if (myAssignments > 0) {
          quests.push({ key: "b2b", kind: "B2B", label: "", points: b2bPts, done: acceptedCount >= myAssignments && acceptedCount > 0, progress: acceptedCount, target: myAssignments });
        }
      }
    }

    // ── liderlik tablosu — ilk 10, gizlilik maskeli ──
    const top = await db.portalGameProgress.findMany({
      where: { editionId },
      orderBy: [{ points: "desc" }, { updatedAt: "asc" }],
      take: 10,
      select: { sessionId: true, personId: true, points: true },
    });
    const personIds = top.map((r) => r.personId).filter((v): v is string => Boolean(v));
    const persons = personIds.length
      ? await db.person.findMany({ where: { id: { in: personIds } }, select: { id: true, firstName: true, lastName: true } })
      : [];
    const personMap = new Map(persons.map((p) => [p.id, p]));
    const leaderboard = top.map((r, i) => {
      const p = r.personId ? personMap.get(r.personId) : null;
      let name: string | null = null;
      if (p && masking === "FULL") name = `${p.firstName} ${p.lastName}`.trim();
      if (p && masking === "MASKED") {
        name = `${p.firstName} ${(p.lastName || "").slice(0, 1)}${p.lastName ? "." : ""}`.trim();
      }
      // masking === "HIDDEN" → name null (istemci "Katılımcı" gösterir); GUEST her zaman null
      return { rank: i + 1, name, points: r.points, you: r.sessionId === session.id };
    });

    return NextResponse.json({
      enabled: true,
      points: total,
      level: level.name,
      levelMin: level.min,
      nextLevel: nextLevel?.name ?? null,
      nextLevelMin: nextLevel?.min ?? null,
      pct,
      quests,
      leaderboard,
      isAuth: session.kind === "AUTH",
    });
  } catch (err) {
    console.error("portal/game GET:", err);
    return NextResponse.json({ error: "Oyun durumu alınamadı" }, { status: 500 });
  }
}
