// ─── A4: Oturum — HMAC imzalı, httpOnly çerez; opaque kullanıcı id ───────────
// Çerez içeriği base64url JSON { uid, role, tenantId, exp } + "." + HMAC-SHA256.
// Başarım: stateless (sunucu oturum tablosu gerekmez), oynanamaz (imza), kısa ömürlü.
// rpID/origin ortam-öncelikli: MAVEN_RPID → MAVEN_ORIGIN → localhost.
import crypto from "crypto";
import type { NextRequest } from "next/server";

export const SESSION_COOKIE = "maven.session";
export const SESSION_TTL_SECONDS = 12 * 3600;

function sessionKey(): string {
  return process.env.MAVEN_SECRET_KEY ?? "maven-dev-only-secret-key-change-me";
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
  exp: number; // epoch sn
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
    if (!p.uid || p.exp < Math.floor(Date.now() / 1000)) return null;
    return p;
  } catch {
    return null;
  }
}

export function sessionFromRequest(req: NextRequest): SessionPayload | null {
  return parseSession(req.cookies.get(SESSION_COOKIE)?.value);
}

export function sessionCookieHeader(p: SessionPayload): string {
  return `${SESSION_COOKIE}=${serializeSession(p)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_TTL_SECONDS}${process.env.NODE_ENV === "production" ? "; Secure" : ""}`;
}

export function clearCookieHeader(): string {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}
