// PWA Katılımcı Dış Portalı — ETKİLEŞİM UCI (§4.3 analitik + §4.2 hatırlatıcı +
// Q&A gönderimi + §4.1 B2B yanıtları)
// Tüm aksiyonlar oturum kapılıdır; analitik izleri PII içermez (yalnız oturum-id +
// widget anahtarı). B2B yanıtları YALNIZ AUTH oturumunda ve YALNIZ kendi atamasında.
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { enforceRateLimit } from "@/lib/rate-limit";
import { extractSession, validatePortalSession, touchSession, type PortalSessionRow } from "@/lib/api/portal-access";

export const dynamic = "force-dynamic";

const LOG_KINDS = new Set(["VISIT", "WIDGET_CLICK", "PWA_INSTALL", "FORM_OPEN", "REMINDER_SET"]);
const WIDGET_KEYS = new Set(["agenda", "speakers", "forms", "qa", "map", "b2b", "sponsors", "program", "profile", "home", "game"]);

type SessionRow = PortalSessionRow;

// ── OYUNLAŞTIRMA PUAN MOTORU ──
// Kullanıcı isteği: "Mobil Portal için mobil app gamification alanları düşünülsün
// modullerdeki formlar ile etkileşimli olsun."
// • Puan kuralları EventPortalConfig.gameConfigJson'tan okunur (gameEnabled kapalıysa no-op).
// • FORM_SUBMIT / B2B_ACCEPT: ref başına TEK sefer; QA_SUBMIT: qaCap (varsayılan 5) tavana kadar.
// • Hata asla ana aksiyonu bozmaz — puanlama fire-and-forget güvenli.
async function awardGamePoints(
  editionId: string,
  session: SessionRow,
  action: "FORM_SUBMIT" | "QA_SUBMIT" | "B2B_ACCEPT",
  refId: string,
): Promise<{ awarded: number; total: number } | null> {
  try {
    const config = await db.eventPortalConfig.findUnique({
      where: { editionId },
      select: { gameEnabled: true, gameConfigJson: true },
    });
    if (!config?.gameEnabled) return null;
    let pointsCfg: Record<string, number> = { FORM_SUBMIT: 20, QA_SUBMIT: 10, B2B_ACCEPT: 15 };
    let qaCap = 5;
    if (config.gameConfigJson) {
      try {
        const p = JSON.parse(config.gameConfigJson) as { points?: Record<string, number>; qaCap?: number };
        if (p.points && typeof p.points === "object") pointsCfg = { ...pointsCfg, ...p.points };
        if (Number.isFinite(p.qaCap)) qaCap = Math.max(1, Math.min(50, Math.round(Number(p.qaCap))));
      } catch {
        /* bozuk json → varsayılan */
      }
    }
    const gain = Math.round(pointsCfg[action] ?? 0);
    const existing = await db.portalGameProgress.findUnique({
      where: { editionId_sessionId: { editionId, sessionId: session.id } },
    });
    const actions = (existing?.actionsJson ? (JSON.parse(existing.actionsJson) as Record<string, number>) : {});
    let nextActions: Record<string, number>;
    if (action === "QA_SUBMIT") {
      const count = Number(actions["QA_SUBMIT"] ?? 0);
      if (count >= qaCap) return { awarded: 0, total: existing?.points ?? 0 };
      nextActions = { ...actions, QA_SUBMIT: count + 1 };
    } else {
      const key = `${action}:${refId}`;
      if (actions[key]) return { awarded: 0, total: existing?.points ?? 0 };
      nextActions = { ...actions, [key]: 1 };
    }
    if (gain <= 0) return { awarded: 0, total: existing?.points ?? 0 };
    const personId = session.kind === "AUTH" ? session.personId : null;
    if (existing) {
      const total = existing.points + gain;
      await db.portalGameProgress.update({
        where: { id: existing.id },
        data: { points: total, actionsJson: JSON.stringify(nextActions), ...(personId ? { personId } : {}) },
      });
      return { awarded: gain, total };
    }
    await db.portalGameProgress.create({
      data: { editionId, sessionId: session.id, personId, points: gain, actionsJson: JSON.stringify(nextActions) },
    });
    return { awarded: gain, total: gain };
  } catch {
    return null; // puanlama hatası ana akışı bozmaz
  }
}

