// PWA Katılımcı Dış Portalı — CANLI DUYU AKIŞI (§5.4 Canlı Duyuru Paneli istemci ucu)
// Portal istemcisi 20 sn'de bir bu uca since= ile bakar; yeni duyuru varsa uygulama
// içi banner + (izin varsa) sistem bildirimi gösterir. Hedef kitle oturum türüne
// göre filtrelenir; oturum zorunludur (düzenleyici duyurusu — giriş öncesi ifşa yok).
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { enforceRateLimit } from "@/lib/rate-limit";
import { extractSession, validatePortalSession } from "@/lib/api/portal-access";
import { requireAdmin } from "@/lib/auth/request-context";
import { resolveEditionContext, GuardError } from "@/lib/api/tenant-guard";

export const dynamic = "force-dynamic";

function guardJson(e: unknown) {
  if (e instanceof GuardError) return NextResponse.json({ error: e.message }, { status: e.status });
  return null;
}

// ── ADMIN: Canlı Duyuru Paneli (§5.4) — tüm aktif portal kullanıcısına anlık duyuru ──
export async function POST(req: NextRequest) {
  const gate = await requireAdmin();
  if (gate) return gate;
  try {
    const denied = enforceRateLimit(req, { key: "portal-announce-write", limit: 20, windowMs: 60_000 });
    if (denied) return denied;
    const body = (await req.json()) as {
      editionId?: string;
      title?: string;
      message?: string;
      level?: string;
      target?: string;
    };
    if (!body.editionId) return NextResponse.json({ error: "editionId zorunlu" }, { status: 400 });
    const ctx = await resolveEditionContext(body.editionId, { required: true });
    const eid = ctx.editionId as string;
    const title = (body.title ?? "").trim();
    const message = (body.message ?? "").trim();
    if (!title || !message) return NextResponse.json({ error: "Başlık ve mesaj zorunlu" }, { status: 400 });
    const level = ["INFO", "WARNING", "URGENT"].includes(body.level ?? "") ? body.level! : "INFO";
    const target = ["ALL", "AUTH", "GUEST"].includes(body.target ?? "") ? body.target! : "ALL";

    const created = await db.portalAnnouncement.create({
      data: { editionId: eid, title: title.slice(0, 120), message: message.slice(0, 500), level, target },
      select: { id: true, title: true, level: true, target: true, createdAt: true },
    });
    await db.activityLog.create({
      data: {
        editionId: eid,
        type: "PORTAL_ANNOUNCEMENT",
        message: `Canlı duyuru gönderildi: "${created.title}" (${created.level}/${created.target})`,
        entityType: "portal-announcement",
        entityId: created.id,
        actorName: "Yönetici",
      },
    });
    return NextResponse.json(created, { status: 201 });
  } catch (e) {
    const ge = guardJson(e);
    if (ge) return ge;
    console.error("portal/announcements POST:", e);
    return NextResponse.json({ error: "Duyuru gönderilemedi" }, { status: 400 });
  }
}

export async function GET(req: NextRequest) {
  const denied = enforceRateLimit(req, { key: "portal-announcements", limit: 120, windowMs: 60_000 });
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
    const sinceRaw = req.nextUrl.searchParams.get("since");
    const since = sinceRaw ? new Date(sinceRaw) : null;
    const kind = session.kind === "AUTH" ? "AUTH" : "GUEST";

    const items = await db.portalAnnouncement.findMany({
      where: {
        editionId: session.editionId,
        OR: [{ target: "ALL" }, { target: kind }],
        ...(since && !Number.isNaN(since.getTime()) ? { createdAt: { gt: since } } : {}),
      },
      select: { id: true, title: true, message: true, level: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: 10,
    });
    return NextResponse.json({ items, serverTime: new Date().toISOString() });
  } catch (err) {
    console.error("portal/announcements error:", err);
    return NextResponse.json({ error: "Duyurular alınamadı" }, { status: 500 });
  }
}
