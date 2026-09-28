// ─── P20.1: Sponsor belirteci anlaşma kapsamı ─────────────────────────────────
// SPONSOR jetonu kurum+edisyon bağlar; agreementId DOLU ise jeton YALNIZ o
// anlaşmaya işler (aynı kurum-edisyondaki diğer anlaşmalar görünmez).
// agreementId BOŞ (eski jetonlar) ise kurum geneli — geriye uyumlu.
export interface SponsorTokenView {
  scope: string;
  editionId: string;
  organizationId: string | null;
  agreementId: string | null;
}

export interface SponsorWant {
  editionId: string;
  organizationId: string;
  agreementId?: string | null;
}

export type ScopeCheck = { ok: true } | { ok: false; error: string };

// kapsam + sahiplik kararı — rotalar 404/410 eşlemesini kendisi yapar
export function checkSponsorScope(token: SponsorTokenView, want: SponsorWant): ScopeCheck {
  if (token.scope !== "SPONSOR") return { ok: false, error: "Kapsam dışı belirteç" };
  if (token.editionId !== want.editionId || token.organizationId !== want.organizationId) {
    return { ok: false, error: "Kurum/edisyon eşleşmiyor" };
  }
  // anlaşma-kapsamlı jeton: hedef anlaşma jetonla birebir eşleşmeli
  if (token.agreementId && want.agreementId && token.agreementId !== want.agreementId) {
    return { ok: false, error: "Anlaşma kapsamı dışında" };
  }
  return { ok: true };
}

// liste sorguları için anlaşma filtresi — kapsamlı jeton tek anlaşmaya daralır
export function agreementFilter(token: SponsorTokenView): { id: string } | Record<string, never> {
  return token.agreementId ? { id: token.agreementId } : {};
}