export async function POST(req: NextRequest) {
  const denied = enforceRateLimit(req, { key: "portal-interact", limit: 90, windowMs: 60_000 });
  if (denied) return denied;
  try {
    const raw = extractSession(req);
    if (!raw) return NextResponse.json({ error: "Oturum gerekli" }, { status: 401 });
    const check = await validatePortalSession(raw);
    if (!check.ok) {
      return NextResponse.json(
        { error: "Oturum geçersiz veya süresi dolmuş" },
        { status: check.reason === "UNKNOWN" ? 404 : 410 },
      );
    }
    const session = check.session;
    touchSession(session.id);
    const editionId = session.editionId;

    const body = (await req.json()) as {
      action?: string;
      widgetKey?: string;
      programSessionId?: string;
      body?: string;
      isAnonymous?: boolean;
      displayName?: string;
      assignmentId?: string;
      response?: string; // ACCEPTED | DECLINED | RESCHEDULE
      note?: string;
      formId?: string; // FORM_SUBMIT puanı için
    };
    const action = (body.action ?? "").toUpperCase();

    // ── analitik izleri (§4.3) ──
    if (LOG_KINDS.has(action)) {
      // VISIT günlük tekilleştirilir — tekil kullanıcı erişimi doğru ölçülür
      if (action === "VISIT") {
        const dayStart = new Date();
        dayStart.setHours(0, 0, 0, 0);
        const existing = await db.portalAnalyticsLog.findFirst({
          where: { sessionId: session.id, kind: "VISIT", createdAt: { gte: dayStart } },
          select: { id: true },
        });
        if (existing) return NextResponse.json({ ok: true, deduped: true });
      }
      await db.portalAnalyticsLog.create({
        data: {
          editionId,
          sessionId: session.id,
          kind: action,
          widgetKey: action === "WIDGET_CLICK" && body.widgetKey && WIDGET_KEYS.has(body.widgetKey) ? body.widgetKey : null,
        },
      });
      return NextResponse.json({ ok: true });
    }

    // ── Q&A soru gönderimi (§3.2) ──
    if (action === "QA_SUBMIT") {
      const text = (body.body ?? "").trim();
      if (text.length < 5 || text.length > 500) {
        return NextResponse.json({ error: "Soru 5-500 karakter arasında olmalı" }, { status: 400 });
      }
      if (body.programSessionId) {
        const target = await db.programSession.findUnique({
          where: { id: body.programSessionId },
          select: { editionId: true },
        });
        if (!target || target.editionId !== editionId) {
          return NextResponse.json({ error: "Oturum bulunamadı" }, { status: 404 });
        }
      }
      const isAuth = session.kind === "AUTH" && session.personId;
      let displayName: string | null = null;
      if (isAuth && !body.isAnonymous) {
        const person = await db.person.findUnique({
          where: { id: session.personId! },
          select: { firstName: true, lastName: true },
        });
        displayName = person ? `${person.firstName} ${person.lastName}` : null;
      } else if (!body.isAnonymous && body.displayName) {
        displayName = body.displayName.trim().slice(0, 80) || null;
      }
      const question = await db.portalQuestion.create({
        data: {
          editionId,
          sessionId: session.id,
          programSessionId: body.programSessionId ?? null,
          body: text,
          displayName,
          isAnonymous: Boolean(body.isAnonymous) || !displayName,
        },
        select: { id: true },
      });
      await db.portalAnalyticsLog.create({
        data: { editionId, sessionId: session.id, kind: "QA_SUBMIT" },
      });
      const game = await awardGamePoints(editionId, session, "QA_SUBMIT", question.id);
      return NextResponse.json({ ok: true, id: question.id, game }, { status: 201 });
    }

    // ── OYUNLAŞTIRMA: form gönderimi puanı (form edisyona ait + isPublic doğrulanır) ──
    if (action === "FORM_SUBMIT") {
      const formId = (body.formId ?? "").trim();
      if (!formId) return NextResponse.json({ error: "formId zorunlu" }, { status: 400 });
      const form = await db.formDefinition.findFirst({
        where: { OR: [{ id: formId }, { slug: formId }], editionId, isPublic: true },
        select: { id: true },
      });
      if (!form) return NextResponse.json({ error: "Form bulunamadı" }, { status: 404 });
      await db.portalAnalyticsLog.create({
        data: { editionId, sessionId: session.id, kind: "FORM_SUBMIT", meta: form.id },
      });
      const game = await awardGamePoints(editionId, session, "FORM_SUBMIT", form.id);
      return NextResponse.json({ ok: true, game });
    }

    // ── B2B yanıtı (§4.1) — yalnız AUTH + kendi ataması ──
    if (action === "B2B_RESPOND") {
      if (session.kind !== "AUTH" || !session.personId) {
        return NextResponse.json({ error: "B2B modülü yalnız kayıtlı katılımcılara açıktır" }, { status: 403 });
      }
      const assignmentId = body.assignmentId ?? "";
      const response = (body.response ?? "").toUpperCase();
      if (!["ACCEPTED", "DECLINED", "RESCHEDULE"].includes(response)) {
        return NextResponse.json({ error: "response ACCEPTED|DECLINED|RESCHEDULE olmalı" }, { status: 400 });
      }
      const assignment = await db.b2bAssignment.findUnique({
        where: { id: assignmentId },
        include: { plan: { select: { editionId: true, subject: true } } },
      });
      // çapraz-edisyon/çapraz-kişi erişimi kapalı (IDOR/BOLA)
      if (!assignment || assignment.plan.editionId !== editionId || assignment.personId !== session.personId) {
        return NextResponse.json({ error: "Randevu bulunamadı" }, { status: 404 });
      }
      const now = new Date();
      if (response === "ACCEPTED") {
        await db.b2bAssignment.update({
          where: { id: assignmentId },
          data: { status: "ACCEPTED", personApproved: true, respondedAt: now },
        });
      } else if (response === "DECLINED") {
        await db.b2bAssignment.update({
          where: { id: assignmentId },
          data: { status: "DECLINED", personApproved: false, respondedAt: now },
        });
      } else {
        // RESCHEDULE — zaman talebi notu; onay akışı organizatörde kalır
        const note = (body.note ?? "").trim().slice(0, 300);
        await db.b2bAssignment.update({
          where: { id: assignmentId },
          data: {
            feedback: `Zaman talebi${note ? `: ${note}` : ""}`,
            respondedAt: now,
          },
        });
      }
      await db.portalAnalyticsLog.create({
        data: { editionId, sessionId: session.id, kind: "B2B_ACTION", meta: response },
      });
      const game = response === "ACCEPTED" ? await awardGamePoints(editionId, session, "B2B_ACCEPT", assignmentId) : null;
      return NextResponse.json({ ok: true, game });
    }

    return NextResponse.json({ error: "Bilinmeyen aksiyon" }, { status: 400 });
  } catch (err) {
    console.error("portal/interact error:", err);
    return NextResponse.json({ error: "İşlem gerçekleştirilemedi" }, { status: 500 });
  }
}
