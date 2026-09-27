// ─── A4: TOTP (RFC 6238) — SHA-1/6 hane/30 sn (authenticator uyumlu) ─────────
// Bağımlılık yok: Node crypto HMAC + base32 kod çözücü. Secret AES-256-GCM ile
// şifrelenir (secrets.ts) — düz metin yalnız kurulum QR'ı anında üretilir.
import crypto from "crypto";

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function generateTotpSecret(bytes = 20): string {
  const buf = crypto.randomBytes(bytes);
  let bits = "";
  for (const b of buf) bits += b.toString(2).padStart(8, "0");
  let out = "";
  for (let i = 0; i + 5 <= bits.length; i += 5) out += B32[parseInt(bits.slice(i, i + 5), 2)];
  return out;
}

function base32Decode(s: string): Buffer {
  const clean = s.toUpperCase().replace(/=+$/, "").replace(/\s/g, "");
  let bits = "";
  for (const ch of clean) {
    const idx = B32.indexOf(ch);
    if (idx < 0) continue;
    bits += idx.toString(2).padStart(5, "0");
  }
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}

function hotp(secret: Buffer, counter: number): string {
  const buf = Buffer.alloc(8);
  buf.writeUInt32BE(Math.floor(counter / 2 ** 32), 0);
  buf.writeUInt32BE(counter % 2 ** 32, 4);
  const hmac = crypto.createHmac("sha1", secret).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code = ((hmac[offset] & 0x7f) << 24) | (hmac[offset + 1] << 16) | (hmac[offset + 2] << 8) | hmac[offset + 3];
  return String(code % 1_000_000).padStart(6, "0");
}

// ± 1 pencere toleransı (saat kayması) — doğrulama penceresi 90 sn
export function verifyTotp(secretB32: string, token: string, window = 1): boolean {
  const clean = (token ?? "").replace(/\D/g, "");
  if (clean.length !== 6) return false;
  const secret = base32Decode(secretB32);
  if (secret.length === 0) return false;
  const counter = Math.floor(Date.now() / 30_000);
  for (let w = -window; w <= window; w++) {
    if (hotp(secret, counter + w) === clean) return true;
  }
  return false;
}

// otpauth:// URI — authenticator uygulaması QR'ı
export function otpauthUri(secretB32: string, account: string, issuer = "Maven"): string {
  return `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(account)}?secret=${secretB32}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
}

// kurtarma kodları — 10 adet, hash'li saklanır (sha256), düz metin yalnız kurulumda bir kez gösterilir
export function generateRecoveryCodes(count = 10): { plain: string[]; hashed: { hash: string; usedAt: string | null }[] } {
  const plain: string[] = [];
  const hashed: { hash: string; usedAt: string | null }[] = [];
  for (let i = 0; i < count; i++) {
    const code = crypto.randomBytes(5).toString("hex").toUpperCase(); // 10 hane
    plain.push(code);
    hashed.push({ hash: crypto.createHash("sha256").update(code).digest("hex"), usedAt: null });
  }
  return { plain, hashed };
}

export function hashRecoveryCode(code: string): string {
  return crypto.createHash("sha256").update(code.trim().toUpperCase()).digest("hex");
}
