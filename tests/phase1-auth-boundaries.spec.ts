// P1 (yeni-fazlar 3-4): auth-on kiracı çözümü + yönetim yüzeyi rol kapıları.
// Yalnız MAVEN_AUTH=on koşusunda çalışır (bayrak kapalıyken SKIP — off-modu bayt-özdeş kalır).
//
// Yöntem: oturum çerezi ÜRETİM Formatıyla (base64url(JSON)+HMAC) testte imzalanır —
// bu, middleware'in üretimde doğruladığı gerçek güven çapasıdır; "meşru oturumlu
// kullanıcı" simülasyonudur (giriş-kovası sınırlarını gereksiz tüketmez).
// Kapsam:
//   * session tenant yetkili: ?tenantId=oturum-kiracısı 200, başka kiracı 404 (P1.3)
//   * KVKK GET/PATCH staff kapısı; portal preview-token + blocks admin kapısı (P1.4)
//   * rol uyuşmazlığı 403; oturumsuz 401; sahte başlık 401 (strip kanıtı)
import { test, expect } from "@playwright/test";
import crypto from "crypto";
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
const AUTH_ON = process.env.MAVEN_AUTH === "on";
test.skip(!AUTH_ON, "MAVEN_AUTH=off — auth-boundary testleri yalnız flag-ON kapısında anlamlı");

const COOKIE = "maven.session"; // dev çerez adı (prod: __Host-maven.session)
const SECRET = process.env.MAVEN_SECRET_KEY ?? "maven-dev-only-secret-key-change-me";

function signSession(payload: Record<string, unknown>): string {
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const sig = crypto.createHmac("sha256", SECRET).update(body).digest("base64url");
  return `${body}.${sig}`;
}

function sessionCookie(tenantId: string, role: string, ttl = 3600): string {
  const now = Math.floor(Date.now() / 1000);
  const token = signSession({ uid: "e2e-actor-uid", role, tenantId, iat: now, exp: now + ttl });
  return `${COOKIE}=${token}`;
}

let tenantId = "";
let editionId = "";
let personId = "";

test.beforeAll(async () => {
  const t = await db.tenant.findFirst({ select: { id: true } });
  tenantId = t!.id;
  const ed = await db.eventEdition.findFirst({ orderBy: { createdAt: "asc" }, select: { id: true } });
  editionId = ed!.id;
  const p = await db.person.findFirst({ select: { id: true } });
  personId = p!.id;
});

test.describe("P1.3 — oturum kiracısı yetkilidir (auth-on)", () => {
  test("people?tenantId=oturum-kiracısı → 200", async ({ request }) => {
    const res = await request.get(`/api/people?tenantId=${tenantId}`, { headers: { Cookie: sessionCookie(tenantId, "ORG_OWNER") } });
    expect(res.status()).toBe(200);
  });

  test("people?tenantId=başka-kiracı → 404 (kiracı uyuşmazlığı fail-closed)", async ({ request }) => {
    const res = await request.get(`/api/people?tenantId=cuid-farkli-kiraci-000000`, { headers: { Cookie: sessionCookie(tenantId, "ORG_OWNER") } });
    expect([404, 400]).toContain(res.status());
  });

  test("korunan yol + SAHTE x-maven-session-tenant başlığı, çerezsiz → 401 (başlık strip)", async ({ request }) => {
    const res = await request.get(`/api/people?tenantId=${tenantId}`, { headers: { "x-maven-session-tenant": tenantId } });
    expect(res.status()).toBe(401);
  });
});

test.describe("P1.4 — yönetim yüzeyi kapıları (auth-on)", () => {
  test("ORG_OWNER oturumu: KVKK GET 200 (staff)", async ({ request }) => {
    const res = await request.get("/api/kvkk/erasure", { headers: { Cookie: sessionCookie(tenantId, "ORG_OWNER") } });
    expect(res.status()).toBe(200);
  });

  test("ORG_OWNER oturumu: preview-token çıkarımı 2xx (admin)", async ({ request }) => {
    const res = await request.post("/api/portal/preview-token", {
      headers: { Cookie: sessionCookie(tenantId, "ORG_OWNER") },
      data: { editionId, personId, ttlMinutes: 30 },
    });
    expect([200, 201]).toContain(res.status());
    const body = (await res.json()) as { token?: string };
    expect(typeof body.token).toBe("string");
  });

  test("ORG_OWNER oturumu: portal blocks GET 200 (admin editör yüzeyi)", async ({ request }) => {
    const res = await request.get(`/api/portal/blocks?editionId=${editionId}`, { headers: { Cookie: sessionCookie(tenantId, "ORG_OWNER") } });
    expect(res.status()).toBe(200);
  });

  test("ATTENDEE rolü: KVKK GET 403 (rol uyuşmazlığı)", async ({ request }) => {
    const res = await request.get("/api/kvkk/erasure", { headers: { Cookie: sessionCookie(tenantId, "ATTENDEE") } });
    expect(res.status()).toBe(403);
  });

  test("ATTENDEE rolü: preview-token 403", async ({ request }) => {
    const res = await request.post("/api/portal/preview-token", {
      headers: { Cookie: sessionCookie(tenantId, "ATTENDEE") },
      data: { editionId, personId },
    });
    expect(res.status()).toBe(403);
  });

  test("ATTENDEE rolü: portal blocks 403", async ({ request }) => {
    const res = await request.get(`/api/portal/blocks?editionId=${editionId}`, { headers: { Cookie: sessionCookie(tenantId, "ATTENDEE") } });
    expect(res.status()).toBe(403);
  });

  test("oturumsuz: KVKK GET 401, preview-token 401, blocks 401", async ({ request }) => {
    expect((await request.get("/api/kvkk/erasure")).status()).toBe(401);
    expect((await request.post("/api/portal/preview-token", { data: { editionId, personId } })).status()).toBe(401);
    expect((await request.get(`/api/portal/blocks?editionId=${editionId}`)).status()).toBe(401);
  });

  test("public KVKK giriş POST kapısı korunur (oturumsuz 201/422)", async ({ request }) => {
    const res = await request.post("/api/kvkk/erasure", { data: { email: "phase1-probe@kvkk.test" } });
    expect([201, 200, 422, 429]).toContain(res.status()); // 429: rate kovası tekrar koşuda dolu olabilir
  });

  test("P4.17 — kimliksiz scan forceReason 401 (kanıt üretilemez)", async ({ request }) => {
    // public scan yüzeyi kimliksiz NORMAL okumaya açık kalır; ama engelleyiciyi aşan
    // forceReason (check-in/CME/sertifika kanıtı) OPERATÖR yeteneğidir → 401.
    const res = await request.post("/api/scan", { data: { code: "QR-ANON-PROBE", forceReason: "P4 test istisnası" } });
    expect(res.status()).toBe(401);
  });

  test("P4.17 — ORG_OWNER scan forceReason kabul (operatör yeteneği)", async ({ request }) => {
    const res = await request.post("/api/scan", {
      headers: { Cookie: sessionCookie(tenantId, "ORG_OWNER") },
      data: { code: "QR-OPERATOR-PROBE", forceReason: "P4 operatör istisnası" },
    });
    // geçersiz kod → 404 DENIED; KAPI YOK — 401/403 DEĞİL (yetki geçildi)
    expect([404, 200]).toContain(res.status());
    expect(res.status()).not.toBe(401);
    expect(res.status()).not.toBe(403);
  });
});
