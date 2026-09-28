// ─── P18.4: Silme/anonimleştirme işi — kuru-çalıştırma, hukuki bekletme ────────
// Sözleşme: preview yazmaz, etkilenimleri sayar; execute öncesi otomatik
// legal-hold taraması yapılır (ödenmemiş sipariş / aktif konaklama / bekleyen
// ödeme) — bekletme varsa 409 ile durur, manuel reject+gerekçe gerekir.
// Anonimleştirme tombstone'dur: FK'lar korunur (referans bütünlüğü), kimlik
// gerçekleri geri döndürülemez biçimde silinir.
// NOT: `@/` takma adı YOK — node --test (tip-sıyırma) uyumu için bağımsız.
import { normalizeConsentAddress } from "../comms/consent.ts";

export const ERASURE_ANON = {
  firstName: "Silinmiş",
  lastName: "Kullanıcı",
  email: null,
  phone: null,
  photoUrl: null,
  bio: null,
  linkedin: null,
  title: null,
} as const;

export class ErasureJobError extends Error {
  status: number;
  holds: LegalHold[];
  constructor(message: string, status = 400, holds: LegalHold[] = []) {
    super(message);
    this.name = "ErasureJobError";
    this.status = status;
    this.holds = holds;
  }
}

export interface LegalHold {
  kind: "UNPAID_ORDER" | "PENDING_PAYMENT" | "ACTIVE_RESERVATION";
  count: number;
  detail: string;
}

export interface ErasurePreview {
  personId: string;
  anonymizedFields: string[];
  preservedCounts: Record<string, number>;
  holds: LegalHold[];
  executable: boolean;
}

export interface ErasurePrisma {
  person: {
    findUnique: (args: { where: Record<string, unknown> }) => Promise<Record<string, unknown> | null>;
    update: (args: { where: Record<string, unknown>; data: Record<string, unknown> }) => Promise<Record<string, unknown>>;
  };
  eventParticipation: { count: (args: { where: Record<string, unknown> }) => Promise<number> };
  registration: { count: (args: { where: Record<string, unknown> }) => Promise<number> };
  order: { count: (args: { where: Record<string, unknown> }) => Promise<number> };
  payment: { count: (args: { where: Record<string, unknown> }) => Promise<number> };
  reservation: { count: (args: { where: Record<string, unknown> }) => Promise<number> };
  customerContact: { count: (args: { where: Record<string, unknown> }) => Promise<number> };
  contactConsent: {
    count: (args: { where: Record<string, unknown> }) => Promise<number>;
    findMany: (args: { where: Record<string, unknown> }) => Promise<Array<Record<string, unknown>>>;
    update: (args: { where: Record<string, unknown>; data: Record<string, unknown> }) => Promise<Record<string, unknown>>;
  };
  iysOutbox: {
    create: (args: { data: Record<string, unknown> }) => Promise<Record<string, unknown>>;
  };
  kvkkErasureRequest: {
    findUnique: (args: { where: Record<string, unknown> }) => Promise<Record<string, unknown> | null>;
    update: (args: { where: Record<string, unknown>; data: Record<string, unknown> }) => Promise<Record<string, unknown>>;
  };
  activityLog: { create: (args: { data: Record<string, unknown> }) => Promise<unknown> };
}

async function requireTenantPerson(prisma: ErasurePrisma, tenantId: string, personId: string): Promise<Record<string, unknown> & { id: string; tenantId: string }> {
  const person = (await prisma.person.findUnique({ where: { id: personId } })) as unknown as {
    id: string; tenantId: string;
  } | null;
  if (!person || person.tenantId !== tenantId) {
    throw new ErasureJobError("Kişi bulunamadı", 404);
  }
  return person;
}

export async function detectLegalHolds(
  prisma: ErasurePrisma,
  input: { tenantId: string; personId: string; now?: Date },
): Promise<LegalHold[]> {
  await requireTenantPerson(prisma, input.tenantId, input.personId);
  const now = input.now ?? new Date();
  const [unpaidOrders, pendingPayments, activeReservations] = await Promise.all([
    prisma.order.count({ where: { buyerPersonId: input.personId, status: { in: ["OPEN", "PARTIALLY_PAID"] } } }),
    prisma.payment.count({ where: { status: "PENDING", order: { is: { buyerPersonId: input.personId } } } }),
    prisma.reservation.count({
      where: {
        primaryGuest: { is: { personId: input.personId } },
        status: { in: ["REQUESTED", "WAITLIST", "RESERVED", "CONFIRMED", "CHECKED_IN"] },
        checkOut: { gt: now },
      },
    }),
  ]);
  const holds: LegalHold[] = [];
  if (unpaidOrders > 0) holds.push({ kind: "UNPAID_ORDER", count: unpaidOrders, detail: `${unpaidOrders} ödenmemiş sipariş` });
  if (pendingPayments > 0) holds.push({ kind: "PENDING_PAYMENT", count: pendingPayments, detail: `${pendingPayments} bekleyen ödeme` });
  if (activeReservations > 0) holds.push({ kind: "ACTIVE_RESERVATION", count: activeReservations, detail: `${activeReservations} aktif konaklama` });
  return holds;
}

