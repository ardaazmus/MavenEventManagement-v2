// ─── P07: Sponsor anlaşması yazım sözleşmesi (H-01/H-02/N-02 düzeltmesi) ──────
// API sözleşmesi:
//  * organizationId ZORUNLU (H-01: 400 organizationId yoksa).
//  * status kanonik enum; oluşturmada yalnız PROSPECT|NEGOTIATION (P07.4).
//    LEAD/PROPOSAL/CONTRACT/PAID ASLA yazılmaz (H-02 + P08 geçiş makinesi).
//  * Tutar: amountMinor (tamsayı kuruş ≥0, Int32). Legacy `amount` alanı
//    açık göç mesajıyla reddedilir (N-02: 100× hatası fail-closed).
//  * package/tier AYNI edition'a ait olmalı; organizasyon AYNI kiracıda olmalı.
// validate eşleme yapar: amountMinor→amount (DB), amountMinor silinir.
export const CANONICAL_STATUSES = [
  "PROSPECT",
  "NEGOTIATION",
  "CONTRACTED",
  "ACTIVE",
  "COMPLETED",
  "CANCELLED",
] as const;

export type CanonicalStatus = (typeof CANONICAL_STATUSES)[number];

export const INITIAL_STATUSES: readonly string[] = ["PROSPECT", "NEGOTIATION"];

const MAX_INT32 = 2147483647;

export class AgreementScopeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AgreementScopeError";
  }
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim() !== "";
}

function isValidMinor(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= MAX_INT32;
}

export function validateAgreementInput(data: Record<string, unknown>, isUpdate: boolean): string | null {
  // Legacy `amount` ASLA kabul edilmez — birim belirsizliği fail-closed.
  if ("amount" in data && !("amountMinor" in data)) {
    return "amount alanı kaldırıldı; tutarı kuruş olarak amountMinor ile gönderin (örn. 250000,00 TL → 25000000)";
  }
  if ("amount" in data && "amountMinor" in data) {
    return "amount ve amountMinor birlikte gönderilemez; yalnız amountMinor kullanın";
  }

  if ("amountMinor" in data && !isValidMinor(data.amountMinor)) {
    return "amountMinor 0–2147483647 arası tamsayı kuruş olmalı";
  }

  if ("status" in data && data.status != null) {
    if (!isNonEmptyString(data.status) || !(CANONICAL_STATUSES as readonly string[]).includes(data.status)) {
      return `status kanonik olmalı: ${CANONICAL_STATUSES.join("|")} (LEAD/PROPOSAL/CONTRACT/PAID geçersiz)`;
    }
    if (!isUpdate && !INITIAL_STATUSES.includes(data.status)) {
      return `Yeni anlaşma yalnız ${INITIAL_STATUSES.join(" veya ")} ile başlar; ${data.status} P08 geçişleriyle kazanılır`;
    }
  }

  if ("currency" in data && data.currency != null) {
    if (typeof data.currency !== "string" || !/^[A-Z]{3}$/.test(data.currency)) {
      return "currency 3 harfli büyük kod olmalı (örn. TRY)";
    }
  }

  if (!isUpdate) {
    if (!isNonEmptyString(data.organizationId)) {
      return "organizationId zorunludur: mevcut bir kurum seçin ya da önce kurumu oluşturun";
    }
  } else if ("organizationId" in data && data.organizationId != null && !isNonEmptyString(data.organizationId)) {
    return "organizationId boş olamaz";
  }

  // Eşleme: sözleşme alanı → DB alanı (başarılı doğrulamada uygulanır).
  if ("amountMinor" in data) {
    data.amount = data.amountMinor;
    delete data.amountMinor;
  }
  return null;
}

export interface AgreementScopePrisma {
  eventEdition: {
    findUnique: (args: { where: Record<string, unknown>; select?: unknown }) => Promise<{
      id: string;
      tenantId: string;
    } | null>;
  };
  organization: {
    findFirst: (args: { where: Record<string, unknown>; select?: unknown }) => Promise<{ id: string } | null>;
  };
  sponsorPackage: {
    findUnique: (args: { where: Record<string, unknown>; select?: unknown }) => Promise<{
      id: string;
      editionId: string;
    } | null>;
  };
  sponsorTierDefinition: {
    findUnique: (args: { where: Record<string, unknown>; select?: unknown }) => Promise<{
      id: string;
      editionId: string;
    } | null>;
  };
  sponsorAgreement: {
    findUnique: (args: { where: Record<string, unknown>; select?: unknown }) => Promise<{
      id: string;
      editionId: string;
      organizationId: string;
    } | null>;
  };
}

export interface AgreementScopeInput {
  tenantId: string;
  editionId: string;
  organizationId: string;
  packageId?: string | null;
  tierId?: string | null;
}

export async function assertAgreementScope(prisma: AgreementScopePrisma, input: AgreementScopeInput): Promise<void> {
  const edition = await prisma.eventEdition.findUnique({
    where: { id: input.editionId },
    select: { id: true, tenantId: true },
  });
  if (!edition || edition.tenantId !== input.tenantId) {
    throw new AgreementScopeError("Etkinlik bu kiracıya ait değil");
  }
  const org = await prisma.organization.findFirst({
    where: { id: input.organizationId, tenantId: input.tenantId },
    select: { id: true },
  });
  if (!org) {
    throw new AgreementScopeError("Organizasyon bu kiracıda bulunamadı");
  }
  if (input.packageId != null) {
    const pack = await prisma.sponsorPackage.findUnique({
      where: { id: input.packageId },
      select: { id: true, editionId: true },
    });
    if (!pack || pack.editionId !== input.editionId) {
      throw new AgreementScopeError("Paket bu etkinliğe ait değil (cross-edition)");
    }
  }
  if (input.tierId != null) {
    const tier = await prisma.sponsorTierDefinition.findUnique({
      where: { id: input.tierId },
      select: { id: true, editionId: true },
    });
    if (!tier || tier.editionId !== input.editionId) {
      throw new AgreementScopeError("Seviye bu etkinliğe ait değil (cross-edition)");
    }
  }
}
