// /api/payments/iyzico/create — TASK-B 28: hosted checkout başlatma (sandbox)
// Sipariş + kalan bakiyeye göre PENDING Payment satırı (source IYZICO) açar; iyzico
// Checkout Form token'ını referans olarak yazar. Kimlik bilgisi yoksa 503 (yapılandırma
// hatası — akış bozulmaz, manuel teyit yolu açık kalır).
// NOT: canlı merchant HARİCİ adım — bu uç yalnız sandbox'a konuşur (takip sırası kilitli).
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { initCheckoutForm, iyzicoConfigured } from "@/lib/iyzico";
import { resolveContext } from "@/lib/api/tenant-guard";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  if (!iyzicoConfigured()) {
    return NextResponse.json(
      { error: "iyzico sandbox yapılandırılmadı — IYZICO_API_KEY / IYZICO_SECRET env gerekli" },
      { status: 503 },
    );
  }
  try {
    const body = (await req.json()) as { orderId?: string };
    if (!body.orderId) return NextResponse.json({ error: "orderId zorunlu" }, { status: 422 });

    const tenantId = await resolveContext(null);
    const order = await db.order.findUnique({
      where: { id: body.orderId },
      include: { edition: { select: { tenantId: true } }, payments: true },
    });
    // BOLA kapısı: yabancı kiracın siparişi 404 (varlık ifşa edilmez)
    if (!order || order.edition.tenantId !== tenantId) {
      return NextResponse.json({ error: "Sipariş bulunamadı" }, { status: 404 });
    }

    const paid = order.payments.filter((p) => p.status === "SUCCEEDED").reduce((s, p) => s + p.amount, 0);
    const remaining = Math.max(0, order.totalAmount - paid);
    if (remaining <= 0) return NextResponse.json({ error: "Sipariş zaten kapandı" }, { status: 409 });

    const payment = await db.payment.create({
      data: { orderId: order.id, amount: remaining, currency: order.currency, source: "ONLINE_CARD", status: "PENDING" },
    });

    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "127.0.0.1";
    const originBase = process.env.MAVEN_ORIGIN ?? req.nextUrl.origin;
    // Kimlik kuralı 4: payerName siparişi ödeyendir (katılımcı ≠ ödeyen) — asgari şablon
    const nameParts = (order.payerName ?? "Misafir").split(" ");
    const init = await initCheckoutForm({
      conversationId: payment.id,
      priceMinor: remaining,
      paidPriceMinor: remaining,
      buyerName: nameParts[0] ?? "Misafir",
      buyerSurname: nameParts.slice(1).join(" ") || "Katılımcı",
      buyerEmail: "guest@maven.local", // KVKK asgari veri — gerçek PII iyzico'ya gönderilmez
      buyerIp: ip,
      callbackUrl: `${originBase}/api/payments/iyzico/callback`,
      description: `Etkinlik siparişi ${order.orderNo}`,
    });
    if (!init.ok || !init.token) {
      await db.payment.update({ where: { id: payment.id }, data: { status: "FAILED", reason: init.error?.slice(0, 200) ?? "init hatası" } });
      return NextResponse.json({ error: init.error ?? "checkout başlatılamadı" }, { status: 502 });
    }
    await db.payment.update({ where: { id: payment.id }, data: { reference: init.token } });
    return NextResponse.json({ ok: true, paymentId: payment.id, token: init.token, paymentPageUrl: init.paymentPageUrl }, { status: 201 });
  } catch (e) {
    console.error("POST /api/payments/iyzico/create", e);
    return NextResponse.json({ error: "Checkout başlatılamadı" }, { status: 500 });
  }
}