export async function previewErasure(
  prisma: ErasurePrisma,
  input: { tenantId: string; personId: string; now?: Date },
): Promise<ErasurePreview> {
  const person = (await requireTenantPerson(prisma, input.tenantId, input.personId)) as unknown as {
    email: string | null; phone: string | null;
  };
  const emailNorm = normalizeConsentAddress("EMAIL", person.email);
  const phoneNorm = normalizeConsentAddress("SMS", person.phone);
  const consentOr: Record<string, unknown>[] = [];
  if (emailNorm) consentOr.push({ channel: "EMAIL", address: emailNorm });
  if (phoneNorm) {
    consentOr.push({ channel: "SMS", address: phoneNorm }, { channel: "WHATSAPP", address: phoneNorm });
  }
  const [participations, registrations, orders, payments, reservations, contacts, consents] = await Promise.all([
    prisma.eventParticipation.count({ where: { personId: input.personId } }),
    prisma.registration.count({ where: { participation: { is: { personId: input.personId } } } }),
    prisma.order.count({ where: { buyerPersonId: input.personId } }),
    prisma.payment.count({ where: { order: { is: { buyerPersonId: input.personId } } } }),
    prisma.reservation.count({ where: { primaryGuest: { is: { personId: input.personId } } } }),
    prisma.customerContact.count({ where: { personId: input.personId } }),
    consentOr.length > 0
      ? prisma.contactConsent.count({ where: { tenantId: input.tenantId, OR: consentOr } })
      : Promise.resolve(0),
  ]);
  const holds = await detectLegalHolds(prisma, input);
  return {
    personId: input.personId,
    anonymizedFields: ["firstName", "lastName", "email", "phone", "photoUrl", "bio", "linkedin", "title"],
    preservedCounts: { participations, registrations, orders, payments, reservations, contacts, consents },
    holds,
    executable: holds.length === 0,
  };
}

export interface ExecuteErasureInput {
  tenantId: string;
  requestId: string;
  handledBy?: string | null;
}

export async function executeErasure(prisma: ErasurePrisma, input: ExecuteErasureInput): Promise<{ personId: string; preview: ErasurePreview }> {
  const req = (await prisma.kvkkErasureRequest.findUnique({ where: { id: input.requestId } })) as unknown as {
    id: string; tenantId: string; status: string; personId: string | null;
  } | null;
  if (!req || req.tenantId !== input.tenantId) {
    throw new ErasureJobError("Talep bulunamadı", 404);
  }
  if (req.status !== "VERIFIED") {
    throw new ErasureJobError("Önce doğrulama (verify) gerekli", 409);
  }
  if (!req.personId) {
    throw new ErasureJobError("Kişi eşleşmesi yok — manuel inceleme gerekli", 409);
  }
  const preview = await previewErasure(prisma, { tenantId: input.tenantId, personId: req.personId });
  if (!preview.executable) {
    throw new ErasureJobError(
      `Yasal bekletme: ${preview.holds.map((h) => h.detail).join(", ")} — gerekçeli ret (reject) gerekli`,
      409,
      preview.holds,
    );
  }
  // Anonimleştirme ÖNCESİ adresleri yakala — rıza geri çekme bunlarla eşleşir.
  const before = (await prisma.person.findUnique({ where: { id: req.personId } })) as unknown as {
    email: string | null; phone: string | null;
  };
  const emailNorm = normalizeConsentAddress("EMAIL", before?.email);
  const phoneNorm = normalizeConsentAddress("SMS", before?.phone);
  const consentOr: Record<string, unknown>[] = [];
  if (emailNorm) consentOr.push({ channel: "EMAIL", address: emailNorm });
  if (phoneNorm) {
    consentOr.push({ channel: "SMS", address: phoneNorm }, { channel: "WHATSAPP", address: phoneNorm });
  }
  await prisma.person.update({ where: { id: req.personId }, data: { ...ERASURE_ANON } });
  // Rıza tutarlılığı: anonimleşen adreslerdeki açık rızalar geri çekilir
  // (adres yeniden tahsis edilirse eski rıza dirilmez); ticari hareketler İYS'ye düşer.
  if (consentOr.length > 0) {
    const active = (await prisma.contactConsent.findMany({
      where: { tenantId: input.tenantId, status: "GRANTED", OR: consentOr },
    })) as Array<Record<string, unknown> & { id: string; channel: string; purpose: string }>;
    for (const c of active) {
      await prisma.contactConsent.update({
        where: { id: c.id },
        data: { status: "WITHDRAWN", source: "MANUAL", proof: `erasure:${req.id}`, withdrawnAt: new Date() },
      });
      if (c.purpose === "COMMERCIAL" && (c.channel === "EMAIL" || c.channel === "SMS")) {
        await prisma.iysOutbox.create({
          data: {
            tenantId: input.tenantId,
            channel: c.channel,
            address: String(c.address ?? ""),
            purpose: "COMMERCIAL",
            action: "WITHDRAW",
            payload: JSON.stringify({ source: "MANUAL", proof: `erasure:${req.id}`, at: new Date().toISOString() }),
          },
        });
      }
    }
  }
  await prisma.kvkkErasureRequest.update({
    where: { id: req.id },
    data: { status: "COMPLETED", completedAt: new Date(), handledBy: input.handledBy ?? "KVKK Sorumlusu" },
  });
  await prisma.activityLog.create({
    data: {
      tenantId: input.tenantId,
      editionId: null,
      type: "OTHER",
      message: `KVKK silme TAMAMLANDI: kişi anonimleştirildi (katılım ${preview.preservedCounts.participations}, kayıt ${preview.preservedCounts.registrations} korundu)`,
      entityType: "KvkkErasureRequest",
      entityId: req.id,
      actorName: "KVKK Süreci",
    },
  });
  return { personId: req.personId, preview };
}
