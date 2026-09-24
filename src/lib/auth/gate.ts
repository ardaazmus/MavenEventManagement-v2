// ─── A4: Auth uç kapıları — bayrak kapalıyken auth yüzeyi YOK (404) ───────────
// challenge deposu: tek kullanımlık, 5 dk TTL (WebAuthn + TOTP kurulum)
import { NextResponse } from "next/server";
import { AUTH_ENABLED } from "@/lib/auth-flag";

export function authDisabledResponse(): NextResponse {
  return NextResponse.json({ error: "Sayfa bulunamadı" }, { status: 404 });
}

export function requireAuthEnabled(): NextResponse | null {
  if (!AUTH_ENABLED) return authDisabledResponse();
  return null;
}

const challenges = new Map<string, { value: string; expiresAt: number }>();

export function storeChallenge(key: string, value: string): void {
  // tek kullanımlık: tüketilene kadar saklanır, doğrulamada silinir
  challenges.set(key, { value, expiresAt: Date.now() + 5 * 60_000 });
  for (const [k, c] of challenges) if (c.expiresAt < Date.now()) challenges.delete(k);
}

// tek kullanım — ikinci okuma başarısız (replay koruması)
export function consumeChallenge(key: string): string | null {
  const c = challenges.get(key);
  if (!c || c.expiresAt < Date.now()) return null;
  challenges.delete(key);
  return c.value;
}
