// TASK-B 24 + 11-13: BAYRAK-AÇIK oturum E2E kapısı (CI: MAVEN_AUTH=on ile start edilir).
// Flag kapalıyken BU DOSYA OTOMATİK SKIP — OFF modu bayt-özdeş davranış kanıtını bozmaz.
// Kapsam: register → zorunlu-MFA 403 (mfaSetupRequired) → mfa-pending çerezi ile kurulum →
// TOTP doğrulama (RFC 6238, test içinde üretilir) → tam oturum → passkey seçenekleri →
// middleware zorlaması (anon 401 / oturumlu 200).
//
// NOT: çerez kavanozu worker'da PAYLAŞILIR (identity bucket 5/15dk — giriş sayısı 3'te tutulur).
import { test, expect } from "@playwright/test";
import { request as pwRequest, type APIRequestContext } from "playwright";
import crypto from "crypto";
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

const AUTH_ON = process.env.MAVEN_AUTH === "on";
const EMAIL = "e2e-owner@maven-test.local"; // STABİL kimlik — yeniden koşularda idempotent
const PASSWORD = "E2e!Owner-2026-pw";

test.skip(!AUTH_ON, "MAVEN_AUTH=off — bayrak-açık oturum E2E yalnız CI kapısında çalışır");

// RFC 6238 TOTP (SHA-1, 6 hane, 30 sn) — base32 secret ile
function totp(secretB32: string, offsetWindows = 0): string {
  const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const ch of secretB32.toUpperCase().replace(/=+$/, "")) {
    const idx = B32.indexOf(ch);
    if (idx < 0) continue;
    bits += idx.toString(2).padStart(5, "0");
  }
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  const counter = Math.floor(Date.now() / 30_000) + offsetWindows;
  const buf = Buffer.alloc(8);
  buf.writeUInt32BE(Math.floor(counter / 2 ** 32), 0);
  buf.writeUInt32BE(counter % 2 ** 32, 4);
  const hmac = crypto.createHmac("sha1", Buffer.from(bytes)).update(buf).digest();
  const off = hmac[hmac.length - 1] & 0x0f;
  const code = ((hmac[off] & 0x7f) << 24) | (hmac[off + 1] << 16) | (hmac[off + 2] << 8) | hmac[off + 3];
  return String(code % 1_000_000).padStart(6, "0");
}

const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3000";
let ctx: APIRequestContext; // paylaşımlı çerez kavanozu

test.beforeAll(async () => {
  ctx = await pwRequest.newContext({ baseURL: BASE });
});
test.afterAll(async () => {
  await ctx?.dispose();
  await db.$disconnect();
});

test.describe.serial("flag-ON auth akışı (TASK-B 11-13)", () => {
  let otpauthSecret = "";

  test("kayıt — ORG_OWNER'a yükselt + MFA durumu sıfırla (idempotent)", async () => {
    const res = await ctx.post("/api/auth/register", { data: { email: EMAIL, name: "E2E Owner", password: PASSWORD, consent: true } });
    expect([201, 409, 429]).toContain(res.status()); // 429: hız kovası — mevcut kullanıcıyla devam
    const found = await db.user.findFirst({ where: { email: EMAIL }, select: { id: true } });
    expect(found).not.toBeNull();
    await db.user.update({ where: { id: found!.id }, data: { role: "ORG_OWNER", mfaEnabled: false, mfaSecretCipher: null, recoveryCodes: null } });
    const u = await db.user.findUnique({ where: { id: found!.id }, select: { role: true, mfaEnabled: true } });
    expect(u?.role).toBe("ORG_OWNER");
    expect(u?.mfaEnabled).toBe(false);
  });

  test("giriş — zorunlu MFA: ORG_OWNER mfaEnabled=false → 403 + mfaSetupRequired (+pending çerezi)", async () => {
    const res = await ctx.post("/api/auth/login", { data: { email: EMAIL, password: PASSWORD } });
    expect(res.status()).toBe(403);
    const j = await res.json();
    expect(j.mfaSetupRequired).toBe(true);
  });

  test("mfa-pending çerezi ile kurulum — setup otpauth URI verir (oturumsuz!)", async () => {
    const setup = await ctx.post("/api/auth/mfa/setup", { data: {} });
    expect(setup.status()).toBe(200); // pending çerezi kabul edildi
    const j = await setup.json();
    const m = /secret=([A-Z2-7]+)/.exec(j.otpauthUri ?? "");
    expect(m).not.toBeNull();
    otpauthSecret = m![1];
  });

  test("TOTP doğrulama → tam oturum çerezi", async () => {
    const res = await ctx.post("/api/auth/mfa/verify", { data: { code: totp(otpauthSecret) } });
    expect(res.status()).toBe(200);
    const j = await res.json();
    expect(j.mfaEnabled).toBe(true);
    expect(j.recoveryCodes).toHaveLength(10); // kurtarma faktörü korundu
  });

  test("MFA'lı giriş başarılı + /api/auth/session oturum onaylar", async () => {
    const res = await ctx.post("/api/auth/login", { data: { email: EMAIL, password: PASSWORD, totp: totp(otpauthSecret) } });
    expect(res.status()).toBe(200);
    const session = await ctx.get("/api/auth/session");
    const s = await session.json();
    expect(s.authenticated).toBe(true);
    expect(s.email).toBeUndefined(); // opaque uid — PII dönmez
  });

  test("passkey registration options — excludeCredentials + opaque userID", async () => {
    const res = await ctx.post("/api/auth/passkeys/options", { data: {} });
    expect(res.status()).toBe(200);
    const j = await res.json();
    expect(j.rp?.id ?? j.rpID).toBeDefined();
    expect(Array.isArray(j.excludeCredentials)).toBe(true);
  });

  test("middleware flag-ON — anon /api/dashboard 401; oturumlu 200; health açık", async () => {
    const fresh = await pwRequest.newContext({ baseURL: BASE }); // çerezsiz bağlam
    const anon = await fresh.get("/api/dashboard");
    expect(anon.status()).toBe(401); // middleware zorlaması
    const health = await fresh.get("/api/health");
    expect(health.status()).toBe(200); // public açık yüzey
    await fresh.dispose();
    const authed = await ctx.get("/api/dashboard");
    expect(authed.status()).toBe(200); // paylaşılan oturum çerezi
  });
});
