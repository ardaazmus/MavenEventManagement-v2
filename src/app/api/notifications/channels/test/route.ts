// TEST GÖNDERİMİ — admin "WhatsApp/SMS test" butonu.
// Rota EKSİKTİ (UI + rapor + M14 testi vardı, uç yoktu → 404). Lib hazırdı
// (sendChannelTest: DEMO simüle, gerçek sağlayıcıya tek mesaj).
// Sözleşme: { editionId, channel: WHATSAPP|SMS, phone } → { ok, provider, status, detail }.
// Yan etki: IntegrationLog (channel:*) + lastTestAt/lastTestStatus damgası.
// Yetki: requireAdmin + resolveEditionContext; hız limiti sıkı (gerçek gönderim ücretli olabilir).
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { resolveEditionContext, GuardError } from "@/lib/api/tenant-guard";
import { enforceRateLimit } from "@/lib/rate-limit";
import { requireAdmin } from "@/lib/auth/request-context";
import { sendChannelTest } from "@/lib/notify";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const gate = await requireAdmin();
  if (gate) return gate;
  try {
    const denied = enforceRateLimit(req, { key: "notify-channels-test", limit: 10, windowMs: 60_000 });
    if (denied) return denied;
    const body = (await req.json()) as Record<string, unknown>;
    const channel = body.channel === "SMS" ? "SMS" : body.channel === "WHATSAPP" ? "WHATSAPP" : null;
    const phone = typeof body.phone === "string" ? body.phone : "";
    if (!body.editionId) return NextResponse.json({ error: "editionId zorunlu" }, { status: 400 });
    if (!channel) return NextResponse.json({ error: "channel WHATSAPP ya da SMS olmalı" }, { status: 400 });
    if (!phone.trim()) return NextResponse.json({ error: "Telefon numarası zorunlu" }, { status: 400 });
    const ctx = await resolveEditionContext(String(body.editionId), { required: true });
    const eid = ctx.editionId as string;

    const out = await sendChannelTest(eid, channel, phone);
    // "Son test" satırı — UI cfg.lastTestStatus'tan okur (M14 adım 5)
    await db.notificationChannelConfig.update({
      where: { editionId: eid },
      data: { lastTestAt: new Date(), lastTestStatus: `${channel} ${out.ok ? "OK" : "FAIL"} ${out.status}` },
    }).catch(() => undefined);
    return NextResponse.json(out, { status: 200 });
  } catch (e) {
    if (e instanceof GuardError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("notify/channels/test POST:", e);
    return NextResponse.json({ error: "Test gönderimi başarısız" }, { status: 500 });
  }
}
