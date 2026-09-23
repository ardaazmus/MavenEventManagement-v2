// Dış portal aksiyonları — portal kullanıcısının (sponsor/katılımcı) Maven'e
// gönderdiği işlemler. Mimari ilke: dış portal ayrı uygulama, ortak kimlik;
// aksiyonlar Maven tarafındaki iş kurallarıyla çalışır ve aktiviteye düşer.
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ActivityType } from "@/lib/api/activity";

// Teslim gönderilebilir durumlar: sponsor henüz göndermedi veya düzeltme istendi
const SUBMITTABLE = ["NOT_STARTED", "WAITING_SPONSOR", "REJECTED"];

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { action?: string } & Record<string, unknown>;
    const { action } = body;

    // ── Sponsor portalı: teslim gönderimi ──────────────────────────────
    if (action === "deliverable-submit") {
      const { deliverableId, actor } = body as { deliverableId: string; actor?: string };
      const d = await db.deliverable.findUnique({ where: { id: deliverableId }, include: { agreement: { include: { organization: true, edition: true } } } });
      if (!d) return NextResponse.json({ error: "Teslim bulunamadı" }, { status: 404 });
      if (!SUBMITTABLE.includes(d.status)) {
        return NextResponse.json({ error: `Teslim ${d.status} durumunda — gönderim uygun değil` }, { status: 409 });
      }
      const updated = await db.deliverable.update({ where: { id: d.id }, data: { status: "SUBMITTED" } });
      await db.activityLog.create({
        data: {
          type: ActivityType.DELIVERABLE_SAVED,
          editionId: d.agreement.editionId,
          message: `Portal: teslim gönderildi — ${d.name} (${d.agreement.organization?.name ?? "Sponsor"}) · incelemeye alındı`,
          entityType: "Deliverable", entityId: d.id,
          actorName: actor ?? `Sponsor Portalı — ${d.agreement.organization?.name ?? ""}`,
        },
      });
      return NextResponse.json({ ok: true, deliverable: updated });
    }

    // ── Katılımcı/sponsor portalı: ödeme bağlantısı üretimi (simülasyon) ──
    if (action === "payment-link") {
      const { orderId, actor } = body as { orderId: string; actor?: string };
      const order = await db.order.findUnique({ where: { id: orderId }, include: { payments: true, edition: true } });
      if (!order) return NextResponse.json({ error: "Sipariş bulunamadı" }, { status: 404 });
      if (order.status === "CANCELLED") return NextResponse.json({ error: "İptal edilmiş siparişe ödeme bağlantısı üretilemez" }, { status: 409 });
      const succeeded = order.payments.filter((p) => p.status === "SUCCEEDED").reduce((s, p) => s + p.amount, 0);
      const remaining = Math.max(0, order.totalAmount - succeeded);
      if (remaining <= 0) return NextResponse.json({ error: "Siparişin açık bakiyesi yok" }, { status: 409 });

      const ref = `PAYLINK-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
      const payment = await db.payment.create({
        data: { orderId: order.id, amount: remaining, currency: order.currency, source: "PAYMENT_LINK", status: "PENDING", reference: ref },
      });
      await db.activityLog.create({
        data: {
          type: ActivityType.PAYMENT_SAVED,
          editionId: order.editionId,
          message: `Portal: ödeme bağlantısı üretildi — ${order.orderNo} · ${(remaining).toLocaleString("tr-TR")} ${order.currency} (${ref})`,
          entityType: "Order", entityId: order.id,
          actorName: actor ?? "Katılımcı Portalı",
        },
      });
      return NextResponse.json({ ok: true, payment, link: `https://odeme.maven.events/${ref}` });
    }

    return NextResponse.json({ error: `Bilinmeyen aksiyon: ${action ?? "?"}` }, { status: 400 });
  } catch (err) {
    console.error("portal/action error:", err);
    return NextResponse.json({ error: "Portal aksiyonu başarısız" }, { status: 500 });
  }
}
