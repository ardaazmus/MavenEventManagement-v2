// /api/notifications/instant — ANLIK BİLDİRİM (program değişikliği vb.)
// Etkinlik sırasında (veya öncesi/sonrası) duyurulması gereken olayları TEK veya
// TOPLU alıcıya e-posta/SMS/WhatsApp'tan gönderir; gönderimi aşama hiyerarşisinde
// kampanya olarak arşivler; seçilirse portal duyurusu da açar.
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { instantBroadcast, BroadcastError, BROADCAST_CHANNELS, type BroadcastChannel, type InstantAudienceMode } from "@/lib/api/comms-broadcast";
import { verifyEditionTenant, GuardError } from "@/lib/api/tenant-guard";
import { requestActor, requireStaff } from "@/lib/auth/request-context";
import { enforceRateLimit } from "@/lib/rate-limit";

const AUDIENCE_MODES: readonly string[] = ["ALL_PARTICIPANTS", "CATEGORY", "CUSTOMERS", "CUSTOM", "SINGLE"];
const PHASES: readonly string[] = ["PRE_EVENT", "DURING_EVENT", "POST_EVENT"];

export async function POST(req: NextRequest) {
  const denied = enforceRateLimit(req, { key: "instant-broadcast", limit: 20, windowMs: 60_000 });
  if (denied) return denied;
  const staffGate = await requireStaff();
  if (staffGate) return staffGate;

  try {
    const body = (await req.json()) as Record<string, unknown>;
    const editionId = typeof body.editionId === "string" ? body.editionId : "";
    if (!editionId) return NextResponse.json({ error: "editionId zorunludur" }, { status: 400 });
    try {
      await verifyEditionTenant(editionId);
    } catch (e) {
      if (e instanceof GuardError) return NextResponse.json({ error: e.message }, { status: e.status });
      throw e;
    }

    const phase = typeof body.phase === "string" && PHASES.includes(body.phase) ? body.phase : "DURING_EVENT";
    const title = typeof body.title === "string" ? body.title.trim() : "";
    const text = typeof body.body === "string" ? body.body.trim() : "";
    if (!title) return NextResponse.json({ error: "Başlık zorunludur" }, { status: 400 });
    if (!text) return NextResponse.json({ error: "Mesaj gövdesi zorunludur" }, { status: 400 });

    const channels = Array.isArray(body.channels)
      ? [...new Set((body.channels as unknown[]).filter((v): v is BroadcastChannel => typeof v === "string" && (BROADCAST_CHANNELS as readonly string[]).includes(v)))]
      : [];
    if (channels.length === 0) return NextResponse.json({ error: "En az bir kanal seçilmelidir" }, { status: 400 });

    const audienceMode = typeof body.audienceMode === "string" && AUDIENCE_MODES.includes(body.audienceMode)
      ? (body.audienceMode as InstantAudienceMode)
      : "ALL_PARTICIPANTS";
    if (audienceMode === "CUSTOM" && !(typeof body.customRecipients === "string" && body.customRecipients.trim())) {
      return NextResponse.json({ error: "Özel alıcı listesi zorunludur" }, { status: 400 });
    }
    if (audienceMode === "SINGLE") {
      const s = (body.single ?? {}) as Record<string, unknown>;
      const hasEmail = typeof s.email === "string" && s.email.trim();
      const hasPhone = typeof s.phone === "string" && s.phone.trim();
      if (!hasEmail && !hasPhone) return NextResponse.json({ error: "Tekil alıcı için e-posta veya telefon zorunludur" }, { status: 400 });
    }

    const actor = await requestActor();
    let actorName = "Yönetici";
    if (actor) {
      const u = await db.user.findUnique({ where: { id: actor.uid }, select: { name: true } });
      actorName = u?.name ?? actor.role;
    }

    const result = await instantBroadcast({
      editionId,
      phase,
      title,
      body: text,
      channels,
      audienceMode,
      categoryIds: Array.isArray(body.categoryIds) ? (body.categoryIds as unknown[]).filter((v): v is string => typeof v === "string") : undefined,
      contactIds: Array.isArray(body.contactIds) ? (body.contactIds as unknown[]).filter((v): v is string => typeof v === "string") : undefined,
      customRecipients: typeof body.customRecipients === "string" ? body.customRecipients : null,
      single: body.single && typeof body.single === "object"
        ? {
            name: typeof (body.single as Record<string, unknown>).name === "string" ? (body.single as Record<string, unknown>).name as string : null,
            email: typeof (body.single as Record<string, unknown>).email === "string" ? (body.single as Record<string, unknown>).email as string : null,
            phone: typeof (body.single as Record<string, unknown>).phone === "string" ? (body.single as Record<string, unknown>).phone as string : null,
          }
        : null,
      createPortalAnnouncement: body.createPortalAnnouncement === true,
      actorName,
    });
    return NextResponse.json(result, { status: 200 });
  } catch (e) {
    if (e instanceof BroadcastError) {
      const status = e.code === "EDITION_NOT_FOUND" ? 404 : e.code === "VALIDATION" || e.code === "EMPTY_AUDIENCE" ? 400 : 409;
      return NextResponse.json({ error: e.message, code: e.code }, { status });
    }
    console.error("POST /api/notifications/instant", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Anlık bildirim gönderilemedi" }, { status: 500 });
  }
}
