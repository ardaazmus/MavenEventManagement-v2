// Online ödeme simülasyonu — kayıt muhasebesi ödeme akışı
// POST /api/payments/[id]/process  { cardHolder, cardNumber, expiry, cvc }
// Kurallar (test): kart no 12-19 hane; "0000" ile biterse banka reddi (FAILED); aksi SUCCEEDED.
// SUCCEEDED → order bakiyesi yeniden hesaplanır (OPEN / PARTIALLY_PAID / PAID) + aktivite günlüğü.
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ensureInScope } from "@/lib/api/tenant-guard";
import { requireStaff } from "@/lib/auth/request-context";
import { ActivityType } from "@/lib/api/activity";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  // P2 (yeni-fazlar 7): ham PAN/CVC kabul eden uç SİMÜLASYONDUR — üretim/üretim-benzeri
  // ortamda KAPALI (fail-closed 503). Ham kart verisi asla saklanmaz/loglanmaz
  // (yalnız son-4 hane maskeli aktivite mesajında).
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Kart simülasyonu yalnız test ortamındadır" }, { status: 503 });
  }
  // N-08 rol kapısı — envanter iddiasıyla uyum (auth-off'ta null, davranış korunur).
  const staffGate = await requireStaff();
  if (staffGate) return staffGate;
  try {
    const { id } = await params;
    const body = (await req.json()) as {
      cardHolder?: string;
      cardNumber?: string;
      expiry?: string;
      cvc?: string;
    };

    // G0-a: ödeme işlemi zinciri (order → edition) üzerinden kapsam kontrolü —
    // başka kiracının sipariş ödemesi işlenemez (IDOR 404)
    const scoped = await ensureInScope("payments", id);
    if (!scoped.ok) return NextResponse.json({ error: scoped.error }, { status: scoped.status });

    const payment = await db.payment.findUnique({ where: { id }, include: { order: true } });
    if (!payment) return NextResponse.json({ error: "Ödeme bulunamadı" }, { status: 404 });
    if (payment.status === "SUCCEEDED") {
      return NextResponse.json({ error: "Bu ödeme zaten tahsil edildi" }, { status: 409 });
    }
    if (payment.status === "FAILED" || payment.status === "PENDING") {
      /* devam */
    }

    const cardNo = (body.cardNumber ?? "").replace(/\D/g, "");
    if (!body.cardHolder?.trim()) return NextResponse.json({ error: "Kart üzerindeki isim zorunlu" }, { status: 422 });
    if (cardNo.length < 12 || cardNo.length > 19) {
      return NextResponse.json({ error: "Kart numarası 12-19 hane olmalı" }, { status: 422 });
    }
    if (!/^\d{2}\/?\d{2}$/.test((body.expiry ?? "").replace(" ", ""))) {
      return NextResponse.json({ error: "Son kullanma tarihi AA/YY biçiminde olmalı" }, { status: 422 });
    }
    if (!/^\d{3,4}$/.test(body.cvc ?? "")) {
      return NextResponse.json({ error: "CVC 3-4 haneli olmalı" }, { status: 422 });
    }

    // Banka simülasyonu: 0000 ile biten kartlar reddedilir
    const declined = cardNo.endsWith("0000");

    if (declined) {
      const failed = await db.payment.update({
        where: { id },
        data: { status: "FAILED", reference: `DEC-${Date.now().toString(36).toUpperCase()}` },
      });
      await db.activityLog.create({
        data: {
          editionId: payment.order.editionId,
          type: ActivityType.PAYMENT_SAVED,
          message: `Online ödeme reddedildi: ${payment.amount} ${payment.currency} — kart **${cardNo.slice(-4)}`,
          entityType: "Payment",
          entityId: id,
          actorName: "Sanal POS",
        },
      });
      return NextResponse.json({
        payment: failed,
        outcome: "FAILED",
        message: "Banka işlemi reddetti (test kuralı: **0000 ile biten kartlar)",
      });
    }

    // Başarılı tahsilat
    const succeeded = await db.payment.update({
      where: { id },
      data: {
        status: "SUCCEEDED",
        paidAt: new Date(),
        reference: `TR-${Date.now().toString(36).toUpperCase()}`,
      },
    });

    // Sipariş bakiyesi: toplam başarılı ödeme ≥ tutar → PAID
    const orderPayments = await db.payment.findMany({ where: { orderId: payment.orderId } });
    const paid = orderPayments.filter((p) => p.status === "SUCCEEDED").reduce((a, p) => a + p.amount, 0);
    const orderStatus = paid >= payment.order.totalAmount ? "PAID" : paid > 0 ? "PARTIALLY_PAID" : "OPEN";
    const order = await db.order.update({
      where: { id: payment.orderId },
      data: { status: orderStatus },
    });

    await db.activityLog.create({
      data: {
        editionId: payment.order.editionId,
        type: ActivityType.PAYMENT_RECEIVED,
        message: `Online ödeme tahsil edildi: ${payment.amount} ${payment.currency} (ref ${succeeded.reference})`,
        entityType: "Payment",
        entityId: id,
        actorName: "Sanal POS",
      },
    });

    return NextResponse.json({
      payment: succeeded,
      order,
      outcome: "SUCCEEDED",
      message: `${payment.amount} ${payment.currency} tahsil edildi — referans ${succeeded.reference}`,
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Ödeme başarısız" }, { status: 500 });
  }
}
