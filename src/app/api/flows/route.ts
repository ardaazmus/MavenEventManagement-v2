// /api/flows — İş akışları (domain event güdümlü, §46-47)
// Aksiyonlar: registration.decide, registration.cancel, sponsor.guest,
//             finance.manualPayment, finance.refund, booth.allocate,
//             reservation.confirm, certificate.generate, edition.publish,
//             person.merge, invitation.respond
// G0-d: tüm aksiyonlar kiracı bağlamından geçer — her id girişinin ebeveyn zinciri
// (kayıt→edisyon, hak→edisyon, sipariş→edisyon…) doğrulanır; kişi/e-posta araması
// kiracı kapsamlıdır. Tek kiracılı davranış değişmez (seed zincirleri yeşil kalır).
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { authorizeFlowAction, policyForFlowAction } from "@/lib/api/permissions";
import { AUTH_ENABLED } from "@/lib/auth-flag";
import { requestActor } from "@/lib/auth/request-context";
import { resolveContext, verifyEditionTenant, GuardError } from "@/lib/api/tenant-guard";
import { ActivityType } from "@/lib/api/activity";
import { autoOfferForCategory } from "@/lib/api/waitlist-engine";
import { editionReadiness } from "@/lib/api/readiness";
import { toMinor } from "@/lib/money";
import { allocateBooth, type BoothPrisma } from "@/lib/sponsorship/booth-allocation";
import { enforceRateLimit } from "@/lib/rate-limit";
import { withLock } from "@/lib/tx-lock";
import { issuePortalToken } from "@/lib/api/portal-tokens";
import { isTenantCapabilityEntitled } from "@/lib/tenant-entitlements";

type FlowBody = Record<string, unknown> & { action?: string };

