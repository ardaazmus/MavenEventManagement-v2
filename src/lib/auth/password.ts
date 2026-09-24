// ─── A4: Parola karma — argon2id (OWASP önerilen parametreler) ───────────────
// m=19456 KiB (19 MiB), t=2 geçiş, p=1 paralellik. Düz metin ASLA log/saklama yok.
import argon2 from "argon2";

const ARGON2_OPTS = {
  type: argon2.argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
} as const;

export function hashPassword(plain: string): Promise<string> {
  return argon2.hash(plain, ARGON2_OPTS);
}

export function verifyPassword(hash: string, plain: string): Promise<boolean> {
  return argon2.verify(hash, plain);
}

// parola gücü politikası — kayıt sırasında zorunlu
export function passwordPolicyError(plain: string): string | null {
  if (plain.length < 10) return "Parola en az 10 karakter olmalı";
  if (!/[a-zçğıöşü]/.test(plain) || !/[A-ZÇĞİÖŞÜ]/.test(plain)) return "Parola en az bir küçük ve bir büyük harf içermeli";
  if (!/\d/.test(plain)) return "Parola en az bir rakam içermeli";
  return null;
}
