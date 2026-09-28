// ─── TASK-B 13: Edge-güvenli oturum doğrulama (middleware) ───────────────────
// node:crypto EDGE runtime'da yok — aynı HMAC-SHA256 Web Crypto subtle ile.
// session.ts ile birebir uyumlu: base64url gövde + "." + base64url imza.
// ABSOLUTE tavan (iat + MAX_SESSION_AGE) ve exp burada da uygulanır.
export interface EdgeSessionPayload {
  uid: string;
  role: string;
  tenantId: string;
  iat?: number;
  exp: number;
  mfaPending?: boolean;
  sv?: number; // P06.4: oturum sürümü (edge doğrulamaz, yalnız taşır)
}

const SESSION_TTL_SECONDS = 12 * 3600;
const MAX_SESSION_AGE_SECONDS = 7 * 24 * 3600;

function sessionKey(): string {
  // P1 (yeni-fazlar 5): üretim/üretim-benzeri başlangıçta MAVEN_SECRET_KEY ZORUNLU —
  // belgelenmiş geliştirme sırrı sessizce kullanılamaz (fail-closed). Yerel geliştirme
  // ergonomisi yalnız NODE_ENV'in açıkça production OLMAMASIyla korunur.
  const key = process.env.MAVEN_SECRET_KEY;
  if (key) return key;
  if (process.env.NODE_ENV === "production") {
    throw new Error("MAVEN_SECRET_KEY zorunlu — üretimde fallback geliştirme sırrı kullanılamaz");
  }
  return "maven-dev-only-secret-key-change-me";
}

function b64urlToBytes(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function hmacSign(body: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(sessionKey()), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body));
  let bin = "";
  const bytes = new Uint8Array(sig);
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Middleware sliding yenileme için imza üretimi (session.ts HMAC'iyle birebir uyumlu). */
export const signEdge = hmacSign;

export async function parseSessionEdge(token: string | undefined | null): Promise<EdgeSessionPayload | null> {
  if (!token) return null;
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = await hmacSign(body);
  const a = b64urlToBytes(sig);
  const b = b64urlToBytes(expected);
  if (a.length !== b.length) return null;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i]; // timing-safe eşdeğeri
  if (diff !== 0) return null;
  try {
    const json = new TextDecoder().decode(b64urlToBytes(body));
    const p = JSON.parse(json) as EdgeSessionPayload;
    const now = Math.floor(Date.now() / 1000);
    if (!p.uid || p.exp < now) return null;
    const iat = p.iat ?? p.exp - SESSION_TTL_SECONDS;
    if (now - iat > MAX_SESSION_AGE_SECONDS) return null;
    return p;
  } catch {
    return null;
  }
}
