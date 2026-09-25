// DIŞ BİLDİRİM KANALI API — WhatsApp (şirket mobil telefonu) + SMS yapılandırması
// GET  : edisyonun kanal yapılandırması (sırlar DAİMA maskeli; cipher ham ASLA dönmez)
// PUT  : kanal kaydet/upsert — token "" veya null gelirse DEĞİŞMEZ (maske-koruma),
//        "__CLEAR__" gelirse silinir; token verilirse AES-256-GCM şifrelenir.
// Yetki: requireAdmin + resolveEditionContext (kiracı/edisyon bağlamı — IDOR kapalı)
// Kapsülleme: yalnız NotificationChannelConfig tablosuna yazar — ana tablolar DOKUNULMAZ.
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { resolveEditionContext, GuardError } from "@/lib/api/tenant-guard";
import { enforceRateLimit } from "@/lib/rate-limit";
import { requireAdmin } from "@/lib/auth/request-context";
import { encryptSecret } from "@/lib/secrets";

export const dynamic = "force-dynamic";

function guardJson(e: unknown) {
  if (e instanceof GuardError) return NextResponse.json({ error: e.message }, { status: e.status });
  return null;
}

const WA_PROVIDERS = new Set(["META_CLOUD", "TWILIO", "ULTRAMSG", "WAHA", "GENERIC_WEBHOOK", "DEMO"]);
const SMS_PROVIDERS = new Set(["TWILIO", "NETGSM", "ILETIMERKEZI", "VERIMOR", "GENERIC_WEBHOOK", "DEMO"]);

function optStr(v: unknown, max = 300): string | null | undefined {
  if (v === undefined) return undefined;
  if (v === null || v === "") return null;
  return String(v).trim().slice(0, max) || null;
}

function maskCipher(cipher: string | null): string | null {
  return cipher ? "••••••••" : null;
}

export async function GET(req: NextRequest) {
  const gate = await requireAdmin();
  if (gate) return gate;
  try {
    const denied = enforceRateLimit(req, { key: "notify-channels-read", limit: 60, windowMs: 60_000 });
    if (denied) return denied;
    const editionId = req.nextUrl.searchParams.get("editionId");
    const ctx = await resolveEditionContext(editionId, { required: true });
    const eid = ctx.editionId as string;
    const cfg = await db.notificationChannelConfig.upsert({
      where: { editionId: eid },
      create: { editionId: eid },
      update: {},
    });
    // sır YOK — yalnız maske ipucu + var/yok bilgisi
    return NextResponse.json({
      config: {
        ...cfg,
        waTokenCipher: maskCipher(cfg.waTokenCipher),
        smsTokenCipher: maskCipher(cfg.smsTokenCipher),
      },
      hasWaToken: Boolean(cfg.waTokenCipher),
      hasSmsToken: Boolean(cfg.smsTokenCipher),
    });
  } catch (e) {
    const ge = guardJson(e);
    if (ge) return ge;
    console.error("notify/channels GET:", e);
    return NextResponse.json({ error: "Kanal yapılandırması alınamadı" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const gate = await requireAdmin();
  if (gate) return gate;
  try {
    const denied = enforceRateLimit(req, { key: "notify-channels-write", limit: 30, windowMs: 60_000 });
    if (denied) return denied;
    const body = (await req.json()) as Record<string, unknown>;
    if (!body.editionId) return NextResponse.json({ error: "editionId zorunlu" }, { status: 400 });
    const ctx = await resolveEditionContext(String(body.editionId), { required: true });
    const eid = ctx.editionId as string;

    const data: Record<string, unknown> = {};
    if (body.channelsEnabled !== undefined) data.channelsEnabled = Boolean(body.channelsEnabled);
    if (body.waEnabled !== undefined) data.waEnabled = Boolean(body.waEnabled);
    const waProvider = optStr(body.waProvider, 40);
    if (waProvider !== undefined && waProvider !== null && !WA_PROVIDERS.has(waProvider)) {
      return NextResponse.json({ error: "Geçersiz WhatsApp sağlayıcısı" }, { status: 400 });
    }
    if (waProvider !== undefined) data.waProvider = waProvider;
    for (const k of ["waEndpoint", "waPhoneId", "waAccountId"] as const) {
      const v = optStr(body[k], 300);
      if (v !== undefined) data[k] = v;
    }
    const waFrom = optStr(body.waFrom, 20);
    if (waFrom !== undefined) data.waFrom = waFrom ? waFrom.replace(/[^\d+]/g, "").slice(0, 16) : null;
    // token üç durumlu: undefined → dokunma · "__CLEAR__" → sil · değer → şifrele
    if (body.waToken === "__CLEAR__") data.waTokenCipher = null;
    else if (typeof body.waToken === "string" && body.waToken.trim() && !body.waToken.includes("••")) {
      data.waTokenCipher = encryptSecret(body.waToken.trim().slice(0, 500));
    }

    if (body.smsEnabled !== undefined) data.smsEnabled = Boolean(body.smsEnabled);
    const smsProvider = optStr(body.smsProvider, 40);
    if (smsProvider !== undefined && smsProvider !== null && !SMS_PROVIDERS.has(smsProvider)) {
      return NextResponse.json({ error: "Geçersiz SMS sağlayıcısı" }, { status: 400 });
    }
    if (smsProvider !== undefined) data.smsProvider = smsProvider;
    for (const k of ["smsEndpoint", "smsAccountId", "smsFrom"] as const) {
      const v = optStr(body[k], k === "smsEndpoint" ? 300 : 60);
      if (v !== undefined) data[k] = v;
    }
    if (body.smsSenderId !== undefined) {
      data.smsSenderId = body.smsSenderId ? String(body.smsSenderId).trim().slice(0, 11) || null : null; // alfebetik başlık tavanı
    }
    if (body.smsToken === "__CLEAR__") data.smsTokenCipher = null;
    else if (typeof body.smsToken === "string" && body.smsToken.trim() && !body.smsToken.includes("••")) {
      data.smsTokenCipher = encryptSecret(body.smsToken.trim().slice(0, 500));
    }

    // olay-yönlendirme matrisi — bilinen anahtarlarla sınırlı
    if (body.events !== undefined && body.events !== null && typeof body.events === "object" && !Array.isArray(body.events)) {
      const allowed = ["announcement", "b2b", "reminder", "magicLink"];
      const raw = body.events as Record<string, unknown>;
      data.eventsJson = JSON.stringify(Object.fromEntries(allowed.map((k) => [k, Boolean(raw[k])])));
    }

    const cfg = await db.notificationChannelConfig.upsert({
      where: { editionId: eid },
      create: { editionId: eid, ...data },
      update: data,
    });
    await db.activityLog.create({
      data: {
        editionId: eid,
        type: "NOTIFICATION_CHANNEL_SAVED",
        message: `Bildirim kanalları güncellendi — WhatsApp: ${cfg.waEnabled ? cfg.waProvider ?? "açık" : "kapalı"}, SMS: ${cfg.smsEnabled ? cfg.smsProvider ?? "açık" : "kapalı"}`,
        entityType: "notification-channel",
        entityId: cfg.id,
        actorName: "Yönetici",
      },
    });
    return NextResponse.json({ config: { ...cfg, waTokenCipher: maskCipher(cfg.waTokenCipher), smsTokenCipher: maskCipher(cfg.smsTokenCipher) } });
  } catch (e) {
    const ge = guardJson(e);
    if (ge) return ge;
    console.error("notify/channels PUT:", e);
    return NextResponse.json({ error: "Kanal yapılandırması kaydedilemedi" }, { status: 400 });
  }
}
