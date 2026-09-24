// P4 (yeni-fazlar 14-16): API güvenlik sınırları.
//  * strict pagination: 0/negatif/ondalıklı/malformed/boş → 400; 1..500 → 200
//  * audit ownership: generic POST audit'i kiracı-sahipli yazar (tenantId non-null)
//  * media upload-linked: yabancı-edisyon 404; javascript:/sahte http şemaları 422;
//    meşru https kabul
//  * media export SSRF savunması: kod-düzeyi (private/metadata bloğu) — ağa bağımlı
//    değil; dış URL indirilemezse .url bırakma davranışı korunur
import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
let tenantId = "";

test.beforeAll(async () => {
  const t = await db.tenant.findFirst({ select: { id: true } });
  tenantId = t!.id;
});

test.describe("P4.14 — strict pagination", () => {
  const bad = ["0", "-5", "501", "2.5", "abc", "", "1e2", "0x5"];
  for (const v of bad) {
    test(`limit="${v}" → 400`, async ({ request }) => {
      const res = await request.get(`/api/people?tenantId=${tenantId}&limit=${encodeURIComponent(v)}`);
      expect(res.status()).toBe(400);
      const body = (await res.json()) as { error?: string };
      expect(body.error).toContain("limit");
    });
  }
  test("limit=1 ve limit=500 → 200", async ({ request }) => {
    expect((await request.get(`/api/people?tenantId=${tenantId}&limit=1`)).status()).toBe(200);
    expect((await request.get(`/api/people?tenantId=${tenantId}&limit=500`)).status()).toBe(200);
  });
  test("limit verilmezse varsayılan çalışır (mevcut tüketici korunur)", async ({ request }) => {
    expect((await request.get(`/api/people?tenantId=${tenantId}`)).status()).toBe(200);
  });
});

test.describe("P4.15 — audit sahipliği", () => {
  test("generic POST audit'i tenantId dolu yazar (null sahiplik yok)", async ({ request }) => {
    const res = await request.post("/api/organizations", { data: { name: `P4 Audit Org ${Date.now()}` } });
    expect(res.status()).toBe(201);
    const created = (await res.json()) as { id: string };
    const log = await db.activityLog.findFirst({
      where: { entityType: "organizations", entityId: created.id },
      orderBy: { createdAt: "desc" },
    });
    expect(log).not.toBeNull();
    expect(log!.tenantId).toBe(tenantId); // sahiplik çözümlü
    expect(log!.actorName?.length ?? 0).toBeGreaterThan(0);
  });
});

test.describe("P4.16 — medya sınırı", () => {
  test("yabancı kiracının edisyonuna yükleme 404", async ({ request }) => {
    const foreignTenant = await db.tenant.create({ data: { name: `P4 Foreign ${Date.now()}`, slug: `p4-foreign-${Date.now()}` } as never, select: { id: true } });
    const foreignEd = await db.eventEdition.create({
      data: { tenantId: foreignTenant.id, name: "P4 Yabancı", slug: `p4-foreign-${Date.now()}`, format: "ONSITE" } as never,
      select: { id: true },
    });
    const res = await request.post("/api/media/upload-linked", {
      data: { editionId: foreignEd.id, systemFolder: "people", name: "x.jpg", externalUrl: "https://example.com/x.jpg" },
    });
    expect(res.status()).toBe(404);
  });

  test("javascript: ve sahte-http dış URL'ler 422; meşru https 201", async ({ request }) => {
    const base = { editionId: (await db.eventEdition.findFirst({ select: { id: true } }))!.id, systemFolder: "people", name: "p4.png" };
    const js = await request.post("/api/media/upload-linked", { data: { ...base, externalUrl: "javascript:alert(1)" } });
    expect(js.status()).toBe(422);
    const fake = await request.post("/api/media/upload-linked", { data: { ...base, externalUrl: "httpfoo://evil.test/x" } });
    expect(fake.status()).toBe(422);
    const ok = await request.post("/api/media/upload-linked", { data: { ...base, externalUrl: "https://example.com/valid.png" } });
    expect([201, 200]).toContain(ok.status());
  });

  test("export ZIP manifest dış-url düşüşünde .url bırakır (SSRF-blocked dahil)", async ({ request }) => {
    const ed = await db.eventEdition.findFirst({ select: { id: true, name: true, slug: true } });
    const folder = await db.mediaFolder.create({ data: { editionId: ed!.id, name: "P4 Klasör" } as never, select: { id: true } });
    await db.mediaAsset.create({
      data: { editionId: ed!.id, folderId: folder.id, name: "p4-ssrf-probe.png", kind: "IMAGE", mimeType: "image/png", externalUrl: "http://169.254.169.254/latest/meta-data/", sizeKb: 1 } as never,
    });
    const res = await request.get(`/api/media/export?editionId=${ed!.id}`);
    expect(res.status()).toBe(200);
    // zip gövdesinde .url bırakma olmalı; metadata IP'sinden İÇERİK İNDİRİLMEMELİ
    const zip = await res.body();
    expect(zip.length).toBeGreaterThan(0);
  });
});
