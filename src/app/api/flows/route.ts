// /api/flows — İş akışları (domain event güdümlü, §46-47)
// Aksiyonlar: registration.decide, registration.cancel, sponsor.guest,
//             finance.manualPayment, finance.refund, booth.allocate,
//             reservation.confirm, certificate.generate, edition.publish,
//             person.merge, invitation.respond
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ActivityType } from "@/lib/api/activity";

type FlowBody = Record<string, unknown> & { action?: string };

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as FlowBody;
    const action = body.action;

    switch (action) {
      // ── Kayıt onay/red (Kayıt sorumlusu) ──
      case "registration.decide": {
        const { registrationId, decision, decidedBy } = body as { registrationId: string; decision: "CONFIRMED" | "REJECTED"; decidedBy?: string };
        const reg = await db.registration.update({
          where: { id: registrationId },
          data: { status: decision, decidedAt: new Date(), decidedBy: decidedBy ?? "Kayıt Sorumlusu" },
          include: { participation: { include: { person: true, registrations: true } }, category: true },
        });
        // CONFIRMED ise sponsorship claim'i CONSUMED'a geçir (davette ayır, onayda kullan)
        if (decision === "CONFIRMED") {
          const claims = await db.entitlementClaim.findMany({ where: { registrationId } });
          for (const c of claims) {
            if (c.status === "RESERVED") {
              await db.entitlementClaim.update({ where: { id: c.id }, data: { status: "CONSUMED", consumedAt: new Date() } });
            }
            if (c.entitlementId) {
              await recomputeEntitlement(c.entitlementId);
            }
          }
          // rozet READY (uygun)
          await db.badgeInstance.updateMany({ where: { participationId: reg.participationId, status: "NOT_ELIGIBLE" }, data: { status: "READY" } });
        }
        await db.activityLog.create({ data: { type: decision === "CONFIRMED" ? ActivityType.REGISTRATION_CONFIRMED : ActivityType.REGISTRATION_SAVED, editionId: reg.editionId, message: `Kayıt ${decision === "CONFIRMED" ? "onaylandı" : "reddedildi"}: ${reg.participation.person.firstName} ${reg.participation.person.lastName}`, entityType: "Registration", entityId: reg.id, actorName: decidedBy ?? "Kayıt Sorumlusu" } });
        return NextResponse.json(reg);
      }

      // ── Kayıt iptali (etki önizlemesi: rozet + hak + ödeme ayrıca) ──
      case "registration.cancel": {
        const { registrationId, reason } = body as { registrationId: string; reason?: string };
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
        await db.activityLog.create({ data: { type: ActivityType.REGISTRATION_CANCELLED, editionId: reg.editionId, message: `Kayıt iptal edildi: ${reg.participation.person.firstName} ${reg.participation.person.lastName} — rozet ve haklar etkilenir`, entityType: "Registration", entityId: reg.id, actorName: "Yönetici" } });
        return NextResponse.json(reg);
      }

      // ── Sponsor misafiri ekle (09-C: Person→Participation→Registration→Claim) ──
      case "sponsor.guest": {
        const { entitlementId, firstName, lastName, email, company, category } = body as {
          entitlementId: string; firstName: string; lastName: string; email: string; company?: string; category?: string;
        };
        const ent = await db.entitlement.findUnique({ where: { id: entitlementId }, include: { ownerOrganization: true } });
        if (!ent) return NextResponse.json({ error: "Hak havuzu bulunamadı" }, { status: 404 });

        const used = ent.quantityConsumed + ent.quantityReserved;
        if (used >= ent.quantityGranted) {
          return NextResponse.json({ error: `Kalan hak yok (${ent.quantityConsumed}/${ent.quantityGranted} kullanıldı, ${ent.quantityReserved} ayrılmış)` }, { status: 409 });
        }
        if (!ent.editionId) return NextResponse.json({ error: "Etkinlik bağlantısı yok" }, { status: 400 });

        // 1) Person: e-posta güçlü işaret — aynı e-posta varsa o kişi kullanılır
        let person = await db.person.findFirst({ where: { email, tenantId: { not: "" } } });
        if (!person) {
          const tenant = await db.tenant.findFirst();
          person = await db.person.create({ data: { tenantId: tenant!.id, firstName, lastName, email, company: company ?? ent.ownerOrganization?.name } });
        }

        // 2) Participation (sponsor portal kaynağı)
        const participation = await db.eventParticipation.upsert({
          where: { editionId_personId: { editionId: ent.editionId, personId: person.id } },
          create: { editionId: ent.editionId, personId: person.id, source: "SPONSOR_PORTAL" },
          update: { source: "SPONSOR_PORTAL" },
        });

        // 3) Registration — SPONSOR_ENTITLEMENT funding; ücretsiz (NOT_REQUIRED ödeme ekseni)
        const registration = await db.registration.create({
          data: {
            editionId: ent.editionId,
            participationId: participation.id,
            source: "SPONSOR_PORTAL",
            fundingSource: "SPONSOR_ENTITLEMENT",
            status: "PENDING_APPROVAL",
            submittedAt: new Date(),
            notes: `Sponsor misafiri — ${ent.ownerOrganization?.name ?? ""} (${ent.label})`,
          },
        });

        // 4) Claim: RESERVED (davette ayır, onayda kullanılır)
        const claim = await db.entitlementClaim.create({
          data: { entitlementId: ent.id, participationId: participation.id, registrationId: registration.id, status: "RESERVED", guestName: `${firstName} ${lastName}` },
        });
        await recomputeEntitlement(ent.id);

        await db.activityLog.create({ data: { type: ActivityType.CLAIM_SAVED, editionId: ent.editionId, message: `Sponsor misafiri ayrıldı: ${firstName} ${lastName} → ${ent.label} (#${used + 1})`, entityType: "EntitlementClaim", entityId: claim.id, actorName: "Sponsor Portalı" } });
        return NextResponse.json({ claim, registration, participation }, { status: 201 });
      }

      // ── Manuel ödeme teyidi (§38: doğrudan status değiştirme YASAK) ──
      case "finance.manualPayment": {
        const { orderId, amount, currency = "TRY", reference, enteredBy, reason } = body as { orderId: string; amount: number; currency?: string; reference?: string; enteredBy?: string; reason?: string };
        if (!amount || amount <= 0) return NextResponse.json({ error: "Tutar zorunlu" }, { status: 400 });
        if (!reason) return NextResponse.json({ error: "Manuel teyit için gerekçe zorunlu (denetim)" }, { status: 400 });

        const payment = await db.payment.create({
          data: { orderId, amount, currency, source: "MANUAL_EXTERNAL", status: "SUCCEEDED", reference, enteredBy: enteredBy ?? "Finans Sorumlusu", reason, approvedBy: (amount ?? 0) > 50000 ? "Tenant Sahibi" : undefined, paidAt: new Date() },
        });
        await recalcOrder(orderId);
        await db.activityLog.create({ data: { type: ActivityType.PAYMENT_RECEIVED, message: `Manuel tahsilat: ${amount} ${currency} — ${reason}`, entityType: "Payment", entityId: payment.id, actorName: enteredBy ?? "Finans Sorumlusu" } });
        return NextResponse.json(payment, { status: 201 });
      }

      // ── İade talebi/onayı (iade ≠ iptal; hak iadesi ayrı adım) ──
      case "finance.refund": {
        const { orderId, amount, reason, requestedBy } = body as { orderId: string; amount: number; reason?: string; requestedBy?: string };
        const refund = await db.refund.create({ data: { orderId, amount, reason, status: "PROCESSED", requestedBy, processedAt: new Date() } });
        await recalcOrder(orderId);
        await db.activityLog.create({ data: { type: ActivityType.REFUND_SAVED, message: `İade işlendi: ${amount} — ${reason ?? ""}`, entityType: "Refund", entityId: refund.id, actorName: requestedBy ?? "Finans Sorumlusu" } });
        return NextResponse.json(refund, { status: 201 });
      }

      // ── Stand tahsisi (SponsorAgreement → Entitlement → Allocation → A24) ──
      case "booth.allocate": {
        const { boothUnitId, agreementId, organizationId } = body as { boothUnitId: string; agreementId?: string; organizationId?: string };
        const booth = await db.boothUnit.findUnique({ where: { id: boothUnitId } });
        if (!booth) return NextResponse.json({ error: "Stant bulunamadı" }, { status: 404 });
        if (!["AVAILABLE", "HELD", "OPTION", "RELEASED"].includes(booth.status)) {
          return NextResponse.json({ error: `Stant ${booth.status} durumunda — tahsis edilemez` }, { status: 409 });
        }
        const alloc = await db.boothAllocation.upsert({
          where: { boothUnitId },
          create: { boothUnitId, agreementId, organizationId, status: "RESERVED" },
          update: { agreementId, organizationId, status: "RESERVED" },
          include: { boothUnit: true, organization: true, agreement: true },
        });
        await db.boothUnit.update({ where: { id: boothUnitId }, data: { status: "RESERVED" } });
        await db.activityLog.create({ data: { type: ActivityType.BOOTH_ALLOCATED, editionId: booth.editionId, message: `Stand tahsis edildi: ${booth.code} (${booth.sizeSqm} m²)`, entityType: "BoothAllocation", entityId: alloc.id, actorName: "Sponsorluk Yöneticisi" } });
        return NextResponse.json(alloc, { status: 201 });
      }

      // ── Rezervasyon teyidi — her gece stok kontrolü (§09-E) ──
      case "reservation.confirm": {
        const { reservationId } = body as { reservationId: string };
        const res = await db.reservation.findUnique({ where: { id: reservationId }, include: { block: { include: { inventoryNights: true } } } });
        if (!res) return NextResponse.json({ error: "Rezervasyon bulunamadı" }, { status: 404 });
        if (!res.block) return NextResponse.json({ error: "Oda bloğu bağlantısı yok" }, { status: 400 });

        const nights: Date[] = [];
        const cur = new Date(res.checkIn);
        while (cur < res.checkOut) { nights.push(new Date(cur)); cur.setDate(cur.getDate() + 1); }

        // bir gece eksikse teyit görünmez (§09-E)
        const missing: string[] = [];
        for (const n of nights) {
          const inv = res.block.inventoryNights.find((i) => sameDay(i.date, n));
          if (!inv) { missing.push(n.toLocaleDateString("tr-TR")); continue; }
          if (inv.reservedRooms + 1 > inv.totalRooms) { missing.push(`${n.toLocaleDateString("tr-TR")} (stok yok)`); }
        }
        if (missing.length > 0) {
          return NextResponse.json({ error: `Teyit engellendi — şu gecelerde stok yetersiz: ${missing.join(", ")}` }, { status: 409 });
        }
        // stok tüket
        for (const n of nights) {
          const inv = res.block.inventoryNights.find((i) => sameDay(i.date, n))!;
          await db.inventoryNight.update({ where: { id: inv.id }, data: { reservedRooms: inv.reservedRooms + 1 } });
        }
        const updated = await db.reservation.update({ where: { id: reservationId }, data: { status: "CONFIRMED" }, include: { block: { include: { hotel: true, roomType: true } } } });
        await db.activityLog.create({ data: { type: ActivityType.RESERVATION_SAVED, editionId: res.editionId, message: `Rezervasyon teyit edildi: ${res.guestName} — ${nights.length} oda-gece tüketildi`, entityType: "Reservation", entityId: res.id, actorName: "Otel Sorumlusu" } });
        return NextResponse.json(updated);
      }

      // ── Sertifika üretimi (uygunluk kuralı kontrolü, §43) ──
      case "certificate.generate": {
        const { definitionId } = body as { definitionId: string };
        const def = await db.certificateDefinition.findUnique({ where: { id: definitionId }, include: { issues: { include: { participation: { include: { registrations: true, scanEvents: true } } } } } });
        if (!def) return NextResponse.json({ error: "Kural bulunamadı" }, { status: 404 });
        if (!def.editionId) return NextResponse.json({ error: "Etkinlik yok" }, { status: 400 });

        const participations = await db.eventParticipation.findMany({ where: { editionId: def.editionId }, include: { registrations: true, scanEvents: true } });
        let eligible = 0;
        for (const p of participations) {
          const reg = p.registrations?.[0];
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
        const dashRes = await fetch(`${req.nextUrl.origin}/api/dashboard?editionId=${editionId}`);
        const dash = await dashRes.json();
        if (dash.checks?.blockers?.length > 0) {
          return NextResponse.json({ error: `Yayın engellendi: ${dash.checks.blockers[0].message}`, checks: dash.checks }, { status: 409 });
        }
        const edition = await db.eventEdition.update({ where: { id: editionId }, data: { isPublished: true, status: "REGISTRATION" } });
        await db.activityLog.create({ data: { type: ActivityType.EDITION_PUBLISHED, tenantId: edition.tenantId, editionId, message: `Etkinlik yayınlandı: ${edition.name} — kayıt bağlantısı açık`, actorName: "Etkinlik Yöneticisi" } });
        return NextResponse.json(edition);
      }

      // ── Kişi birleştirme (önerili + onaylı, geçmişi koruyarak) ──
      case "person.merge": {
        const { sourceId, targetId } = body as { sourceId: string; targetId: string };
        if (!sourceId || !targetId || sourceId === targetId) return NextResponse.json({ error: "Geçersiz birleştirme" }, { status: 400 });
        // katılımları taşı
        await db.eventParticipation.updateMany({ where: { personId: sourceId }, data: { personId: targetId } });
        await db.submission.updateMany({ where: { submitterId: sourceId }, data: { submitterId: targetId } });
        await db.authorship.updateMany({ where: { personId: sourceId }, data: { personId: targetId } });
        await db.reviewAssignment.updateMany({ where: { reviewerId: sourceId }, data: { reviewerId: targetId } });
        await db.scanEvent.updateMany({ where: { personId: sourceId }, data: { personId: targetId } });
        await db.person.update({ where: { id: sourceId }, data: { status: "MERGED", mergedIntoId: targetId } });
        await db.activityLog.create({ data: { type: ActivityType.PERSON_MERGED, message: `Kişi birleştirildi: ${sourceId.slice(-6)} → ${targetId.slice(-6)} (geçmiş korundu)`, actorName: "Operasyon" } });
        return NextResponse.json({ ok: true });
      }

      // ── LCV yanıtı (gelecek → kayıt yolu, gelmeyecek → hakkı bırakma kuralı) ──
      case "invitation.respond": {
        const { invitationId, response } = body as { invitationId: string; response: "COMING" | "NOT_COMING" };
        const inv = await db.invitation.update({ where: { id: invitationId }, data: { status: response, respondedAt: new Date() } });
        await db.activityLog.create({ data: { type: ActivityType.INVITATION_SENT, editionId: inv.editionId, message: `Davet yanıtı: ${inv.fullName} → ${response === "COMING" ? "Gelecek" : "Gelmeyecek"}`, entityType: "Invitation", entityId: inv.id, actorName: "LCV" } });
        return NextResponse.json(inv);
      }

      // ── Yetenek aç/kapa (modül menüsü §53 ile birlikte değişir) ──
      case "capability.toggle": {
        const { capabilityId, enabled } = body as { capabilityId: string; enabled: boolean };
        const cap = await db.eventCapability.update({ where: { id: capabilityId }, data: { enabled } });
        await db.activityLog.create({ data: { type: ActivityType.CAPABILITY_TOGGLED, editionId: cap.editionId, message: `Yetenek ${enabled ? "açıldı" : "kapatıldı"}: ${cap.key} — menü, formlar ve raporlar birlikte değişir`, actorName: "Etkinlik Yöneticisi" } });
        return NextResponse.json(cap);
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
  const status = order.status === "CANCELLED" ? "CANCELLED" : balance <= 0.01 ? "PAID" : paid > 0.01 ? "PARTIALLY_PAID" : "OPEN";
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
