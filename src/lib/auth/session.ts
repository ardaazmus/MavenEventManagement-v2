// ─── A4: Oturum — HMAC imzalı, httpOnly çerez; opaque kullanıcı id ───────────
// Çerez içeriği base64url JSON { uid, role, tenantId, iat, exp, mfaPending? } + "." + HMAC-SHA256.
// Başarım: stateless (sunucu oturum tablosu gerekmez), oynanamaz (imza), kısa ömürlü.
// rpID/origin ortam-öncelikli: MAVEN_RPID → MAVEN_ORIGIN → localhost.
//
// TASK-B 13 — ÇEREZ + ÖMÜR POLİTİKASI:
//  • PROD çerez adı `__Host-maven.session` (MDN __Host- öneki: Secure ZORUNLU, Path=/, Domain YASAK).
//    Dev/HTTP'de `maven.session` (__Host- öneki Secure ister; localhost Secure'a güvenilir origin'dir
//    fakat çerez adı kararının dev/prod ayrımı migrasyon güvenlidir — stateless HMAC).
//  • SLIDING ömür: kalan süre TTL/2 altına indiğinde middleware aynı iat ile çerezi tazeler.
//  • ABSOLUTE tavan: iat'ten itibaren MAX_SESSION_AGE (7 gün) — sliding yenileme mutlağı aşamaz.
//  • MFA-PENDING belirteci: ORG_OWNER/FINANCE_MANAGER zorunlu MFA onboarding'i için 5 dk'lık
//    dar kapsamlı çerez — YALNIZ mfa/setup + mfa/verify uçları kabul eder (authPendingFromRequest),
//    oturum (hasSession/middleware) ASLA saymaz.
import crypto from "crypto";
import type { NextRequest } from "next/server";

const IS_PROD = process.env.NODE_ENV === "production";

export const SESSION_COOKIE = IS_PROD ? "__Host-maven.session" : "maven.session";
export const MFA_PENDING_COOKIE = IS_PROD ? "__Host-maven.mfa-pending" : "maven.mfa-pending";
export const SESSION_TTL_SECONDS = 12 * 3600; // sliding pencere
export const MAX_SESSION_AGE_SECONDS = 7 * 24 * 3600; // ABSOLUTE tavan — iat'ten itibaren
const MFA_PENDING_TTL_SECONDS = 5 * 60;

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

export function rpId(): string {
  return process.env.MAVEN_RPID ?? "localhost";
}

export function origin(): string {
  return process.env.MAVEN_ORIGIN ?? "http://localhost:3000";
}

export interface SessionPayload {
  uid: string; // opaque user id (cuid) — e-posta/PII taşınmaz
  role: string;
  tenantId: string;
  iat: number; // issuance epoch sn — ABSOLUTE tavan bundan sayılır
  exp: number; // epoch sn
  mfaPending?: boolean; // dar kapsamlı onboarding belirteci — oturum DEĞİL
}

function sign(data: string): string {
  return crypto.createHmac("sha256", sessionKey()).update(data).digest("base64url");
}

export function serializeSession(p: SessionPayload): string {
  const body = Buffer.from(JSON.stringify(p), "utf8").toString("base64url");
  return `${body}.${sign(body)}`;
}

export function parseSession(token: string | undefined | null): SessionPayload | null {
  if (!token) return null;
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = sign(body);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null; // timing-safe karşılaştırma
  try {
    const p = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as SessionPayload;
    const now = Math.floor(Date.now() / 1000);
    if (!p.uid || p.exp < now) return null;
    // ABSOLUTE tavan: eski çerezlerde iat yoksa exp-TTL kabul edilir (12h pencere zaten tavan altı)
    const iat = p.iat ?? p.exp - SESSION_TTL_SECONDS;
    if (now - iat > MAX_SESSION_AGE_SECONDS) return null; // sliding mutlağı aşamaz
    return p;
  } catch {
    return null;
  }
}

export function sessionFromRequest(req: NextRequest): SessionPayload | null {
  return parseSession(req.cookies.get(SESSION_COOKIE)?.value);
}

// TASK-B 12: MFA-pending — oturum sayılmaz; yalnız mfa/setup|verify onboarding'inde geçerli.
// Zaten tam oturumu olan kullanıcılar da (mevcut yönetici kurulumu) bu uçları kullanabilir.
export function authPendingFromRequest(req: NextRequest): SessionPayload | null {
  const pending = parseSession(req.cookies.get(MFA_PENDING_COOKIE)?.value);
  if (pending?.mfaPending) return pending;
  return sessionFromRequest(req); // tam oturum da kurulum yapabilir
}

function cookieFlags(maxAge: number): string {
  return `Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${IS_PROD ? "; Secure" : ""}`;
}

export function sessionCookieHeader(p: SessionPayload): string {
  return `${SESSION_COOKIE}=${serializeSession(p)}; ${cookieFlags(p.exp - Math.floor(Date.now() / 1000) + 5)}`;
}

export function mfaPendingCookieHeader(uid: string, role: string, tenantId: string): string {
  const now = Math.floor(Date.now() / 1000);
  const p: SessionPayload = { uid, role, tenantId, iat: now, exp: now + MFA_PENDING_TTL_SECONDS, mfaPending: true };
  return `${MFA_PENDING_COOKIE}=${serializeSession(p)}; ${cookieFlags(MFA_PENDING_TTL_SECONDS)}`;
}

export function clearCookieHeader(): string {
  return `${SESSION_COOKIE}=; ${cookieFlags(0)}`;
}
