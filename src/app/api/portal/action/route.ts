// Dış portal aksiyonları — portal kullanıcısının (sponsor/katılımcı) Maven'e
// gönderdiği işlemler. Mimari ilke: dış portal ayrı uygulama, ortak kimlik;
// aksiyonlar Maven tarafındaki iş kurallarıyla çalışır ve aktiviteye düşer.
// G0-c: bu uç public-by-design olduğundan blanket kiracı bağlamı uygulanMAZ —
// her aksiyon, sahibine (teslim → sözleşme kurumu; sipariş → ödeyen) bağlı
// YETENEK BELİRTECİNE doğrulanır. Bilinmeyen/sahte belirteç → 404.
// TASK-A F1: belirteç artık PortalToken tablosunda sha256-hash ile doğrulanır —
//   sahte/bilinmeyen/süresi-geçmiş/iptal → 404 (aksiyonda durum ifşa edilmez,
//   fail-closed); kapsam + sahiplik (edisyon + kurum/kişi) belirteç satırından okunur.
// TODO-auth: portallar gerçek oturuma geçtiğinde belirteç oturum kapsamına taşınır.
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ActivityType } from "@/lib/api/activity";
import { enforceRateLimit, enforceRateLimitById } from "@/lib/rate-limit";
import { validatePortalToken } from "@/lib/api/portal-tokens";

// Teslim gönderilebilir durumlar: sponsor henüz göndermedi veya düzeltme istendi
const SUBMITTABLE = ["NOT_STARTED", "WAITING_SPONSOR", "REJECTED"];

// belirteç biçimi: pt_<en az 24 hex> — kaba biçim denetimi (sahte belirteç erkenden düşer)
function plausibleToken(t: unknown): t is string {
  return typeof t === "string" && /^pt_[0-9a-f]{24,64}$/.test(t);
}

export async function POST(req: NextRequest) {
  try {
  // S3: yetenek belirteci brute-force kapısı — 30 deneme/dk/IP
  const denied = enforceRateLimit(req, { key: "portal-action", limit: 30, windowMs: 60_000 });
  if (denied) return denied;

    const body = (await req.json()) as { action?: string; token?: unknown } & Record<string, unknown>;
    const { action, token } = body;
    if (!plausibleToken(token)) {
      return NextResponse.json({ error: "Erişim belirteci geçersiz" }, { status: 404 }); // varlık ifşa edilmez
    }
    // TASK-A F1: hash araması — bilinmeyen/süresi-geçmiş/iptal ayrımı AÇILMADAN düşürülür
    const check = await validatePortalToken(token);
    if (!check.ok) {
      return NextResponse.json({ error: "Erişim belirteci geçersiz" }, { status: 404 });
    }
    // TASK-A F10: ÇİFT KOVA — belirteç başına AYRI kova (güçlü belirteç denemesi IP rotasyonuyla gelse de sınırlanır)
    const deniedToken = enforceRateLimitById(req, { key: "portal-action", limit: 20, windowMs: 60_000, scopeId: check.token.tokenHash.slice(0, 16) });
    if (deniedToken) return deniedToken;
    const cap = check.token;

    // ── Sponsor portalı: teslim gönderimi ──────────────────────────────
    if (action === "deliverable-submit") {
      const { deliverableId, actor } = body as { deliverableId: string; actor?: string };
      const d = await db.deliverable.findUnique({ where: { id: deliverableId }, include: { agreement: { include: { organization: true, edition: true } } } });
      if (!d) return NextResponse.json({ error: "Teslim bulunamadı" }, { status: 404 });
      // G0-c: belirteç, teslimin SAHİBİ olan sözleşme kurumunun belirteci olmalı
      // (TASK-A F1: kapsam SPONSOR + aynı edisyon + aynı kurum — hash eşleşmesi zaten doğrulandı)
      if (cap.scope !== "SPONSOR" || cap.editionId !== d.agreement.editionId || cap.organizationId !== d.agreement.organizationId) {
        return NextResponse.json({ error: "Teslim bulunamadı" }, { status: 404 });
      }
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
      const order = await db.order.findUnique({
        where: { id: orderId },
        include: {
          payments: true, edition: true, buyerOrganization: true,
          lines: { include: { participation: { include: { person: true } } }, take: 1 },
        },
      });
      if (!order) return NextResponse.json({ error: "Sipariş bulunamadı" }, { status: 404 });
      // G0-c: belirteç, siparişin ÖDEYENİNE (kurumsal alıcı ya da satır katılımcısı) bağlı olmalı
      // TASK-A F1: kapsam + edisyon + ödeyen zinciri belirteç satırından doğrulanır
      const payerMatch =
        (cap.scope === "SPONSOR" && cap.editionId === order.editionId && cap.organizationId !== null && cap.organizationId === order.buyerOrganizationId) ||
        (cap.scope === "PARTICIPANT" && cap.editionId === order.editionId && cap.personId !== null &&
          (cap.personId === order.buyerPersonId || cap.personId === order.lines[0]?.participation?.personId));
      if (!payerMatch) {
        return NextResponse.json({ error: "Sipariş bulunamadı" }, { status: 404 });
      }
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
