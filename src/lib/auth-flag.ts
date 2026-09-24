// ─── Auth bayrağı (G0-f + A4) ────────────────────────────────────────────────────
// MAVEN_AUTH=on → oturum zorunlu uçlar devreye girer (media/export PII arşivi vb.).
// Bayrak kapalıyken (varsayılan) mevcut tek-kiracı demo davranışı KORUNUR.
import { NextRequest } from "next/server";
import { sessionFromRequest } from "@/lib/auth/session";

export const AUTH_ENABLED = process.env.MAVEN_AUTH === "on";

// Oturum denetimi — bayrak açıkken HMAC-imzalı oturum çerezi doğrulanır (fail-closed:
// imza yok/süresi geçmiş → false). A4 lib'leri: src/lib/auth/{password,totp,session}.ts
export async function hasSession(req: NextRequest): Promise<boolean> {
  if (!AUTH_ENABLED) return true;
  return sessionFromRequest(req) !== null;
}
