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
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { ActivityType } from "@/lib/api/activity";
import { enforceRateLimit, enforceRateLimitById } from "@/lib/rate-limit";
import { validatePortalToken } from "@/lib/api/portal-tokens";
import { checkSponsorScope } from "@/lib/portal/sponsor-scope";
import { planStaffAdd, decideStaffLink, decideStaffRemove, STAFF_ROLE, STAFF_SOURCE } from "@/lib/portal/sponsor-staff";
import { validateLeadInput, leadExpiryFrom } from "@/lib/leads/capture";
import { decideMeetingTransition, slotsOverlap } from "@/lib/meetings/requests";
import { publishOutbox, type OutboxClient } from "@/lib/integrations/outbox";

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
      const { deliverableId, actor, notes, proofUrl } = body as { deliverableId: string; actor?: string; notes?: unknown; proofUrl?: unknown };
      const d = await db.deliverable.findUnique({ where: { id: deliverableId }, include: { agreement: { include: { organization: true, edition: true } } } });
      if (!d) return NextResponse.json({ error: "Teslim bulunamadı" }, { status: 404 });
      // G0-c + P20.1: belirteç, teslimin SAHİBİ olan sözleşme kurumunun belirteci
      // olmalı; anlaşma-kapsamlı jeton yalnız o anlaşmanın teslimine işler.
      if (!checkSponsorScope(cap, { editionId: d.agreement.editionId, organizationId: d.agreement.organizationId, agreementId: d.agreementId }).ok) {
        return NextResponse.json({ error: "Teslim bulunamadı" }, { status: 404 });
      }
      if (!SUBMITTABLE.includes(d.status)) {
        return NextResponse.json({ error: `Teslim ${d.status} durumunda — gönderim uygun değil` }, { status: 409 });
      }
      // P13 sözleşmesi (portal bypass'ı kapalı): SUBMITTED kanıt ister.
      const noteStr = typeof notes === "string" ? notes.trim() : "";
      const urlStr = typeof proofUrl === "string" ? proofUrl.trim() : "";
      if (!noteStr && !urlStr && !d.notes?.trim() && !d.proofUrl?.trim()) {
        return NextResponse.json({ error: "Gönderim kanıt ister: notes ya da proofUrl doldurun" }, { status: 400 });
      }
      const updated = await db.deliverable.update({
        where: { id: d.id },
        data: { status: "SUBMITTED", ...(noteStr ? { notes: noteStr } : {}), ...(urlStr ? { proofUrl: urlStr } : {}) },
      });
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

    // ── Sponsor portalı: stand personeli ekleme ──────────────────────────
    if (action === "staff-add") {
      const { personId, firstName, lastName, email, actor } = body as {
        personId?: string; firstName?: string; lastName?: string; email?: string; actor?: string;
      };
      if (cap.scope !== "SPONSOR" || !cap.organizationId) {
        return NextResponse.json({ error: "Erişim belirteci geçersiz" }, { status: 404 });
      }
      const edition = await db.eventEdition.findUnique({
        where: { id: cap.editionId },
        select: { id: true, tenantId: true },
      });
      const org = await db.organization.findUnique({ where: { id: cap.organizationId }, select: { id: true, name: true, tenantId: true } });
      if (!edition || !org || org.tenantId !== edition.tenantId) {
        return NextResponse.json({ error: "Etkinlik bulunamadı" }, { status: 404 });
      }
      const [byId, byEmail] = await Promise.all([
        typeof personId === "string" && personId
          ? db.person.findFirst({ where: { id: personId, tenantId: edition.tenantId }, select: { id: true, status: true, firstName: true, lastName: true, company: true } })
          : Promise.resolve(null),
        typeof email === "string" && email.trim()
          ? db.person.findFirst({ where: { tenantId: edition.tenantId, email: email.trim().toLowerCase() }, select: { id: true, status: true, firstName: true, lastName: true, company: true } })
          : Promise.resolve(null),
      ]);
      const plan = planStaffAdd({ personId, firstName, lastName, email }, { byId, byEmail });
      if (!plan.ok) return NextResponse.json({ error: plan.error }, { status: plan.status });

      let resolvedPersonId = plan.personId;
      if (plan.createPerson) {
        const created = await db.person.create({
          data: {
            tenantId: edition.tenantId,
            firstName: plan.createPerson.firstName,
            lastName: plan.createPerson.lastName,
            email: plan.createPerson.email,
            company: org.name,
          },
        });
        resolvedPersonId = created.id;
      } else if (plan.setCompany && resolvedPersonId) {
        await db.person.update({ where: { id: resolvedPersonId }, data: { company: org.name } });
      }
      const pid = resolvedPersonId as string;
      const participation = await db.eventParticipation.findFirst({
        where: { editionId: edition.id, personId: pid },
        select: { id: true, editionId: true, source: true },
      });
      const staffRole = participation
        ? await db.eventRoleAssignment.findFirst({ where: { participationId: participation.id, role: STAFF_ROLE }, select: { id: true, status: true } })
        : null;
      const link = decideStaffLink({ participation, staffRole }, edition.id);
      if (!link.ok) return NextResponse.json({ error: link.error }, { status: link.status });

      const participationId = link.reuseParticipationId ?? (await db.eventParticipation.create({
        data: { editionId: edition.id, personId: pid, source: STAFF_SOURCE },
      })).id;
      const role = await db.eventRoleAssignment.create({
        data: { participationId, role: STAFF_ROLE, status: "INVITED" },
      });
      await db.activityLog.create({
        data: {
          type: ActivityType.ROLE_ASSIGNED,
          editionId: edition.id,
          message: `Portal: stand personeli eklendi — ${org.name} (onay bekliyor)`,
          entityType: "EventParticipation",
          entityId: participationId,
          actorName: actor ?? `Sponsor Portalı — ${org.name}`,
        },
      });
      return NextResponse.json({ ok: true, participationId, personId: pid, roleStatus: role.status });
    }

    // ── Sponsor portalı: stand personeli çıkarma (rol düşürme) ───────────
    if (action === "staff-remove") {
      const { participationId, actor } = body as { participationId: string; actor?: string };
      if (cap.scope !== "SPONSOR" || !cap.organizationId) {
        return NextResponse.json({ error: "Erişim belirteci geçersiz" }, { status: 404 });
      }
      const org = await db.organization.findUnique({ where: { id: cap.organizationId }, select: { name: true } });
      const par = typeof participationId === "string" && participationId
        ? await db.eventParticipation.findUnique({
            where: { id: participationId },
            include: {
              person: { select: { company: true, firstName: true, lastName: true } },
              roleAssignments: { where: { role: STAFF_ROLE }, select: { id: true } },
              registrations: { where: { status: "CONFIRMED" }, select: { id: true } },
            },
          })
        : null;
      const decision = decideStaffRemove(
        par ? {
          id: par.id, editionId: par.editionId, source: par.source,
          personCompany: par.person.company, staffRoleId: par.roleAssignments[0]?.id ?? null,
          confirmedRegistrations: par.registrations.length,
        } : null,
        { editionId: cap.editionId, orgName: org?.name ?? "" },
      );
      if (!decision.ok) return NextResponse.json({ error: decision.error }, { status: decision.status });
      // katılım kaydı korunur (geçmiş silinmez); yalnız stand rolü düşürülür
      await db.eventRoleAssignment.deleteMany({ where: { participationId: par!.id, role: STAFF_ROLE } });
      await db.activityLog.create({
        data: {
          type: ActivityType.ROLE_ASSIGNED,
          editionId: cap.editionId,
          message: `Portal: stand personeli çıkarıldı — ${par!.person.firstName} ${par!.person.lastName} (${org?.name ?? ""})`,
          entityType: "EventParticipation",
          entityId: par!.id,
          actorName: actor ?? `Sponsor Portalı — ${org?.name ?? ""}`,
        },
      });
      return NextResponse.json({ ok: true });
    }

    // ── Sponsor portalı: lead yakalama (rozet tarama / manuel) ──────────
    if (action === "lead-capture") {
      const { agreementId, credentialCode, personId, email, staffParticipationId, note, rating, channel, purpose, clientKey, actor } = body as {
        agreementId?: string; credentialCode?: string; personId?: string; email?: string;
        staffParticipationId?: string; note?: string | null; rating?: string | null; channel?: string;
        purpose?: string; clientKey?: string | null; actor?: string;
      };
      if (cap.scope !== "SPONSOR" || !cap.organizationId) {
        return NextResponse.json({ error: "Erişim belirteci geçersiz" }, { status: 404 });
      }
      // hedef anlaşma: jeton kapsamlıysa o (gövde çelişirse 404); değilse gövdede ZORUNLU
      const bodyAgreementId = typeof agreementId === "string" && agreementId ? agreementId : null;
      if (cap.agreementId && bodyAgreementId && cap.agreementId !== bodyAgreementId) {
        return NextResponse.json({ error: "Anlaşma bulunamadı" }, { status: 404 });
      }
      const targetAgreementId = cap.agreementId ?? bodyAgreementId;
      if (!targetAgreementId) {
        return NextResponse.json({ error: "agreementId zorunlu" }, { status: 400 });
      }
      const agreement = await db.sponsorAgreement.findFirst({
        where: { id: targetAgreementId, editionId: cap.editionId, organizationId: cap.organizationId },
        select: { id: true, status: true, edition: { select: { tenantId: true } }, organization: { select: { name: true } } },
      });
      if (!agreement) return NextResponse.json({ error: "Anlaşma bulunamadı" }, { status: 404 });
      if (agreement.status === "CANCELLED") {
        return NextResponse.json({ error: "İptal edilmiş anlaşmaya lead işlenemez" }, { status: 409 });
      }

      // taranan kişi çözümleme: rozet kodu → kişi → katılım (hepsi aynı edisyon)
      let scannedPersonId: string | null = null;
      if (typeof credentialCode === "string" && credentialCode.trim()) {
        const cred = await db.credential.findFirst({
          where: { code: credentialCode.trim(), status: "ACTIVE", participation: { editionId: cap.editionId } },
          select: { participation: { select: { personId: true } } },
        });
        if (!cred) return NextResponse.json({ error: "Rozet bulunamadı" }, { status: 404 });
        scannedPersonId = cred.participation.personId;
      } else if (typeof personId === "string" && personId) {
        const par = await db.eventParticipation.findFirst({
          where: { editionId: cap.editionId, personId },
          select: { personId: true },
        });
        if (!par) return NextResponse.json({ error: "Katılımcı bulunamadı" }, { status: 404 });
        scannedPersonId = par.personId;
      } else if (typeof email === "string" && email.trim()) {
        const person = await db.person.findFirst({
          where: { tenantId: agreement.edition.tenantId, email: email.trim().toLowerCase() },
          select: { id: true },
        });
        const par = person
          ? await db.eventParticipation.findFirst({ where: { editionId: cap.editionId, personId: person.id }, select: { personId: true } })
          : null;
        if (!par) return NextResponse.json({ error: "Katılımcı bulunamadı" }, { status: 404 });
        scannedPersonId = par.personId;
      } else {
        return NextResponse.json({ error: "credentialCode, personId ya da email zorunlu" }, { status: 400 });
      }

      // taramayı yapan personel (seçimli aidiyet — kurum personeli doğrulanır)
      let capturedByPersonId: string | null = null;
      if (typeof staffParticipationId === "string" && staffParticipationId) {
        const staff = await db.eventParticipation.findFirst({
          where: {
            id: staffParticipationId, editionId: cap.editionId,
            person: { company: agreement.organization?.name ?? "" },
            roleAssignments: { some: { role: STAFF_ROLE } },
          },
          select: { personId: true },
        });
        if (!staff) return NextResponse.json({ error: "Personel kaydı bulunamadı" }, { status: 404 });
        capturedByPersonId = staff.personId;
      }

      const checked = validateLeadInput({ channel, note, rating, purpose, clientKey });
      if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: 400 });
      const scanned = await db.person.findUnique({
        where: { id: scannedPersonId },
        select: { consentVersion: true, firstName: true, lastName: true },
      });
      if (!scanned) return NextResponse.json({ error: "Katılımcı bulunamadı" }, { status: 404 });

      // TEK lead kuralı: clientKey varsa (çevrimdışı kuyruk tekrarı) anahtar,
      // yoksa anlaşma+kişi üzerinden çözülür — tekrar günceller, çoğaltmaz.
      // P22.1: lead yazımı + outbox yayını AYNI transaction'da (çift-yazım yok).
      const touchData = {
        channel: checked.channel,
        consentPurpose: checked.purpose,
        ...(checked.note !== null || note !== undefined ? { note: checked.note } : {}),
        ...(checked.rating ? { rating: checked.rating } : {}),
        ...(capturedByPersonId ? { capturedByPersonId } : {}),
        capturedAt: new Date(),
      };
      const { lead, updated } = await db.$transaction(async (tx) => {
        const findExisting = () => checked.clientKey
          ? tx.leadCapture.findUnique({
              where: { agreementId_clientKey: { agreementId: agreement.id, clientKey: checked.clientKey as string } },
              select: { id: true },
            })
          : tx.leadCapture.findUnique({
              where: { agreementId_personId: { agreementId: agreement.id, personId: scannedPersonId } },
              select: { id: true },
            });
        const existing = await findExisting();
        let row: { id: string; capturedAt: Date };
        let wasUpdated = !!existing;
        if (existing) {
          row = await tx.leadCapture.update({ where: { id: existing.id }, data: touchData });
        } else {
          try {
            row = await tx.leadCapture.create({
              data: {
                editionId: cap.editionId, agreementId: agreement.id, personId: scannedPersonId,
                capturedByPersonId, ...touchData,
                clientKey: checked.clientKey,
                consentAtCapture: scanned.consentVersion,
                expiresAt: leadExpiryFrom(),
              },
            });
          } catch (e) {
            // yarış/çift anahtar: aynı kişi farklı clientKey ile ya da eşzamanlı
            // tekrar — kaybeden mevcut lead'i okuyup günceller (yakınsar).
            if (!(e instanceof Prisma.PrismaClientKnownRequestError) || e.code !== "P2002") throw e;
            const raced = (await findExisting()) ?? (await tx.leadCapture.findUnique({
              where: { agreementId_personId: { agreementId: agreement.id, personId: scannedPersonId } },
              select: { id: true },
            }));
            if (!raced) throw e;
            // kişi-eşleşmesine düşüldüyse tekrar anahtarı sahiplenilir (sonraki
            // tekrarlar anahtardan çözülür; anahtar boşta — findExisting null'dı).
            row = await tx.leadCapture.update({
              where: { id: raced.id },
              data: checked.clientKey ? { ...touchData, clientKey: checked.clientKey } : touchData,
            });
            wasUpdated = true;
          }
        }
        await publishOutbox(tx as unknown as OutboxClient, {
          tenantId: agreement.edition.tenantId,
          editionId: cap.editionId,
          aggregateType: "LEAD",
          aggregateId: row.id,
          eventType: "lead.captured",
          payload: {
            leadId: row.id, agreementId: agreement.id,
            channel: checked.channel, rating: checked.rating, purpose: checked.purpose,
          },
          idempotencyKey: `lead:${row.id}:${row.capturedAt.getTime()}`,
        });
        return { lead: row, updated: wasUpdated };
      });
      await db.activityLog.create({
        data: {
          type: ActivityType.LEAD_CAPTURED,
          editionId: cap.editionId,
          message: `Portal: lead yakalandı — ${agreement.organization?.name ?? ""} (${checked.channel}${updated ? ", güncellendi" : ""})`,
          entityType: "LeadCapture",
          entityId: lead.id,
          actorName: actor ?? `Sponsor Portalı — ${agreement.organization?.name ?? ""}`,
        },
      });
      return NextResponse.json({ ok: true, leadId: lead.id, updated });
    }

    // ── Sponsor portalı: görüşme kararı (onay/red/iptal) ────────────────
    if (action === "meeting-decide") {
      const { meetingId, decision, actor } = body as { meetingId: string; decision: string; actor?: string };
      if (cap.scope !== "SPONSOR" || !cap.organizationId) {
        return NextResponse.json({ error: "Erişim belirteci geçersiz" }, { status: 404 });
      }
      if (decision !== "CONFIRMED" && decision !== "DECLINED" && decision !== "CANCELLED") {
        return NextResponse.json({ error: "Karar CONFIRMED, DECLINED ya da CANCELLED olmalı" }, { status: 400 });
      }
      const meeting = await db.meetingRequest.findUnique({
        where: { id: meetingId },
        include: { agreement: { include: { organization: true } } },
      });
      if (!meeting) return NextResponse.json({ error: "Görüşme bulunamadı" }, { status: 404 });
      if (!checkSponsorScope(cap, {
        editionId: meeting.editionId,
        organizationId: meeting.agreement.organizationId,
        agreementId: meeting.agreementId,
      }).ok) {
        return NextResponse.json({ error: "Görüşme bulunamadı" }, { status: 404 });
      }
      const transition = decideMeetingTransition(meeting.status, decision);
      if (!transition.ok) return NextResponse.json({ error: transition.error }, { status: transition.status });
      // onaylı görüşmeler aynı anlaşmada çakışamaz
      if (decision === "CONFIRMED") {
        const confirmed = await db.meetingRequest.findMany({
          where: { agreementId: meeting.agreementId, status: "CONFIRMED", id: { not: meeting.id } },
          select: { slotStart: true, slotEnd: true },
        });
        const clash = confirmed.some((c) => slotsOverlap(meeting.slotStart, meeting.slotEnd, c.slotStart, c.slotEnd));
        if (clash) {
          return NextResponse.json({ error: "Bu saatte onaylı başka görüşme var" }, { status: 409 });
        }
      }
      // P22.1: karar yazımı + outbox yayını AYNI transaction'da
      const updated = await db.$transaction(async (tx) => {
        const row = await tx.meetingRequest.update({
          where: { id: meeting.id },
          data: {
            status: decision,
            decidedAt: new Date(),
            decidedBy: actor ?? `Sponsor Portalı — ${meeting.agreement.organization?.name ?? ""}`,
          },
        });
        const edition = await tx.eventEdition.findUnique({
          where: { id: meeting.editionId },
          select: { tenantId: true },
        });
        await publishOutbox(tx as unknown as OutboxClient, {
          tenantId: edition?.tenantId ?? null,
          editionId: meeting.editionId,
          aggregateType: "MEETING",
          aggregateId: meeting.id,
          eventType: "meeting.decided",
          payload: { meetingId: meeting.id, agreementId: meeting.agreementId, status: decision },
          idempotencyKey: `meeting:${meeting.id}:${decision}:${row.decidedAt?.getTime() ?? Date.now()}`,
        });
        return row;
      });
      await db.activityLog.create({
        data: {
          type: ActivityType.MEETING_SAVED,
          editionId: meeting.editionId,
          message: `Portal: görüşme ${decision === "CONFIRMED" ? "onaylandı" : decision === "DECLINED" ? "reddedildi" : "iptal edildi"} — ${meeting.agreement.organization?.name ?? ""}`,
          entityType: "MeetingRequest",
          entityId: meeting.id,
          actorName: actor ?? `Sponsor Portalı — ${meeting.agreement.organization?.name ?? ""}`,
        },
      });
      return NextResponse.json({ ok: true, meeting: updated });
    }

    // ── Katılımcı portalı: kendi görüşme talebini iptal ──────────────────
    if (action === "meeting-cancel") {
      const { meetingId, actor } = body as { meetingId: string; actor?: string };
      if (cap.scope !== "PARTICIPANT" || !cap.personId) {
        return NextResponse.json({ error: "Erişim belirteci geçersiz" }, { status: 404 });
      }
      const meeting = await db.meetingRequest.findUnique({ where: { id: meetingId } });
      if (!meeting || meeting.editionId !== cap.editionId || meeting.requesterPersonId !== cap.personId) {
        return NextResponse.json({ error: "Görüşme bulunamadı" }, { status: 404 });
      }
      const transition = decideMeetingTransition(meeting.status, "CANCELLED");
      if (!transition.ok) return NextResponse.json({ error: transition.error }, { status: transition.status });
      const updated = await db.meetingRequest.update({
        where: { id: meeting.id },
        data: { status: "CANCELLED", decidedAt: new Date(), decidedBy: actor ?? "Katılımcı Portalı" },
      });
      await db.activityLog.create({
        data: {
          type: ActivityType.MEETING_SAVED,
          editionId: meeting.editionId,
          message: "Portal: görüşme talebi katılımcı tarafından iptal edildi",
          entityType: "MeetingRequest",
          entityId: meeting.id,
          actorName: actor ?? "Katılımcı Portalı",
        },
      });
      return NextResponse.json({ ok: true, meeting: updated });
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