export async function POST(req: NextRequest) {
  try {
    // S3: iş akışı istismar kapısı — 60 istek/dk/IP
    const denied = enforceRateLimit(req, { key: "flows", limit: 60, windowMs: 60_000 });
    if (denied) return denied;

    const body = (await req.json()) as FlowBody;
    const action = body.action;
    // G0-d: aksiyon bağlamı tek noktadan çözülür (bağlam yok → 400)
    const ctx = await resolveContext(null);

    // N-01: rol/modül kapısı — generic CRUD ile AYNI karar merkezi (dual-read).
    // Bilinmeyen aksiyon 400 davranışı korunur (aşağıdaki default ile aynı gövde).
    if (!policyForFlowAction(action)) {
      return NextResponse.json({ error: `Bilinmeyen aksiyon: ${action}` }, { status: 400 });
    }
    const actor = await requestActor();
    if (AUTH_ENABLED && !actor) {
      return NextResponse.json({ error: "Oturum gerekli" }, { status: 401 });
    }
    const flowAuth = await authorizeFlowAction({ actor, action, body, prisma: db });
    if (!flowAuth.authorized) {
      return NextResponse.json({ error: "Bu işlem için yetkiniz yok" }, { status: 403 });
    }

    switch (action) {
      // ── Kayıt onay/red (Kayıt sorumlusu) ──
      case "registration.decide": {
        const { registrationId, decision, decidedBy } = body as { registrationId: string; decision: string; decidedBy?: string };
        // P3 (yeni-fazlar 9): karar değeri + YASAL geçiş doğrulaması — bilinmeyen karar
        // duruma YAZILAMAZ; iptal/reddedilmiş kayıt onaylanamaz (geçiş tanımlı değil).
        if (decision !== "CONFIRMED" && decision !== "REJECTED") {
          return NextResponse.json({ error: "Geçersiz karar — yalnız CONFIRMED | REJECTED" }, { status: 400 });
        }
        // G0-d: ebeveyn zinciri (kayıt → edisyon → kiracı) doğrulanır — yabancı kayıt 404
        const target = await db.registration.findUnique({ where: { id: registrationId }, select: { editionId: true, status: true, participationId: true } });
        if (!target) return NextResponse.json({ error: "Kayıt bulunamadı" }, { status: 404 });
        try { await verifyEditionTenant(target.editionId); } catch (e) {
          if (e instanceof GuardError) return NextResponse.json({ error: e.message }, { status: e.status });
          throw e;
        }
        // Yalnız karar-alabilir durumlar geçişe açıktır (§38 akışı).
        const DECISIONABLE = new Set(["PENDING_APPROVAL", "SUBMITTED"]);
        if (!DECISIONABLE.has(target.status)) {
          if (target.status === decision) {
            // idempotent tekrar — mevcut durum döner, ikinci geçiş/audit YOK
            const existing = await db.registration.findUnique({ where: { id: registrationId }, include: { participation: { include: { person: true, registrations: true } }, category: true } });
            return NextResponse.json(existing ?? { ok: true, idempotent: true });
          }
          return NextResponse.json({ error: `Bu kayıt '${target.status}' durumunda — karar geçişi tanımlı değil (iptal için registration.cancel)` }, { status: 409 });
        }
        // P3: durum geçişi + hak geçişleri + yaka kartı TEK transaction'da —
        // REJECTED'ta RESERVED haklar serbest bırakılır ve entitlement aynı tx'te yeniden hesaplanır.
        const reg = await db.$transaction(async (tx) => {
          const updated = await tx.registration.update({
            where: { id: registrationId },
            data: { status: decision, decidedAt: new Date(), decidedBy: decidedBy ?? "Kayıt Sorumlusu" },
            include: { participation: { include: { person: true, registrations: true } }, category: true },
          });
          const claims = await tx.entitlementClaim.findMany({ where: { registrationId } });
          for (const c of claims) {
            if (c.status === "RESERVED" && c.entitlementId) {
              if (decision === "CONFIRMED") {
                await tx.entitlementClaim.update({ where: { id: c.id }, data: { status: "CONSUMED", consumedAt: new Date() } });
              } else {
                await tx.entitlementClaim.update({ where: { id: c.id }, data: { status: "RELEASED", releasedAt: new Date() } });
              }
              const ent = await tx.entitlement.findUnique({ where: { id: c.entitlementId }, include: { claims: true } });
              if (ent) {
                await tx.entitlement.update({
                  where: { id: ent.id },
                  data: {
                    quantityConsumed: ent.claims.filter((x) => x.status === "CONSUMED").length,
                    quantityReserved: ent.claims.filter((x) => x.status === "RESERVED").length,
                  },
                });
              }
            }
          }
          if (decision === "CONFIRMED") {
            // yaka kartı READY (uygun)
            await tx.badgeInstance.updateMany({ where: { participationId: target.participationId, status: "NOT_ELIGIBLE" }, data: { status: "READY" } });
          }
          return updated;
        });
        // TASK-A F1: onay kanalında portal erişim anahtarı çıkarılır — ham değer bu yanıtta
        // BİR KEZ döner (onay e-postasıyla katılımcıya iletilir); sunucuda yalnız sha256
        // hash yaşar, sonraki listeleme/portal yanıtlarında ASLA görünmez.
        // P3: belirteç YALNIZ geçerli onay geçişinde (PENDING_APPROVAL|SUBMITTED → CONFIRMED).
        let issuedPortalToken: { token: string; expiresAt: string; scope: string } | null = null;
        if (decision === "CONFIRMED") {
          const issued = await issuePortalToken({
            scope: "PARTICIPANT",
            editionId: reg.editionId,
            personId: reg.participation.personId,
            issuedBy: "REGISTRATION_APPROVAL",
          });
          issuedPortalToken = { token: issued.token, expiresAt: issued.expiresAt.toISOString(), scope: "PARTICIPANT" };
        }
        await db.activityLog.create({ data: { type: decision === "CONFIRMED" ? ActivityType.REGISTRATION_CONFIRMED : ActivityType.REGISTRATION_SAVED, editionId: reg.editionId, message: `Kayıt ${decision === "CONFIRMED" ? "onaylandı" : "reddedildi"}: ${reg.participation.person.firstName} ${reg.participation.person.lastName}${issuedPortalToken ? " · portal erişim anahtarı düzenlendi (tek görünlük)" : ""}`, entityType: "Registration", entityId: reg.id, actorName: decidedBy ?? "Kayıt Sorumlusu" } });
        // TASK-A F1: ham belirteç yalnız bu yanıtta — sonraki okumalarda ASLA yok (tek görünlük)
        return NextResponse.json(issuedPortalToken ? { ...reg, issuedPortalToken } : reg);
      }

      // ── Kayıt iptali (etki önizlemesi: yaka kartı + hak + ödeme ayrıca) ──
      case "registration.cancel": {
        const { registrationId, reason } = body as { registrationId: string; reason?: string };
        // G0-d: iptal edilen kaydın ebeveyn edisyonu bağlama doğrulanır
        const target = await db.registration.findUnique({ where: { id: registrationId }, select: { editionId: true, status: true } });
        if (!target) return NextResponse.json({ error: "Kayıt bulunamadı" }, { status: 404 });
        try { await verifyEditionTenant(target.editionId); } catch (e) {
          if (e instanceof GuardError) return NextResponse.json({ error: e.message }, { status: e.status });
          throw e;
        }
        // QA: idempotent tekrar — zaten iptal kayıtta yan etki YOK (çift log +
        // bekleme-listesi teklif tekrarı kapanır; decide aksiyonuyla aynı desen).
        if (target.status === "CANCELLED") {
          const existing = await db.registration.findUnique({ where: { id: registrationId }, include: { participation: { include: { person: true } } } });
          return NextResponse.json({ ...JSON.parse(JSON.stringify(existing ?? { id: registrationId, status: "CANCELLED" })), idempotent: true, waitlistOffered: [] });
        }
        const reg = await db.registration.update({
          where: { id: registrationId },
          data: { status: "CANCELLED", cancelReason: reason ?? "Yönetici iptali" },
          include: { participation: { include: { person: true } } },
        });
        // iptal → haklar geri yüklenir (politikaya bağlı; varsayılan: geri ver)
        const claims = await db.entitlementClaim.findMany({ where: { registrationId, status: { in: ["RESERVED", "CONSUMED"] } } });
        for (const c of claims) {
          await db.entitlementClaim.update({ where: { id: c.id }, data: { status: "RELEASED", releasedAt: new Date() } });
          if (c.entitlementId) await recomputeEntitlement(c.entitlementId);
        }
        await db.badgeInstance.updateMany({ where: { participationId: reg.participationId, status: { in: ["READY", "ISSUED", "PRINTED"] } }, data: { status: "VOID", voidReason: `Kayıt iptali: ${reason ?? ""}` } });
        await db.activityLog.create({ data: { type: ActivityType.REGISTRATION_CANCELLED, editionId: reg.editionId, message: `Kayıt iptal edildi: ${reg.participation.person.firstName} ${reg.participation.person.lastName} — yaka kartı ve haklar etkilenir`, entityType: "Registration", entityId: reg.id, actorName: "Yönetici" } });
        // koltuk boşaldı → bekleme listesindeki sıradakine otomatik teklif (§12)
        const chainedOffers = reg.categoryId ? await autoOfferForCategory(reg.editionId, reg.categoryId) : [];
        if (chainedOffers.length > 0) {
          await db.activityLog.create({ data: { type: ActivityType.REGISTRATION_SAVED, editionId: reg.editionId, message: `İptal sonrası koltuk için bekleme listesinden ${chainedOffers.length} teklif gönderildi: ${chainedOffers.map((o) => o.personName).join(", ")}`, actorName: "Bekleme Motoru" } });
        }
        return NextResponse.json({ ...JSON.parse(JSON.stringify(reg)), waitlistOffered: chainedOffers });
      }

      // ── Sponsor misafiri ekle (09-C: Person→Participation→Registration→Claim) ──
      case "sponsor.guest": {
        const { entitlementId, firstName, lastName, email, company, category } = body as {
          entitlementId: string; firstName: string; lastName: string; email: string; company?: string; category?: string;
        };
        // P3 (yeni-fazlar 9): girdi doğrulaması SORGUDAN ÖNCE — undefined email Prisma'da
        // filtre-ignorne davranışıyla KİRACIDAKİ İLK kişiyi eşleyebilirdi (yanlış-kişi kaydı).
        if (!firstName?.trim() || !lastName?.trim()) return NextResponse.json({ error: "Ad ve soyad zorunlu" }, { status: 400 });
        if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return NextResponse.json({ error: "Geçerli e-posta zorunlu" }, { status: 400 });
        const ent = await db.entitlement.findUnique({ where: { id: entitlementId }, include: { ownerOrganization: true } });
        if (!ent) return NextResponse.json({ error: "Hak havuzu bulunamadı" }, { status: 404 });
        if (!ent.editionId) return NextResponse.json({ error: "Etkinlik bağlantısı yok" }, { status: 400 });
        // G0-d: hak havuzunun edisyonu bağlama doğrulanır
        try { await verifyEditionTenant(ent.editionId); } catch (e) {
          if (e instanceof GuardError) return NextResponse.json({ error: e.message }, { status: e.status });
          throw e;
        }

        // P3: kapasite rezervasyonu ATOMİK — kontrol+claim+ sayaç TEK transaction'da
        // (SQLite tek-yazıcı serileştirme: eşzamanlı misafir ekleme aşım-rezervasyon yapamaz).
        const result = await db.$transaction(async (tx) => {
          const entTx = await tx.entitlement.findUnique({ where: { id: entitlementId }, include: { claims: true, ownerOrganization: true } });
          if (!entTx) throw new GuardError("Hak havuzu bulunamadı", 404);
          const usedTx = entTx.claims.filter((c) => c.status === "CONSUMED" || c.status === "RESERVED").length;
          if (usedTx >= entTx.quantityGranted) {
            throw new GuardError(`Kalan hak yok (${usedTx}/${entTx.quantityGranted} kullanıldı)`, 409);
          }

          // 1) Person: e-posta güçlü işaret — KİRACI KAPSAMLI arama (G0-d);
          let person = await tx.person.findFirst({ where: { email, tenantId: ctx } });
          if (!person) {
            person = await tx.person.create({ data: { tenantId: ctx, firstName: firstName.trim(), lastName: lastName.trim(), email, company: company ?? entTx.ownerOrganization?.name } });
          }

          // 2) Participation (sponsor portal kaynağı)
          const participation = await tx.eventParticipation.upsert({
            where: { editionId_personId: { editionId: entTx.editionId!, personId: person.id } },
            create: { editionId: entTx.editionId!, personId: person.id, source: "SPONSOR_PORTAL" },
            update: { source: "SPONSOR_PORTAL" },
          });

          // 3) Registration — SPONSOR_ENTITLEMENT funding; ücretsiz (NOT_REQUIRED ödeme ekseni)
          const registration = await tx.registration.create({
            data: {
              editionId: entTx.editionId!,
              participationId: participation.id,
              source: "SPONSOR_PORTAL",
              fundingSource: "SPONSOR_ENTITLEMENT",
              status: "PENDING_APPROVAL",
              submittedAt: new Date(),
              notes: `Sponsor misafiri — ${entTx.ownerOrganization?.name ?? ""} (${entTx.label})`,
            },
          });

          // 4) Claim: RESERVED (davette ayır, onayda kullanılır) + sayaç yeniden hesap
          const claim = await tx.entitlementClaim.create({
            data: { entitlementId: entTx.id, participationId: participation.id, registrationId: registration.id, status: "RESERVED", guestName: `${firstName.trim()} ${lastName.trim()}` },
          });
          const consumed = entTx.claims.filter((c) => c.status === "CONSUMED").length;
          const reserved = entTx.claims.filter((c) => c.status === "RESERVED").length + 1; // yeni claim dahil
          await tx.entitlement.update({ where: { id: entTx.id }, data: { quantityConsumed: consumed, quantityReserved: reserved } });
          return { claim, registration, participation, used: usedTx + 1 };
        });

        await db.activityLog.create({ data: { type: ActivityType.CLAIM_SAVED, editionId: ent.editionId!, message: `Sponsor misafiri ayrıldı: ${firstName.trim()} ${lastName.trim()} → ${ent.label} (#${result.used})`, entityType: "EntitlementClaim", entityId: result.claim.id, actorName: "Sponsor Portalı" } });
        return NextResponse.json({ claim: result.claim, registration: result.registration, participation: result.participation }, { status: 201 });
      }

      // ── Manuel ödeme teyidi (§38: doğrudan status değiştirme YASAK) ──
      // P2 (yeni-fazlar 8): onay eşiği AYNI BİRİMDE karşılaştırılır — amountMinor vs
      // 5.000.000 minor (₺50.000). Eski kod major-₺'yi minor-eşikle kıyaslıyordu
      // (₺60.000 teyidi bile eşiği tetiklemiyordu). Para birimi siparişle AYNI olmak
      // ZORUNDA; aşım-ödeme (paid+amount > total) reddedilir.
      case "finance.manualPayment": {
        // Sözleşme: amount = MAJOR (₺, UI girdisi) — refund'un minor-only sözleşmesiyle
        // KARIŞTIRILMAMALI. İki alan bir arada gelirse birim belirsizliği 400 (100x tuzak).
        const { orderId, amount, amountMinor: ambiguousMinor, currency = "TRY", reference, enteredBy, reason } = body as { orderId: string; amount: number; amountMinor?: number; currency?: string; reference?: string; enteredBy?: string; reason?: string };
        if (ambiguousMinor !== undefined) return NextResponse.json({ error: "Belirsiz birim — bu uçta yalnız major-unit 'amount' (₺) gönderin (kuruş için finance.refund sözleşmesine bakın)" }, { status: 400 });
        if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) return NextResponse.json({ error: "Tutar zorunlu" }, { status: 400 });
        const amountMinor = toMinor(amount); // F6: UI ₺ gönderir, DB kuruş tutar
        if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) return NextResponse.json({ error: "Tutar kuruş cinsinden güvenli tam sayı olmalı" }, { status: 400 });
        if (!reason) return NextResponse.json({ error: "Manuel teyit için gerekçe zorunlu (denetim)" }, { status: 400 });
        // G0-d: siparişin ebeveyn edisyonu bağlama doğrulanır
        const orderCtx = await db.order.findUnique({ where: { id: orderId } });
        if (!orderCtx) return NextResponse.json({ error: "Sipariş bulunamadı" }, { status: 404 });
        let orderTenant: string;
        try { orderTenant = await verifyEditionTenant(orderCtx.editionId); } catch (e) {
          if (e instanceof GuardError) return NextResponse.json({ error: e.message }, { status: e.status });
          throw e;
        }
        if (orderCtx.currency !== currency) return NextResponse.json({ error: `Para birimi siparişle uyuşmuyor (sipariş: ${orderCtx.currency})` }, { status: 400 });

        // QA: bakiye kontrolü + yazım + yeniden hesap TEK kilit+tx'te (refund ile aynı
        // desen) — eşzamanlı çift gönderim aşım-ödemeye yol açamaz (okuma-taze-sayım).
        try {
          const payment = await withLock(`order:${orderId}`, () => db.$transaction(async (tx) => {
            const order = await tx.order.findUnique({ where: { id: orderId }, include: { payments: true } });
            if (!order) throw new GuardError("Sipariş bulunamadı", 404);
            const paidSum = order.payments.filter((p) => p.status === "SUCCEEDED").reduce((a, p) => a + p.amount, 0);
            if (paidSum + amountMinor > order.totalAmount) {
              throw new GuardError(`Aşım ödeme: kalan ${order.totalAmount - paidSum} kuruş — talep ${amountMinor} kuruş`, 409);
            }
            const requiresApproval = amountMinor > 5_000_000;
            const verifiedEnteredBy = (AUTH_ENABLED && actor?.uid) ? actor.uid : (enteredBy ?? (actor?.uid ?? "Finans Sorumlusu"));
            const verifiedApprovedBy = requiresApproval ? undefined : ((AUTH_ENABLED && actor?.uid) ? actor.uid : "Finans Sorumlusu");
            const created = await tx.payment.create({
              data: {
                orderId,
                amount: amountMinor,
                currency,
                source: "MANUAL_EXTERNAL",
                status: requiresApproval ? "PENDING" : "SUCCEEDED",
                reference,
                enteredBy: verifiedEnteredBy,
                reason,
                approvedBy: verifiedApprovedBy,
                paidAt: requiresApproval ? null : new Date(),
              },
            });
            // recalcOrder birebir — tx bağlamında (ayrı bağlantı kullanmamak için)
            const fresh = await tx.order.findUnique({ where: { id: orderId }, include: { lines: true, payments: true, refunds: true } });
            if (fresh) {
              const linesTotal = fresh.lines.reduce((s, l) => s + l.total, 0) || fresh.totalAmount;
              const paid = fresh.payments.filter((p) => p.status === "SUCCEEDED").reduce((s, p) => s + p.amount, 0);
              const refunded = fresh.refunds.filter((r) => r.status === "PROCESSED").reduce((s, r) => s + r.amount, 0);
              const balance = linesTotal - paid + refunded;
              const status = fresh.status === "CANCELLED" ? "CANCELLED" : balance <= 0 ? "PAID" : paid > 0 ? "PARTIALLY_PAID" : "OPEN";
              await tx.order.update({ where: { id: orderId }, data: { totalAmount: linesTotal, status } });
            }
            await tx.activityLog.create({
              data: {
                type: ActivityType.PAYMENT_RECEIVED,
                tenantId: orderTenant,
                editionId: order.editionId,
                message: requiresApproval
                  ? `Manuel tahsilat teyit bekliyor: ${amount} ${currency} — ${reason} (50.000 TL üzeri ikinci onay gerekir)`
                  : `Manuel tahsilat: ${amount} ${currency} — ${reason}`,
                entityType: "Payment",
                entityId: created.id,
                actorName: enteredBy ?? (actor?.uid ?? "Finans Sorumlusu"),
              },
            });
            return created;
          }));
          return NextResponse.json(payment, { status: 201 });
        } catch (e) {
          if (e instanceof GuardError) return NextResponse.json({ error: e.message }, { status: e.status });
          throw e;
        }
      }

      // ── İkinci yetkili manuel tahsilat onayı/reddi (F-01 / SoD ilkesi) ──
      case "finance.approvePayment": {
        const { paymentId, approved, reason, approverName: explicitApprover } = body as {
          paymentId: string;
          approved: boolean;
          reason?: string;
          approverName?: string;
        };
        if (!paymentId || typeof paymentId !== "string") {
          return NextResponse.json({ error: "paymentId zorunlu" }, { status: 400 });
        }
        if (typeof approved !== "boolean") {
          return NextResponse.json({ error: "approved (boolean) zorunlu" }, { status: 400 });
        }

        const existingPayment = await db.payment.findUnique({
          where: { id: paymentId },
          include: { order: true },
        });
        if (!existingPayment) {
          return NextResponse.json({ error: "Ödeme bulunamadı" }, { status: 404 });
        }

        let orderTenant: string;
        try {
          orderTenant = await verifyEditionTenant(existingPayment.order.editionId);
        } catch (e) {
          if (e instanceof GuardError) return NextResponse.json({ error: e.message }, { status: e.status });
          throw e;
        }

        if (existingPayment.status !== "PENDING") {
          return NextResponse.json(
            { error: `Ödeme '${existingPayment.status}' durumunda — yalnızca beklemede (PENDING) olan ödemeler onaylanabilir veya reddedilebilir` },
            { status: 409 }
          );
        }

        if (existingPayment.source !== "MANUAL_EXTERNAL") {
          return NextResponse.json(
            { error: "Yalnızca manuel harici tahsilat (MANUAL_EXTERNAL) kayıtları bu akış üzerinden onaylanabilir" },
            { status: 400 }
          );
        }

        const approverName = (AUTH_ENABLED && actor?.uid) ? actor.uid : (explicitApprover ?? (actor?.uid ?? "Finans Yöneticisi"));

        // SoD (Görevler Ayrılığı): Auth açıkken giren kişi kendi kaydını onaylayamaz
        if (AUTH_ENABLED && actor && existingPayment.enteredBy) {
          const isSameUser = existingPayment.enteredBy === actor.uid;
          if (isSameUser) {
            return NextResponse.json(
              { error: "Görevler ayrılığı ilkesi gereği kendi girdiğiniz yüksek tutarlı tahsilatı onaylayamazsınız" },
              { status: 403 }
            );
          }
        }

        const orderId = existingPayment.orderId;
        try {
          const updatedPayment = await withLock(`order:${orderId}`, () =>
            db.$transaction(async (tx) => {
              const current = await tx.payment.findUnique({
                where: { id: paymentId },
                include: { order: { include: { payments: true } } },
              });
              if (!current || current.status !== "PENDING") {
                throw new GuardError("Ödeme bulunamadı veya artık beklemede değil", 409);
              }

              if (approved) {
                const paidSum = current.order.payments
                  .filter((p) => p.status === "SUCCEEDED")
                  .reduce((a, p) => a + p.amount, 0);
                if (paidSum + current.amount > current.order.totalAmount) {
                  throw new GuardError(
                    `Aşım ödeme: kalan bakiye ${current.order.totalAmount - paidSum} kuruş — onaylanmak istenen ${current.amount} kuruş`,
                    409
                  );
                }

                const updated = await tx.payment.update({
                  where: { id: paymentId },
                  data: {
                    status: "SUCCEEDED",
                    approvedBy: approverName,
                    paidAt: new Date(),
                  },
                });

                // Siparişi yeniden hesapla
                const fresh = await tx.order.findUnique({
                  where: { id: orderId },
                  include: { lines: true, payments: true, refunds: true },
                });
                if (fresh) {
                  const linesTotal = fresh.lines.reduce((s, l) => s + l.total, 0) || fresh.totalAmount;
                  const paid = fresh.payments.filter((p) => p.status === "SUCCEEDED").reduce((s, p) => s + p.amount, 0);
                  const refunded = fresh.refunds.filter((r) => r.status === "PROCESSED").reduce((s, r) => s + r.amount, 0);
                  const balance = linesTotal - paid + refunded;
                  const status = fresh.status === "CANCELLED" ? "CANCELLED" : balance <= 0 ? "PAID" : paid > 0 ? "PARTIALLY_PAID" : "OPEN";
                  await tx.order.update({ where: { id: orderId }, data: { totalAmount: linesTotal, status } });
                }

                await tx.activityLog.create({
                  data: {
                    type: ActivityType.PAYMENT_RECEIVED,
                    tenantId: orderTenant,
                    editionId: current.order.editionId,
                    message: `Manuel tahsilat onaylandı: ${current.amount / 100} ${current.currency} — Onaylayan: ${approverName}`,
                    entityType: "Payment",
                    entityId: updated.id,
                    actorName: approverName,
                  },
                });
                return updated;
              } else {
                // Reddet
                const updated = await tx.payment.update({
                  where: { id: paymentId },
                  data: {
                    status: "FAILED",
                    reason: reason ? `REDDEDİLDİ: ${reason}` : (current.reason ? `${current.reason} (REDDEDİLDİ)` : "Yönetici tarafından reddedildi"),
                    approvedBy: `${approverName} (RED)`,
                  },
                });

                await tx.activityLog.create({
                  data: {
                    type: ActivityType.PAYMENT_RECEIVED,
                    tenantId: orderTenant,
                    editionId: current.order.editionId,
                    message: `Manuel tahsilat reddedildi: ${current.amount / 100} ${current.currency} — Reddeden: ${approverName} (${reason ?? "Gerekçe yok"})`,
                    entityType: "Payment",
                    entityId: updated.id,
                    actorName: approverName,
                  },
                });
                return updated;
              }
            })
          );
          return NextResponse.json(updatedPayment, { status: 200 });
        } catch (e) {
          if (e instanceof GuardError) return NextResponse.json({ error: e.message }, { status: e.status });
          throw e;
        }
      }

      // ── İade talebi/onayı (iade ≠ iptal; hak iadesi ayrı adım) ──
      // DÜZELTME (money integrity): amount = MINOR UNIT (kuruş) pozitif/sonlu/TAM SAYI —
      // major-unit float, ondalıklı, NaN, Infinity, 0, negatif KABUL edilmez (toMinor
      // çağrısı çağırıcıya aittir; uç nokta belirsiz ölçek kabul etmez).
      // Sözleşme: amountMinor + currency (siparişle AYNI) + reason (denetim) zorunlu;
      // idempotencyKey verildiğinde aynı anahtar ikinci finansal hareket OLUŞTURMAZ
      // (aynı yük → mevcut iade; farklı yük → 409). Bakiye kontrolü + iade yazımı +
      // sipariş yeniden hesabı TEK transaction'da — toplam iade tahsilatı ASLA aşamaz.
      case "finance.refund": {
        const { orderId, amountMinor, amount, currency, reason, requestedBy, idempotencyKey, paymentId } = body as {
          orderId: string; amountMinor?: number; amount?: number; currency?: string; reason?: string; requestedBy?: string; idempotencyKey?: string; paymentId?: string;
        };
        if (amount !== undefined) {
          return NextResponse.json({ error: "Belirsiz major-unit 'amount' kabul edilmez — kuruş cinsinden tam sayı 'amountMinor' gönderin" }, { status: 400 });
        }
        if (typeof amountMinor !== "number" || !Number.isSafeInteger(amountMinor) || amountMinor <= 0) {
          return NextResponse.json({ error: "İade tutarı pozitif tam sayı (kuruş) olmalı — ondalıklı/NaN/Infinity/0/negatif kabul edilmez" }, { status: 400 });
        }
        if (!reason || !reason.trim()) {
          return NextResponse.json({ error: "İade için gerekçe zorunludur (denetim kaydı)" }, { status: 400 });
        }
        // G0-d: iade siparişin ebeveyn edisyonu bağlama doğrulanır
        const refundOrderCtx = await db.order.findUnique({ where: { id: orderId }, select: { editionId: true } });
        if (!refundOrderCtx) return NextResponse.json({ error: "Sipariş bulunamadı" }, { status: 404 });
        try { await verifyEditionTenant(refundOrderCtx.editionId); } catch (e) {
          if (e instanceof GuardError) return NextResponse.json({ error: e.message }, { status: e.status });
          throw e;
        }

        try {
          // DÜZELTME (eşzamanlılık): aynı sipariş iadeleri süreç-içi kilitte SERİ işlenir
          // (SQLite BUSY_SNAPSHOT kök-nedeni — bkz. tx-lock.ts); unique kısıt yine de invariant.
          const refund = await withLock(`order:${orderId}`, () => db.$transaction(async (tx) => {
            const order = await tx.order.findUnique({ where: { id: orderId }, include: { payments: true, refunds: true } });
            if (!order) throw new GuardError("Sipariş bulunamadı", 404);
            if (order.status === "CANCELLED") throw new GuardError("İptal edilmiş siparişe iade yapılamaz", 409);
            if (currency && currency !== order.currency) {
              throw new GuardError(`Para birimi uyuşmuyor — sipariş ${order.currency}`, 400);
            }
            const paidTotal = order.payments.filter((p) => p.status === "SUCCEEDED").reduce((s, p) => s + p.amount, 0);
            const refundedTotal = order.refunds.filter((r) => r.status === "PROCESSED").reduce((s, r) => s + r.amount, 0);
            const refundable = paidTotal - refundedTotal;
            if (amountMinor > refundable) {
              throw new GuardError(`İade tutarı iade edilebilir bakiyeyi aşıyor — kalan: ${refundable} kuruş`, 409);
            }
            // Idempotency — anahtar mevcutsa çakışma analizi
            if (idempotencyKey) {
              const existing = order.refunds.find((r) => r.idempotencyKey === idempotencyKey);
              if (existing) {
                const samePayload = existing.amount === amountMinor
                  && (currency ?? order.currency) === (existing.currency ?? order.currency)
                  && (existing.reason ?? "") === reason;
                if (!samePayload) throw new GuardError("Bu idempotencyKey farklı bir iade yüküyle kullanılmış", 409);
                return existing; // aynı yük → ikinci hareket OLUŞMAZ
              }
            }
            const created = await tx.refund.create({
              data: {
                orderId,
                paymentId: paymentId ?? null,
                amount: amountMinor,
                currency: currency ?? order.currency,
                reason,
                status: "PROCESSED",
                requestedBy,
                idempotencyKey: idempotencyKey ?? null,
                processedAt: new Date(),
              },
            });
            // recalcOrder birebir — tx bağlamında (ayrı bağlantı kullanmamak için)
            const fresh = await tx.order.findUnique({ where: { id: orderId }, include: { lines: true, payments: true, refunds: true } });
            if (fresh) {
              const linesTotal = fresh.lines.reduce((s, l) => s + l.total, 0) || fresh.totalAmount;
              const paid = fresh.payments.filter((p) => p.status === "SUCCEEDED").reduce((s, p) => s + p.amount, 0);
              const refunded = fresh.refunds.filter((r) => r.status === "PROCESSED").reduce((s, r) => s + r.amount, 0);
              const balance = linesTotal - paid + refunded;
              const status = fresh.status === "CANCELLED" ? "CANCELLED" : balance <= 0 ? "PAID" : paid > 0 ? "PARTIALLY_PAID" : "OPEN";
              await tx.order.update({ where: { id: orderId }, data: { totalAmount: linesTotal, status } });
            }
            await tx.activityLog.create({
              data: { type: ActivityType.REFUND_SAVED, editionId: order.editionId, message: `İade işlendi: ${amountMinor} ${order.currency} — ${reason}`, entityType: "Refund", entityId: created.id, actorName: requestedBy ?? "Finans Sorumlusu" },
            });
            return created;
          }, { timeout: 20_000, maxWait: 10_000 }));
          return NextResponse.json(refund, { status: 201 });
        } catch (e) {
          // Idempotent-retry sözleşmesi: ANAHTARLA gelen herhangi bir başarısızlıkta
          // (P2002 unique yarışı, tx kilidi/zaman aşımı vb.) önce defter kontrol edilir —
          // aynı anahtarla kalıcı bir iade VARSA o döndürülür (ikinci hareket oluşmaz);
          // yoksa gerçek hata yeniden fırlatılır.
          if (idempotencyKey && e instanceof Error) {
            const existing = await db.refund.findFirst({ where: { orderId, idempotencyKey } });
            if (existing) {
              const samePayload = existing.amount === amountMinor && (existing.reason ?? "") === reason;
              if (!samePayload) return NextResponse.json({ error: "Bu idempotencyKey farklı bir iade yüküyle kullanılmış" }, { status: 409 });
              return NextResponse.json(existing, { status: 201 });
            }
          }
          if (e instanceof GuardError) return NextResponse.json({ error: e.message }, { status: e.status });
          throw e;
        }
      }

      // ── Stand tahsisi (SponsorAgreement → Entitlement → Allocation → A24) ──
      // P12: açık anlaşma seçimi + edition/statü/kurum eşleşmesi + tekil aktif tahsis.
      case "booth.allocate": {
        const { boothUnitId, agreementId, organizationId } = body as { boothUnitId: string; agreementId?: string; organizationId?: string };
        const booth = await db.boothUnit.findUnique({ where: { id: boothUnitId } });
        if (!booth) return NextResponse.json({ error: "Stant bulunamadı" }, { status: 404 });
        // G0-d: stantın edisyonu bağlama doğrulanır
        try { await verifyEditionTenant(booth.editionId); } catch (e) {
          if (e instanceof GuardError) return NextResponse.json({ error: e.message }, { status: e.status });
          throw e;
        }
        const decided = await allocateBooth(db as unknown as BoothPrisma, {
          boothUnitId,
          agreementId: agreementId ?? "",
          organizationId: organizationId ?? null,
        });
        if (!decided.ok) return NextResponse.json({ error: decided.error }, { status: decided.status });
        const alloc = await db.boothAllocation.findUnique({
          where: { boothUnitId },
          include: { boothUnit: true, organization: true, agreement: true },
        });
        await db.activityLog.create({ data: { type: ActivityType.BOOTH_ALLOCATED, editionId: booth.editionId, message: `Stand tahsis edildi: ${booth.code} (${booth.sizeSqm} m²)`, entityType: "BoothAllocation", entityId: decided.allocation.id, actorName: "Sponsorluk Yöneticisi" } });
        return NextResponse.json(alloc, { status: 201 });
      }

      // ── Rezervasyon teyidi — her gece stok kontrolü (§09-E) ──
      case "reservation.confirm": {
        const { reservationId } = body as { reservationId: string };
        const res = await db.reservation.findUnique({ where: { id: reservationId }, include: { block: { include: { inventoryNights: true } } } });
        if (!res) return NextResponse.json({ error: "Rezervasyon bulunamadı" }, { status: 404 });
        // G0-d: rezervasyonun edisyonu bağlama doğrulanır
        try { await verifyEditionTenant(res.editionId); } catch (e) {
          if (e instanceof GuardError) return NextResponse.json({ error: e.message }, { status: e.status });
          throw e;
        }
        if (!res.block) return NextResponse.json({ error: "Oda bloğu bağlantısı yok" }, { status: 400 });

        // P3 (yeni-fazlar 10): idempotent — teyitli rezervasyon stok YENİDEN TÜKETMEZ.
        if (res.status === "CONFIRMED") {
          return NextResponse.json({ ...JSON.parse(JSON.stringify(res)), alreadyConfirmed: true });
        }

        const nights: Date[] = [];
        const cur = new Date(res.checkIn);
        while (cur < res.checkOut) { nights.push(new Date(cur)); cur.setDate(cur.getDate() + 1); }

        // P3: stok doğrulama + tüketim + durum geçişi TEK transaction'da —
        // eşzamanlı teyit aşım-rezervasyon yapamaz; başarısız geçiş stok KALICI tüketmez (tx geri alır).
        const updated = await db.$transaction(async (tx) => {
          // tx içi TAZE okuma — karar güncel stoğa karşı verilir
          const fresh = await tx.reservation.findUnique({ where: { id: reservationId }, include: { block: { include: { inventoryNights: true } } } });
          if (!fresh || fresh.status === "CONFIRMED") {
            throw new GuardError("Rezervasyon zaten teyitli", 409);
          }
          const missing: string[] = [];
          for (const n of nights) {
            const inv = fresh.block?.inventoryNights.find((i) => sameDay(i.date, n));
            if (!inv) { missing.push(n.toLocaleDateString("tr-TR")); continue; }
            if (inv.reservedRooms + 1 > inv.totalRooms) { missing.push(`${n.toLocaleDateString("tr-TR")} (stok yok)`); }
          }
          if (missing.length > 0) {
            throw new GuardError(`Teyit engellendi — şu gecelerde stok yetersiz: ${missing.join(", ")}`, 409);
          }
          for (const n of nights) {
            const inv = fresh.block!.inventoryNights.find((i) => sameDay(i.date, n))!;
            await tx.inventoryNight.update({ where: { id: inv.id }, data: { reservedRooms: inv.reservedRooms + 1 } });
          }
          return tx.reservation.update({ where: { id: reservationId }, data: { status: "CONFIRMED" }, include: { block: { include: { hotel: true, roomType: true } } } });
        }).catch((e: unknown) => {
          if (e instanceof GuardError) throw e;
          throw e;
        });
        await db.activityLog.create({ data: { type: ActivityType.RESERVATION_SAVED, editionId: res.editionId, message: `Rezervasyon teyit edildi: ${res.guestName} — ${nights.length} oda-gece tüketildi`, entityType: "Reservation", entityId: res.id, actorName: "Otel Sorumlusu" } });
        return NextResponse.json(updated);
      }

      // ── P3 (yeni-fazlar 10): rezervasyon iptali — tüketilen stok GERİ verilir (idempotent) ──
      case "reservation.cancel": {
        const { reservationId, reason } = body as { reservationId: string; reason?: string };
        const res = await db.reservation.findUnique({ where: { id: reservationId }, include: { block: { include: { inventoryNights: true } } } });
        if (!res) return NextResponse.json({ error: "Rezervasyon bulunamadı" }, { status: 404 });
        try { await verifyEditionTenant(res.editionId); } catch (e) {
          if (e instanceof GuardError) return NextResponse.json({ error: e.message }, { status: e.status });
          throw e;
        }
        if (res.status === "CANCELLED") {
          return NextResponse.json({ ...JSON.parse(JSON.stringify(res)), alreadyCancelled: true });
        }
        const wasConfirmed = res.status === "CONFIRMED";
        const nights: Date[] = [];
        const cur = new Date(res.checkIn);
        while (cur < res.checkOut) { nights.push(new Date(cur)); cur.setDate(cur.getDate() + 1); }
        const updated = await db.$transaction(async (tx) => {
          // stok iadesi: yalnız daha önce TÜKETİLMİŞ (teyitli) rezervasyon için
          if (wasConfirmed && res.block) {
            for (const n of nights) {
              const inv = res.block.inventoryNights.find((i) => sameDay(i.date, n));
              if (inv) await tx.inventoryNight.update({ where: { id: inv.id }, data: { reservedRooms: Math.max(0, inv.reservedRooms - 1) } });
            }
          }
          return tx.reservation.update({ where: { id: reservationId }, data: { status: "CANCELLED" } });
        });
        await db.activityLog.create({ data: { type: ActivityType.RESERVATION_SAVED, editionId: res.editionId, message: `Rezervasyon iptal: ${res.guestName}${wasConfirmed ? ` — ${nights.length} oda-gece stoğa geri verildi` : ""}${reason ? ` · ${reason}` : ""}`, entityType: "Reservation", entityId: res.id, actorName: "Otel Sorumlusu" } });
        return NextResponse.json(updated);
      }

      // ── Sertifika üretimi (uygunluk kuralı kontrolü, §43) ──
      case "certificate.generate": {
        const { definitionId } = body as { definitionId: string };
        const def = await db.certificateDefinition.findUnique({ where: { id: definitionId }, include: { issues: { include: { participation: { include: { registrations: true, scanEvents: true } } } } } });
        if (!def) return NextResponse.json({ error: "Kural bulunamadı" }, { status: 404 });
        if (!def.editionId) return NextResponse.json({ error: "Etkinlik yok" }, { status: 400 });
        // G0-d: sertifika kuralının edisyonu bağlama doğrulanır
        try { await verifyEditionTenant(def.editionId); } catch (e) {
          if (e instanceof GuardError) return NextResponse.json({ error: e.message }, { status: e.status });
          throw e;
        }

        const participations = await db.eventParticipation.findMany({ where: { editionId: def.editionId }, include: { registrations: true, scanEvents: true, roleAssignments: true } });
        let eligible = 0;
        for (const p of participations) {
          // P3 (yeni-fazlar 11): GEÇERLİ kayıt deterministik seçilir — registrations[0]
          // sırasız; eski CANCELLED/REJECTED kayıt güncel CONFIRMED'ı gizleyebilirdi.
          // Kural: CONFIRMED varsa o; yoksa en-yeni submittedAt'lı kayıt (not için).
          const regs = [...(p.registrations ?? [])].sort((a, b) => (b.submittedAt?.getTime() ?? 0) - (a.submittedAt?.getTime() ?? 0));
          const reg = regs.find((r) => r.status === "CONFIRMED") ?? regs[0];
          const checkedIn = p.scanEvents?.some((s) => s.action === "ENTRY" && s.result === "ALLOWED");
          const isEligible = reg?.status === "CONFIRMED" && (def.type === "SPEAKER" ? p.roleAssignments?.some((r) => r.role === "SPEAKER") : Boolean(checkedIn));
          const existing = def.issues.find((i) => i.participationId === p.id);
          const note = isEligible ? "Uygunluk koşulları sağlandı" : `Eksik: ${reg?.status !== "CONFIRMED" ? "onaylı kayıt yok" : ""} ${!checkedIn && def.type !== "SPEAKER" ? "geçerli giriş yok" : ""}`.trim();
          if (existing) {
            if (existing.status === "REVOKED") continue; // geri alma katılımı silmez, yeniden değerlendirme açık
            await db.certificateIssue.update({ where: { id: existing.id }, data: { status: isEligible ? "GENERATED" : "NOT_ELIGIBLE", generatedAt: isEligible ? new Date() : null, eligibilityNote: note } });
          } else {
            await db.certificateIssue.create({ data: { definitionId: def.id, participationId: p.id, status: isEligible ? "GENERATED" : "NOT_ELIGIBLE", generatedAt: isEligible ? new Date() : null, eligibilityNote: note } });
          }
          if (isEligible) eligible++;
        }
        await db.activityLog.create({ data: { type: ActivityType.CERT_ISSUE_SAVED, editionId: def.editionId, message: `Sertifika üretimi: ${def.name} — ${eligible} uygun belge oluşturuldu`, entityType: "CertificateDefinition", entityId: def.id, actorName: "Belge Sorumlusu" } });
        return NextResponse.json({ ok: true, eligible });
      }

      // ── Etkinlik yayınla (yayın denetimini geçmek zorunda) ──
      case "edition.publish": {
        const { editionId } = body as { editionId: string };
        // G0-d: yayınlanan edisyon bağlama doğrulanır (yabancı edisyon 404)
        try { await verifyEditionTenant(editionId); } catch (e) {
          if (e instanceof GuardError) return NextResponse.json({ error: e.message }, { status: e.status });
          throw e;
        }
        // P3 (yeni-fazlar 13): hazırlık denetimi DAHİLİ HTTP self-request ile DEĞİL,
        // doğrudan sunucu-içi readiness fonksiyonuyla — eski yol auth-on'da oturum
        // bağlamını kaybedip 401 alıyor, dash.checks undefined kalıyor ve engeller
        // FAIL-OPEN olarak yayına izin veriyordu.
        const { edition: edRow, checks } = await editionReadiness(editionId);
        if (checks.blockers.length > 0) {
          return NextResponse.json({ error: `Yayın engellendi: ${checks.blockers[0].message}`, checks }, { status: 409 });
        }
        // P3: yaşam-döngüsü geri sarılmaz — ONSITE/COMPLETED/ARCHIVED edisyon
        // "REGISTRATION"a zorlanmaz; yalnız ön-yaşam-döngüsü (PLANNING/DRAFT) kayıta açılır.
        const PRE_LIFECYCLE = new Set(["PLANNING", "DRAFT"]);
        const nextStatus: string = PRE_LIFECYCLE.has(edRow.status ?? "") ? "REGISTRATION" : (edRow.status ?? "PLANNING");
        const edition = await db.eventEdition.update({ where: { id: editionId }, data: { isPublished: true, status: nextStatus } });
        await db.activityLog.create({ data: { type: ActivityType.EDITION_PUBLISHED, tenantId: edition.tenantId, editionId, message: `Etkinlik yayınlandı: ${edition.name} — kayıt bağlantısı açık`, actorName: "Etkinlik Yöneticisi" } });
        return NextResponse.json(edition);
      }

      // ── Kişi birleştirme (çakışma çözümlü, tek işlemde — Kimlik kuralı 2) ──
      // Aynı edisyonda iki katılım @@unique([editionId, personId]) yüzünden taşınamaz:
      // resolutions[editionId] = "target" | "source" kazanan katılımı seçer; kaybeden katılımın
      // tüm geçmişi (kayıtlar, yaka kartları, taramalar, haklar, program, konaklama…) kazanan tarafına
      // taşınır ve boşalan katılım silinir — geçmiş silinmez, sahibi değişir.
      case "person.merge": {
        const { sourceId, targetId, resolutions, fillProfile } = body as {
          sourceId: string; targetId: string;
          resolutions?: Record<string, "target" | "source">;
          fillProfile?: boolean;
        };
        if (!sourceId || !targetId || sourceId === targetId) return NextResponse.json({ error: "Geçersiz birleştirme" }, { status: 400 });
        if (sourceId === targetId) return NextResponse.json({ error: "Kaynak ve hedef aynı olamaz" }, { status: 400 });

        // G0-d: iki taraf da bağlam kiracısına ait olmalı (çapraz-kiracı birleştirme 404)
        const mergeParties = await db.person.findMany({
          where: { id: { in: [sourceId, targetId] } },
          select: { id: true, tenantId: true },
        });
        if (mergeParties.length !== 2 || mergeParties.some((p) => p.tenantId !== ctx)) {
          return NextResponse.json({ error: "Kişi bulunamadı" }, { status: 404 });
        }

        const result = await db.$transaction(async (tx) => {
          const [source, target] = await Promise.all([
            tx.person.findUnique({ where: { id: sourceId } }),
            tx.person.findUnique({ where: { id: targetId } }),
          ]);
          if (!source || !target) throw new Error("Kişi bulunamadı");
          if (source.status === "MERGED" || target.status === "MERGED") throw new Error("Birleştirilmiş kayıt tekrar birleştirilemez");

          const srcParts = await tx.eventParticipation.findMany({ where: { personId: sourceId } });
          const tgtParts = await tx.eventParticipation.findMany({ where: { personId: targetId } });
          const tgtByEdition = new Map(tgtParts.map((p) => [p.editionId, p]));

          let mergedRegistrations = 0;
          let resolvedEditions = 0;

          // ── edisyon çakışmaları: kazanan katılıma geçmiş taşı, kaybedeni boşalt-sil ──
          for (const srcPart of srcParts) {
            const tgtPart = tgtByEdition.get(srcPart.editionId);
            if (!tgtPart) continue; // çakışmasız — aşağıda toplu taşınacak
            const winner: "target" | "source" = resolutions?.[srcPart.editionId] ?? "target";
            const keep = winner === "target" ? tgtPart : srcPart;
            const drop = winner === "target" ? srcPart : tgtPart;

            // kaybeden katılımın çocuklarını kazanan katılıma taşı (geçmiş korunur)
            const movedRegs = await tx.registration.updateMany({ where: { participationId: drop.id }, data: { participationId: keep.id } });
            mergedRegistrations += movedRegs.count;
            await tx.eventProfileSnapshot.updateMany({ where: { participationId: drop.id }, data: { participationId: keep.id } });
            await tx.badgeInstance.updateMany({ where: { participationId: drop.id }, data: { participationId: keep.id } });
            await tx.credential.updateMany({ where: { participationId: drop.id }, data: { participationId: keep.id } });
            await tx.scanEvent.updateMany({ where: { participationId: drop.id }, data: { participationId: keep.id } });
            await tx.entitlementClaim.updateMany({ where: { participationId: drop.id }, data: { participationId: keep.id } });
            await tx.programAssignment.updateMany({ where: { participationId: drop.id }, data: { participationId: keep.id } });
            await tx.reservation.updateMany({ where: { primaryGuestParticipationId: drop.id }, data: { primaryGuestParticipationId: keep.id } });
            await tx.occupancySlot.updateMany({ where: { participationId: drop.id }, data: { participationId: keep.id } });
            await tx.companion.updateMany({ where: { participationId: drop.id }, data: { participationId: keep.id } });
            await tx.orderLine.updateMany({ where: { participationId: drop.id }, data: { participationId: keep.id } });
            await tx.formAnswer.updateMany({ where: { participationId: drop.id }, data: { participationId: keep.id } });
            await tx.waitlistEntry.updateMany({ where: { participationId: drop.id }, data: { participationId: keep.id } });

            // benzersiz kısıtlı çocuklar: hedefte aynı kayıt varsa kaybeden silinir, yoksa taşınır
            const srcCerts = await tx.certificateIssue.findMany({ where: { participationId: drop.id } });
            for (const ci of srcCerts) {
              const dup = await tx.certificateIssue.findUnique({ where: { definitionId_participationId: { definitionId: ci.definitionId, participationId: keep.id } } });
              if (dup) await tx.certificateIssue.delete({ where: { id: ci.id } });
              else await tx.certificateIssue.update({ where: { id: ci.id }, data: { participationId: keep.id } });
            }
            const srcMembers = await tx.delegationMember.findMany({ where: { participationId: drop.id } });
            for (const dm of srcMembers) {
              const dup = await tx.delegationMember.findUnique({ where: { delegationId_participationId: { delegationId: dm.delegationId, participationId: keep.id } } });
              if (dup) await tx.delegationMember.delete({ where: { id: dm.id } });
              else await tx.delegationMember.update({ where: { id: dm.id }, data: { participationId: keep.id } });
            }
            // roller: aynı rol hedefte zaten varsa kopya oluşturma
            const keepRoles = await tx.eventRoleAssignment.findMany({ where: { participationId: keep.id }, select: { role: true } });
            const keepRoleSet = new Set(keepRoles.map((r) => r.role));
            const srcRoles = await tx.eventRoleAssignment.findMany({ where: { participationId: drop.id } });
            for (const ra of srcRoles) {
              if (keepRoleSet.has(ra.role)) await tx.eventRoleAssignment.delete({ where: { id: ra.id } });
              else await tx.eventRoleAssignment.update({ where: { id: ra.id }, data: { participationId: keep.id } });
            }

            // oda arkadaşı istekleri: taraf olunan katılımlar kazananı göstersin
            await tx.roommateRequest.updateMany({ where: { requesterParticipationId: drop.id }, data: { requesterParticipationId: keep.id } });
            await tx.roommateRequest.updateMany({ where: { targetParticipationId: drop.id }, data: { targetParticipationId: keep.id } });

            // boşalan katılım silinir — tüm çocukları taşındı, geçmiş kaybı yok
            await tx.eventParticipation.delete({ where: { id: drop.id } });
            resolvedEditions += 1;
          }

          // ── kişi-düzeyi taşımalar (artık çakışma yok) ──
          await tx.eventParticipation.updateMany({ where: { personId: sourceId }, data: { personId: targetId } });
          await tx.submission.updateMany({ where: { submitterId: sourceId }, data: { submitterId: targetId } });
          await tx.reviewAssignment.updateMany({ where: { reviewerId: sourceId }, data: { reviewerId: targetId } });
          await tx.scanEvent.updateMany({ where: { personId: sourceId }, data: { personId: targetId } });
          await tx.task.updateMany({ where: { assigneeId: sourceId }, data: { assigneeId: targetId } });
          await tx.organizationContact.updateMany({ where: { personId: sourceId }, data: { personId: targetId } });
          await tx.delegation.updateMany({ where: { leaderId: sourceId }, data: { leaderId: targetId } });
          await tx.waitlistEntry.updateMany({ where: { personId: sourceId }, data: { personId: targetId } });
          await tx.programAssignment.updateMany({ where: { personId: sourceId }, data: { personId: targetId } });
          // P3 (yeni-fazlar 12): önceki turda ele alınmamış ilişkiler — geçmiş KAYIP OLMADAN taşınır
          await tx.cvEntry.updateMany({ where: { personId: sourceId }, data: { personId: targetId } });
          await tx.sessionMaterial.updateMany({ where: { personId: sourceId }, data: { personId: targetId } });
          await tx.socialPlanAnnouncement.updateMany({ where: { personId: sourceId }, data: { personId: targetId } });
          await tx.portalToken.updateMany({ where: { personId: sourceId }, data: { personId: targetId } });
          // bağımlı/veli bağları: kaynak kişinin bağımlıları hedefi gösterir (PersonGuardian)
          await tx.person.updateMany({ where: { parentPersonId: sourceId }, data: { parentPersonId: targetId } });
          // B2B atamaları: personId ZORUNLU FK + @@unique([planId, personId]) —
          // hedefte aynı plan ataması varsa kaynağın ataması SİLİNİR (çakışma çözümü, audit'li)
          const srcB2b = await tx.b2bAssignment.findMany({ where: { personId: sourceId } });
          for (const ba of srcB2b) {
            const dup = await tx.b2bAssignment.findUnique({ where: { planId_personId: { planId: ba.planId, personId: targetId } } });
            if (dup) await tx.b2bAssignment.delete({ where: { id: ba.id } });
            else await tx.b2bAssignment.update({ where: { id: ba.id }, data: { personId: targetId } });
          }

          // yazarlıklar: aynı bildiride çift yazarlık satırı oluşmasın
          const srcAuthorships = await tx.authorship.findMany({ where: { personId: sourceId } });
          for (const au of srcAuthorships) {
            const dup = await tx.authorship.findFirst({ where: { submissionId: au.submissionId, personId: targetId } });
            if (dup) await tx.authorship.update({ where: { id: au.id }, data: { personId: null } }); // isimli harici yazar olarak kalır
            else await tx.authorship.update({ where: { id: au.id }, data: { personId: targetId } });
          }

          // profil: boş hedef alanları kaynaktan doldur (çakışanlar hedefte kalır — seçim kullanıcıda)
          if (fillProfile !== false) {
            const fill: Record<string, string> = {};
            for (const f of ["email", "phone", "title", "company", "city", "country", "bio"] as const) {
              if (!target[f] && source[f]) fill[f] = source[f] as string;
            }
            if (Object.keys(fill).length > 0) {
              await tx.person.update({ where: { id: targetId }, data: fill });
            }
          }

          await tx.person.update({ where: { id: sourceId }, data: { status: "MERGED", mergedIntoId: targetId } });
          await tx.activityLog.create({
            data: {
              type: ActivityType.PERSON_MERGED,
              message: `Kişi birleştirildi: ${source.firstName} ${source.lastName} → ${target.firstName} ${target.lastName} · ${mergedRegistrations} kayıt taşındı · CV/B2B/portal-token/bağımlı bağlar dahil tüm ilişkiler hedefe alındı${resolvedEditions > 0 ? ` · ${resolvedEditions} edisyonda çakışma çözüldü` : ""} (geçmiş korundu)`,
              actorName: "Operasyon",
            },
          });
          return { mergedRegistrations, resolvedEditions };
        });

        return NextResponse.json({ ok: true, ...result });
      }

      // ── LCV yanıtı (gelecek → kayıt yolu, gelmeyecek → hakkı bırakma kuralı) ──
      case "invitation.respond": {
        const { invitationId, response } = body as { invitationId: string; response: "COMING" | "NOT_COMING" };
        // G0-d: davetin edisyonu bağlama doğrulanır
        const invTarget = await db.invitation.findUnique({ where: { id: invitationId }, select: { editionId: true } });
        if (!invTarget) return NextResponse.json({ error: "Davet bulunamadı" }, { status: 404 });
        try { await verifyEditionTenant(invTarget.editionId); } catch (e) {
          if (e instanceof GuardError) return NextResponse.json({ error: e.message }, { status: e.status });
          throw e;
        }
        const inv = await db.invitation.update({ where: { id: invitationId }, data: { status: response, respondedAt: new Date() } });
        await db.activityLog.create({ data: { type: ActivityType.INVITATION_SENT, editionId: inv.editionId, message: `Davet yanıtı: ${inv.fullName} → ${response === "COMING" ? "Gelecek" : "Gelmeyecek"}`, entityType: "Invitation", entityId: inv.id, actorName: "LCV" } });
        return NextResponse.json(inv);
      }

      // ── Yetenek aç/kapa (modül menüsü §53 ile birlikte değişir) ──
      // İki kullanım: (a) mevcut satır: capabilityId; (b) satır hiç yoksa: editionId + key ile UPSERT.
      // (b) şart — hiç oluşturulmamış yetenek ayarlarında "yok" çipiyle kilitli kalıyordu (bug fix).
      case "capability.toggle": {
        const { capabilityId, editionId, key, enabled } = body as { capabilityId?: string; editionId?: string; key?: string; enabled: boolean };
        let cap;
        if (capabilityId) {
          // G0-d: mevcut satırın edisyonu bağlama doğrulanır
          const existing = await db.eventCapability.findUnique({ where: { id: capabilityId } });
          if (!existing) return NextResponse.json({ error: "Yetenek bulunamadı" }, { status: 404 });
          try { await verifyEditionTenant(existing.editionId); } catch (e) {
            if (e instanceof GuardError) return NextResponse.json({ error: e.message }, { status: e.status });
            throw e;
          }
          if (enabled) {
            const entitled = await isTenantCapabilityEntitled(ctx, existing.key, db);
            if (!entitled) {
              return NextResponse.json(
                {
                  error: `Bu yetenek (${existing.key}) platform sahibi (Firma A) tarafından kiracınız için yetkilendirilmemiştir`,
                  code: "PLATFORM_MODULE_UNENTITLED",
                },
                { status: 403 },
              );
            }
          }
          cap = await db.eventCapability.update({ where: { id: capabilityId }, data: { enabled } });
        } else if (editionId && key) {
          // G0-d: hedef edisyon bağlama doğrulanır
          try { await verifyEditionTenant(editionId); } catch (e) {
            if (e instanceof GuardError) return NextResponse.json({ error: e.message }, { status: e.status });
            throw e;
          }
          if (enabled) {
            const entitled = await isTenantCapabilityEntitled(ctx, key, db);
            if (!entitled) {
              return NextResponse.json(
                {
                  error: `Bu yetenek (${key}) platform sahibi (Firma A) tarafından kiracınız için yetkilendirilmemiştir`,
                  code: "PLATFORM_MODULE_UNENTITLED",
                },
                { status: 403 },
              );
            }
          }
          const existing = await db.eventCapability.findUnique({ where: { editionId_key: { editionId, key } } });
          cap = existing
            ? await db.eventCapability.update({ where: { id: existing.id }, data: { enabled } })
            : await db.eventCapability.create({ data: { editionId, key, enabled, setupNote: enabled ? "hazır" : "yapılacak" } });
        } else {
          return NextResponse.json({ error: "capabilityId ya da editionId+key gerekli" }, { status: 400 });
        }
        await db.activityLog.create({ data: { type: ActivityType.CAPABILITY_TOGGLED, editionId: cap.editionId, message: `Yetenek ${enabled ? "açıldı" : "kapatıldı"}: ${cap.key} — menü, formlar ve raporlar birlikte değişir`, actorName: "Etkinlik Yöneticisi" } });
        return NextResponse.json(cap);
      }

      // ── B2B: kişinin mobil uygulamadan yanıtı (kabul/red + görüş) ──
      case "b2b.respond": {
        const { assignmentId, accepted, feedback, respondedBy } = body as { assignmentId: string; accepted: boolean; feedback?: string; respondedBy?: string };
        // G0-d: atamanın plan edisyonu bağlama doğrulanır
        const bTarget = await db.b2bAssignment.findUnique({ where: { id: assignmentId }, select: { plan: { select: { editionId: true } } } });
        if (!bTarget) return NextResponse.json({ error: "Atama bulunamadı" }, { status: 404 });
        try { await verifyEditionTenant(bTarget.plan.editionId); } catch (e) {
          if (e instanceof GuardError) return NextResponse.json({ error: e.message }, { status: e.status });
          throw e;
        }
        const a = await db.b2bAssignment.update({
          where: { id: assignmentId },
          data: {
            status: accepted ? "ACCEPTED" : "DECLINED",
            personApproved: accepted,
            respondedAt: new Date(),
            feedback: feedback ?? null,
            feedbackAt: feedback ? new Date() : null,
          },
          include: { person: { select: { firstName: true, lastName: true } }, plan: { include: { assignments: true } } },
        });
        // karşılıklı onay denetimi: herkes kabul etti VE organizatör onayı varsa plan ACTIVE olur
        const plan = a.plan;
        const allAccepted = plan.assignments.length > 0 && plan.assignments.every((x) => x.status === "ACCEPTED");
        const anyApproved = plan.assignments.some((x) => x.organizerApproved);
        if (allAccepted && anyApproved && plan.status !== "ACTIVE" && plan.status !== "COMPLETED" && plan.status !== "CANCELLED") {
          await db.b2bPlan.update({ where: { id: plan.id }, data: { status: "ACTIVE" } });
        } else if (plan.status === "DRAFT" && plan.assignments.some((x) => x.status === "ACCEPTED" || x.status === "DECLINED")) {
          await db.b2bPlan.update({ where: { id: plan.id }, data: { status: "PENDING_APPROVAL" } });
        }
        await db.activityLog.create({ data: { type: ActivityType.TASK_SAVED, editionId: (await db.b2bPlan.findUnique({ where: { id: a.planId }, select: { editionId: true } }))?.editionId ?? null, message: `B2B yanıtı: ${a.person.firstName} ${a.person.lastName} → ${accepted ? "KABUL" : "RET"}${feedback ? ` — Görüş: ${feedback}` : ""} (${a.plan.subject})`, entityType: "B2bAssignment", entityId: a.id, actorName: respondedBy ?? "Mobil Uygulama" } });
        return NextResponse.json({ ...JSON.parse(JSON.stringify(a)), planActivated: allAccepted && anyApproved });
      }

      // ── B2B: organizatör onayı (karşılıklı onayın diğer ayağı) ──
      case "b2b.approve": {
        const { assignmentId, approved } = body as { assignmentId: string; approved: boolean };
        // G0-d: organizatör onayı plan edisyonu üzerinden doğrulanır
        const bTarget = await db.b2bAssignment.findUnique({ where: { id: assignmentId }, select: { plan: { select: { editionId: true } } } });
        if (!bTarget) return NextResponse.json({ error: "Atama bulunamadı" }, { status: 404 });
        try { await verifyEditionTenant(bTarget.plan.editionId); } catch (e) {
          if (e instanceof GuardError) return NextResponse.json({ error: e.message }, { status: e.status });
          throw e;
        }
        const a = await db.b2bAssignment.update({ where: { id: assignmentId }, data: { organizerApproved: approved }, include: { person: { select: { firstName: true, lastName: true } }, plan: { include: { assignments: true } } } });
        const plan = a.plan;
        const allAccepted = plan.assignments.length > 0 && plan.assignments.every((x) => x.status === "ACCEPTED");
        const anyApproved = plan.assignments.some((x) => x.organizerApproved);
        let activated = false;
        if (allAccepted && anyApproved && plan.status !== "COMPLETED" && plan.status !== "CANCELLED") {
          await db.b2bPlan.update({ where: { id: plan.id }, data: { status: "ACTIVE" } });
          activated = true;
        }
        await db.activityLog.create({ data: { type: ActivityType.TASK_SAVED, message: `B2B organizatör onayı: ${a.person.firstName} ${a.person.lastName} — ${approved ? "onaylandı" : "geri alındı"} (${a.plan.subject})`, entityType: "B2bAssignment", entityId: a.id, actorName: "Etkinlik Yöneticisi" } });
        return NextResponse.json({ ok: true, planActivated: activated });
      }

      default:
        return NextResponse.json({ error: `Bilinmeyen aksiyon: ${action}` }, { status: 400 });
    }
  } catch (e) {
    console.error("POST /api/flows", e);
    const msg = e instanceof Error ? e.message : "Akış işlenemedi";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

async function recalcOrder(orderId: string) {
  const order = await db.order.findUnique({ where: { id: orderId }, include: { lines: true, payments: true, refunds: true } });
  if (!order) return;
  const linesTotal = order.lines.reduce((s, l) => s + l.total, 0) || order.totalAmount;
  const paid = order.payments.filter((p) => p.status === "SUCCEEDED").reduce((s, p) => s + p.amount, 0);
  const refunded = order.refunds.filter((r) => r.status === "PROCESSED").reduce((s, r) => s + r.amount, 0);
  const balance = linesTotal - paid + refunded;
  const status = order.status === "CANCELLED" ? "CANCELLED" : balance <= 0 ? "PAID" : paid > 0 ? "PARTIALLY_PAID" : "OPEN" // F6: kuruş tamlığı;
  await db.order.update({ where: { id: orderId }, data: { totalAmount: linesTotal, status } });
}

async function recomputeEntitlement(entitlementId: string) {
  const ent = await db.entitlement.findUnique({ where: { id: entitlementId }, include: { claims: true } });
  if (!ent) return;
  const consumed = ent.claims.filter((c) => c.status === "CONSUMED").length;
  const reserved = ent.claims.filter((c) => c.status === "RESERVED").length;
  await db.entitlement.update({ where: { id: entitlementId }, data: { quantityConsumed: consumed, quantityReserved: reserved } });
}

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
