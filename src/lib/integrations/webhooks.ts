// ─── P22.3: Webhook imzası + tekrar penceresi + yük redaksiyonu ─────────────
// İmza: HMAC-SHA256 hex(`${timestamp}.${hamGövde}`) — başlık x-maven-signature.
// Doğrulama zaman-sabit karşılaştırma + 5dk tekrar penceresi kullanır.
// Redaksiyon: log/ekran öncesi hassas anahtarlar ••• olur (derin klon).
import { createHmac, timingSafeEqual } from "node:crypto";

export const WEBHOOK_REPLAY_WINDOW_SEC = 300;
const SIGNATURE_RE = /^[0-9a-f]{64}$/;

export function signPayload(secret: string, timestamp: string, rawBody: string): string {
  return createHmac("sha256", secret).update(`${timestamp}.${rawBody}`, "utf8").digest("hex");
}

export interface VerifyOptions {
  windowSec?: number;
  nowSec?: number;
}

export type VerifyResult = { ok: true } | { ok: false; error: string };

export function verifySignature(
  secret: string,
  timestamp: string | null,
  rawBody: string,
  signature: string | null,
  opts: VerifyOptions = {},
): VerifyResult {
  if (!secret) return { ok: false, error: "İmza sırrı tanımsız" };
  if (!timestamp || !signature) return { ok: false, error: "İmza başlıkları eksik" };
  const ts = Number(timestamp);
  const windowSec = opts.windowSec ?? WEBHOOK_REPLAY_WINDOW_SEC;
  const nowSec = opts.nowSec ?? Math.floor(Date.now() / 1000);
  if (!Number.isFinite(ts)) return { ok: false, error: "Geçersiz zaman damgası" };
  if (Math.abs(nowSec - ts) > windowSec) return { ok: false, error: "Tekrar penceresi dışında" };
  if (!SIGNATURE_RE.test(signature.trim())) return { ok: false, error: "İmza biçimi geçersiz" };
  const expected = signPayload(secret, timestamp, rawBody);
  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(signature.trim(), "hex");
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, error: "İmza doğrulanamadı" };
  }
  return { ok: true };
}

// authConfig içinden imza sırrı — {secret} öncelikli, {signingSecret} yedek
export function secretFromAuthConfig(authConfig: string | null | undefined): string | null {
  if (!authConfig) return null;
  try {
    const cfg = JSON.parse(authConfig) as Record<string, unknown>;
    const s = cfg.secret ?? cfg.signingSecret;
    return typeof s === "string" && s.length > 0 ? s : null;
  } catch {
    return null;
  }
}

const SENSITIVE_SUBSTRINGS = [
  "password",
  "secret",
  "token",
  "apikey",
  "api_key",
  "authorization",
  "card",
  "cvv",
  "iban",
  "ssn",
  "tcno",
  "private",
];

export const REDACTED = "•••";

function sensitiveKey(key: string): boolean {
  const k = key.toLowerCase().replace(/[-_\s]/g, "");
  return SENSITIVE_SUBSTRINGS.some((s) => k.includes(s));
}

// derin redaksiyon — aynı referansı paylaşmaz, döngüde keser
export function redactPayload<T>(value: T, seen = new WeakSet<object>()): T {
  if (value === null || value === undefined) return value;
  if (typeof value !== "object") return value;
  if (seen.has(value as object)) return REDACTED as unknown as T;
  seen.add(value as object);
  if (Array.isArray(value)) {
    return value.map((v) => redactPayload(v, seen)) as unknown as T;
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = sensitiveKey(k) ? REDACTED : redactPayload(v, seen);
  }
  return out as unknown as T;
}
