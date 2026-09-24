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

    const result = await retrieveCheckoutResult(token, payment.id);
    const succeeded = result.ok && result.paymentStatus === "SUCCESS";
    const updated = await db.payment.update({
      where: { id: payment.id },
      data: {
        status: succeeded ? "SUCCEEDED" : "FAILED",
        paidAt: succeeded ? new Date() : null,
        reason: succeeded ? null : (result.error ?? "iyzico ödemesi başarısız"),
      },
    });
    await db.activityLog.create({
      data: {
        tenantId: null, editionId: null,
        type: succeeded ? ActivityType.PAYMENT_RECEIVED : "OTHER",
        message: `iyzico ödemesi ${succeeded ? "onaylandı" : "başarısız"} — referans maskeli: ${token.slice(0, 4)}…`,
        entityType: "Payment", entityId: updated.id, actorName: "iyzico",
      },
    }).catch(() => undefined);
    return NextResponse.json({ ok: true, status: updated.status });
  } catch (e) {
    console.error("POST /api/payments/iyzico/callback", e);
    return NextResponse.json({ error: "Geri çağrım işlenemedi" }, { status: 500 });
  }
}
