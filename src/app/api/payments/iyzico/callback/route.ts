// /api/payments/iyzico/callback — TASK-B 28: iyzico Checkout Form dönüşü (public BY-DESIGN;
// middleware açık-yüzey listesinde). Sağlayıcı form-POST ile token gönderir; auth/detail ile
// DOĞRULANMIŞ sonuç alınır (istemci verisine asla güvenilmez) → Payment SUCCEEDED/FAILED.
// Sır/PII logda YOK. Oran: 30/dk/IP (S3 kapısı).
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { retrieveCheckoutResult } from "@/lib/iyzico";
import { enforceRateLimit } from "@/lib/rate-limit";
import { ActivityType } from "@/lib/api/activity";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const denied = enforceRateLimit(req, { key: "iyzico-callback", limit: 30, windowMs: 60_000 });
  if (denied) return denied;
  try {
    let token: string | undefined;
    const ct = req.headers.get("content-type") ?? "";
    if (ct.includes("application/json")) {
      const j = (await req.json()) as { token?: string };
      token = j.token;
    } else {
      const form = await req.formData();
      token = (form.get("token") as string | null) ?? undefined;
    }
    if (!token) return NextResponse.json({ error: "token gerekli" }, { status: 400 });

    const payment = await db.payment.findFirst({ where: { reference: token, source: "ONLINE_CARD" } });
    if (!payment) return NextResponse.json({ error: "Ödeme bulunamadı" }, { status: 404 });
    if (payment.status !== "PENDING") {
      return NextResponse.json({ ok: true, alreadyProcessed: true, status: payment.status }); // idempotent
    }

    let result: Awaited<ReturnType<typeof retrieveCheckoutResult>>;
    try {
      result = await retrieveCheckoutResult(token, payment.id);
    } catch (e) {
      // P2: sağlayıcı GEÇİCİ erişilemez → PENDING KORUNUR (yeniden callback denenebilir);
      // ne başarı ne kalıcı başarısızlık yazılmaz — finansal durum değişmez (fail-safe).
      console.error("iyzico callback sağlayıcı erişilemez", e instanceof Error ? e.message : e);
      return NextResponse.json({ error: "Sağlayıcı doğrulaması şu an yapılamıyor — ödeme beklemede" }, { status: 503 });
    }
    // P2 (yeni-fazlar 7): başarı YALNIZ sağlayıcı durumu + TUTAR + KUR üçlüsü doğrulanınca.
    // Sağlayıcı tutar/kur bilgisini vermezse DOĞRULANAMAZ → fail-closed (başarı yazılmaz).
    const amountOk = result.paidPriceMinor === payment.amount;
    const currencyOk = result.currency != null ? result.currency === payment.currency : false;
    const verified = result.ok && result.paymentStatus === "SUCCESS" && amountOk && currencyOk;
    if (result.ok && result.paymentStatus === "SUCCESS" && !(amountOk && currencyOk)) {
      console.error("iyzico callback tutar/kur uyuşmazlığı", { paymentId: payment.id, provider: result.paidPriceMinor, local: payment.amount });
    }

    // İdempotent geçiş: PENDING→SON-DURUM güncellemesi koşulludur; eşzamanlı tekrar
    // callback ikinci finansal hareket OLUŞTURMAZ (count 0 → zaten işlenmiş).
    const outcome = verified ? "SUCCEEDED" : "FAILED";
    const transition = await db.payment.updateMany({
      where: { id: payment.id, status: "PENDING" },
      data: {
        status: outcome,
        paidAt: verified ? new Date() : null,
        reason: verified ? null : (result.error ?? (result.ok && result.paymentStatus === "SUCCESS" ? "tutar/kur doğrulaması başarısız" : "iyzico ödemesi başarısız")),
      },
    });
    if (transition.count === 0) {
      return NextResponse.json({ ok: true, alreadyProcessed: true, status: payment.status });
    }
    const updated = await db.payment.findUnique({ where: { id: payment.id } });
    await db.activityLog.create({
      data: {
        tenantId: null, editionId: null,
        type: verified ? ActivityType.PAYMENT_RECEIVED : "OTHER",
        message: `iyzico ödemesi ${verified ? "onaylandı" : "başarısız"} — referans maskeli: ${token.slice(0, 4)}…`,
        entityType: "Payment", entityId: updated!.id, actorName: "iyzico",
      },
    }).catch(() => undefined);

    // P2: başarılı callback sonrası sipariş bakiyesi MEVCUT para mantığıyla yeniden
    // hesaplanır (idempotent — yalnız geçişi kazanan taraf çalıştırır).
    if (verified && updated) {
      const orderRow = await db.order.findUnique({ where: { id: payment.orderId }, include: { payments: true } });
      if (orderRow) {
        const paidSum = orderRow.payments.filter((p) => p.status === "SUCCEEDED").reduce((a, p) => a + p.amount, 0);
        const orderStatus = paidSum >= orderRow.totalAmount ? "PAID" : paidSum > 0 ? "PARTIALLY_PAID" : "OPEN";
        if (orderStatus !== orderRow.status) {
          await db.order.update({ where: { id: orderRow.id }, data: { status: orderStatus } });
        }
      }
    }
    return NextResponse.json({ ok: true, status: updated!.status });
  } catch (e) {
    console.error("POST /api/payments/iyzico/callback", e);
    return NextResponse.json({ error: "Geri çağrım işlenemedi" }, { status: 500 });
  }
}
