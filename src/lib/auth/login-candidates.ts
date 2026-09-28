// ─── N-03: çok-kiracılı e-posta giriş çözümleme ─────────────────────────────────
// Aynı e-posta birden fazla kiracıda bulunabilir (davet akışı kiracı-kapsamlı).
// Parola HER adayda denenir; tek eşleşme kazanır, çoklu eşleşme tenantSlug ister.
// Kilit/durum denetimi YALNIZ parola eşleşen adaya uygulanır (yanlış-kiracı
// bilgi sızıntısı yok). Saf + test edilebilir; parola doğrulama dışarıdan enjekte.
export interface LoginCandidate {
  id: string;
  tenantId: string;
  tenantSlug: string | null;
  passwordHash: string | null;
  status: string;
  lockedUntil: Date | null;
}

export type LoginSelection =
  | { kind: "ok"; candidate: LoginCandidate }
  | { kind: "not-found" }
  | { kind: "ambiguous"; slugs: string[] }
  | { kind: "locked"; candidate: LoginCandidate }
  | { kind: "disabled"; candidate: LoginCandidate };

export async function selectLoginCandidate(
  candidates: LoginCandidate[],
  verify: (hash: string | null, password: string) => Promise<boolean>,
  password: string,
  tenantSlug?: string | null,
  now: Date = new Date(),
): Promise<LoginSelection> {
  const pool =
    tenantSlug != null && tenantSlug !== ""
      ? candidates.filter((c) => c.tenantSlug === tenantSlug)
      : candidates;
  if (pool.length === 0) return { kind: "not-found" };

  const matches: LoginCandidate[] = [];
  for (const c of pool) {
    if (await verify(c.passwordHash, password)) matches.push(c);
  }
  if (matches.length === 0) return { kind: "not-found" };
  if (matches.length > 1) {
    return {
      kind: "ambiguous",
      slugs: [...new Set(matches.map((m) => m.tenantSlug ?? m.tenantId))],
    };
  }
  const winner = matches[0];
  if (winner.lockedUntil && winner.lockedUntil > now) return { kind: "locked", candidate: winner };
  if (winner.status !== "ACTIVE") return { kind: "disabled", candidate: winner };
  return { kind: "ok", candidate: winner };
}
