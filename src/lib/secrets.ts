// ─── S3: Sır yönetimi — SMTP/API kimlik bilgileri at-rest şifreli ─────────────
// AES-256-GCM; anahtar MAVEN_SECRET_KEY ortam değişkeninden türetilir (scrypt).
// Geliştirme anahtarı yalnız yerel/tek-kiracı demo için — üretimde MAVEN_SECRET_KEY
// zorunlu kılınır (anahtar kodda ASLA saklanmaz, loglara PII/sır yazılmaz).
import crypto from "crypto";

const DEV_FALLBACK = "maven-dev-only-secret-key-change-me";

function derivedKey(): Buffer {
  const secret = process.env.MAVEN_SECRET_KEY ?? DEV_FALLBACK;
  return crypto.scryptSync(secret, "maven-mail-secret-v1", 32);
}

// düz metin → "enc:v1:<iv-b64>:<tag-b64>:<ct-b64>"
export function encryptSecret(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", derivedKey(), iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `enc:v1:${iv.toString("base64")}:${tag.toString("base64")}:${ct.toString("base64")}`;
}

export function decryptSecret(value: string | null | undefined): string | null {
  if (!value) return null;
  if (!value.startsWith("enc:v1:")) return value.startsWith("enc:") ? null : value; // eski düz metin: geçiş döneminde döner (API'de yine maskelenir)
  try {
    const [, , ivB64, tagB64, ctB64] = value.split(":");
    const decipher = crypto.createDecipheriv("aes-256-gcm", derivedKey(), Buffer.from(ivB64, "base64"));
    decipher.setAuthTag(Buffer.from(tagB64, "base64"));
    return Buffer.concat([decipher.update(Buffer.from(ctB64, "base64")), decipher.final()]).toString("utf8");
  } catch {
    return null; // bozuk/anahtar-uyuşmayan sır — asla istisna patlatma
  }
}

export const isEncryptedSecret = (v: string | null | undefined) => typeof v === "string" && v.startsWith("enc:v1:");

// UI/log güvenli maske — yalnız biçim ipucu döner
export function maskSecret(_value: string | null | undefined): string {
  return "••••••••";
}
