// ─── P11: Anlaşma sihirbazı durum makinesi + fiyat override yetkisi ────────────
// Adımlar: 1 kurum → 2 tier/paket+tutar → 3 sözleşme (not/vade, opsiyonel) → 4 özet.
// canProceed saf guard'dır; sunucu validasyonunun yerini tutmaz (P07/P08/P10
// kapıları aynen çalışır). Paket fiyatından sapma (override) yalnız fiyat
// rolüne açıktır: ORG_OWNER | ORG_ADMIN | FINANCE_MANAGER (legacy veya DB).
export interface WizardDraft {
  step: 1 | 2 | 3 | 4;
  organizationId: string;
  tierId: string;
  packageId: string;
  amountMinor: number | null;
  stage: string;
  notes: string;
  contractDueDate: string | null;
}

export const OVERRIDE_ROLE_KEYS = ["ORG_OWNER", "ORG_ADMIN", "FINANCE_MANAGER"] as const;

export function defaultDraft(): WizardDraft {
  return {
    step: 1,
    organizationId: "",
    tierId: "",
    packageId: "",
    amountMinor: null,
    stage: "PROSPECT",
    notes: "",
    contractDueDate: null,
  };
}

function validDate(v: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(new Date(`${v}T00:00:00`).getTime());
}

/** null = geçilebilir; string = engel nedeni. */
export function canProceed(step: 1 | 2 | 3, draft: WizardDraft): string | null {
  if (step === 1) {
    if (!draft.organizationId) return "Devam için bir kurum seçin";
    return null;
  }
  if (step === 2) {
    if (draft.amountMinor == null) return "Anlaşma tutarını girin";
    if (!Number.isInteger(draft.amountMinor) || draft.amountMinor < 0 || draft.amountMinor > 2147483647) {
      return "Tutar 0 ve üzeri tamsayı kuruş olmalı";
    }
    return null;
  }
  if (draft.contractDueDate != null && draft.contractDueDate !== "" && !validDate(draft.contractDueDate)) {
    return "Vade tarihi YYYY-AA-GG biçiminde olmalı";
  }
  return null;
}

export interface OverridePrisma {
  userRoleAssignment: {
    findFirst: (args: { where: Record<string, unknown> }) => Promise<{ id: string } | null>;
  };
}

export async function hasOverridePermission(
  prisma: OverridePrisma | null,
  actor: { userId: string; legacyRole: string },
): Promise<boolean> {
  if ((OVERRIDE_ROLE_KEYS as readonly string[]).includes(actor.legacyRole)) return true;
  if (!prisma) return false;
  const row = await prisma.userRoleAssignment.findFirst({
    where: {
      userId: actor.userId,
      scopeKey: "TENANT",
      role: { key: { in: [...OVERRIDE_ROLE_KEYS] } },
    },
  });
  return row != null;
}
