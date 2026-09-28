import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { createIsolatedTestDb } from "../tests/support/test-db.mjs";

const brandPath = path.resolve("src/lib/promo/brand-assets.ts");
const utmPath = path.resolve("src/lib/promo/utm.ts");
const apprPath = path.resolve("src/lib/promo/campaign-approval.ts");

async function setup(tag) {
  const iso = await createIsolatedTestDb(`p19-${tag}`);
  const uniq = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const tenant = await iso.prisma.tenant.create({ data: { name: "T", slug: `t-p19-${tag}-${uniq}` } });
  const other = await iso.prisma.tenant.create({ data: { name: "X", slug: `t-p19x-${tag}-${uniq}` } });
  const edition = await iso.prisma.eventEdition.create({ data: { tenantId: tenant.id, name: "E", slug: `e-p19-${tag}-${uniq}` } });
  return { iso, tenant, other, edition };
}

test("P19.1 - varlık: sürüm + hash + lisans + dosya kuralları", async () => {
  const { createBrandAsset, updateBrandAsset, BrandAssetError } = await import(pathToFileURL(brandPath).href);
  const ctx = await setup("asset");
  try {
    const a = await createBrandAsset(ctx.iso.prisma, {
      tenantId: ctx.tenant.id, name: "Ana Logo", kind: "logo",
      dataUrl: "data:image/png;base64,aGk=", license: "© Şirket — iç kullanım",
    });
    assert.strictEqual(a.version, 1);
    assert.strictEqual(a.kind, "LOGO");
    assert.ok(a.sha256 && a.sha256.length === 64);
    assert.ok(a.sizeKb >= 1);

    const u = await updateBrandAsset(ctx.iso.prisma, { tenantId: ctx.tenant.id, assetId: a.id, name: "Ana Logo v2" });
    assert.strictEqual(u.version, 2);
    assert.strictEqual(u.name, "Ana Logo v2");
    assert.strictEqual(u.license, "© Şirket — iç kullanım", "verilmeyen alan korunur");

    // Çift dosya + devasa satır-içi + bozuk URL reddedilir.
    await assert.rejects(() => createBrandAsset(ctx.iso.prisma, { tenantId: ctx.tenant.id, name: "X", dataUrl: "data:x", externalUrl: "https://x.co/a.png" }), (e) => e instanceof BrandAssetError && e.status === 422);
    await assert.rejects(() => createBrandAsset(ctx.iso.prisma, { tenantId: ctx.tenant.id, name: "X", dataUrl: "data:," + "a".repeat(500 * 1024) }), (e) => e instanceof BrandAssetError && e.status === 422);
    await assert.rejects(() => createBrandAsset(ctx.iso.prisma, { tenantId: ctx.tenant.id, name: "X", externalUrl: "ftp://x/a" }), (e) => e instanceof BrandAssetError && e.status === 422);
    // Komşu kiracı güncelleyemez.
    await assert.rejects(() => updateBrandAsset(ctx.iso.prisma, { tenantId: ctx.other.id, assetId: a.id, name: "Gas" }), (e) => e instanceof BrandAssetError && e.status === 404);
  } finally {
    await ctx.iso.cleanup();
  }
});

test("P19.2 - referans: kopya yok + override çözünürlüğü + ayrılma", async () => {
  const { createBrandAsset, attachBrandRef, detachBrandRef, listEditionBrandAssets, BrandAssetError } = await import(pathToFileURL(brandPath).href);
  const ctx = await setup("ref");
  try {
    const a = await createBrandAsset(ctx.iso.prisma, { tenantId: ctx.tenant.id, name: "Afiş", kind: "BANNER", externalUrl: "https://cdn.ornek.net/afis.png" });
    await attachBrandRef(ctx.iso.prisma, { tenantId: ctx.tenant.id, editionId: ctx.edition.id, assetId: a.id });
    let items = await listEditionBrandAssets(ctx.iso.prisma, { tenantId: ctx.tenant.id, editionId: ctx.edition.id });
    assert.strictEqual(items.length, 1);
    assert.strictEqual(items[0].name, "Afiş");
    assert.strictEqual(items[0].externalUrl, "https://cdn.ornek.net/afis.png");
    assert.strictEqual(items[0].overridden, false);
    assert.strictEqual(await ctx.iso.prisma.brandAsset.count({ where: { tenantId: ctx.tenant.id } }), 1, "referans kopyalamaz");

    // Override: ad + dosya edisyona özgülenir, kütüphane değişmez.
    await attachBrandRef(ctx.iso.prisma, {
      tenantId: ctx.tenant.id, editionId: ctx.edition.id, assetId: a.id,
      overrideName: "Fuar Afişi", overrideExternalUrl: "https://cdn.ornek.net/fuar.png",
    });
    items = await listEditionBrandAssets(ctx.iso.prisma, { tenantId: ctx.tenant.id, editionId: ctx.edition.id });
    assert.strictEqual(items[0].name, "Fuar Afişi");
    assert.strictEqual(items[0].externalUrl, "https://cdn.ornek.net/fuar.png");
    assert.strictEqual(items[0].overridden, true);
    const lib = await ctx.iso.prisma.brandAsset.findUnique({ where: { id: a.id } });
    assert.strictEqual(lib.name, "Afiş", "kütüphane override'dan etkilenmez");

    // Kullanım işlendi.
    const uses = await ctx.iso.prisma.promoUsage.findMany({ where: { tenantId: ctx.tenant.id } });
    assert.ok(uses.some((u) => u.kind === "ASSET_ATTACH") && uses.some((u) => u.kind === "REF_OVERRIDE"));

    // Ayrılma kütüphaneyi silmez.
    assert.deepStrictEqual(await detachBrandRef(ctx.iso.prisma, { tenantId: ctx.tenant.id, editionId: ctx.edition.id, assetId: a.id }), { detached: true });
    assert.deepStrictEqual(await detachBrandRef(ctx.iso.prisma, { tenantId: ctx.tenant.id, editionId: ctx.edition.id, assetId: a.id }), { detached: false });
    assert.ok(await ctx.iso.prisma.brandAsset.findUnique({ where: { id: a.id } }));

    // Yabancı edisyon/varlık 404.
    const foreignEdition = await ctx.iso.prisma.eventEdition.create({ data: { tenantId: ctx.other.id, name: "F", slug: `e-p19f-${Date.now()}` } });
    await assert.rejects(() => attachBrandRef(ctx.iso.prisma, { tenantId: ctx.tenant.id, editionId: foreignEdition.id, assetId: a.id }), (e) => e instanceof BrandAssetError && e.status === 404);
  } finally {
    await ctx.iso.cleanup();
  }
});

test("P19.3 - onay akışı: iste → karar + dört-göz + gönderilebilirlik", async () => {
  const { requestCampaignApproval, decideCampaignApproval, assertSendable, ApprovalError } = await import(pathToFileURL(apprPath).href);
  const ctx = await setup("appr");
  try {
    const c = await ctx.iso.prisma.campaign.create({ data: { editionId: ctx.edition.id, name: "K", segmentRule: "hepsi", purpose: "COMMERCIAL" } });
    assert.throws(() => assertSendable(c), (e) => e instanceof ApprovalError && e.status === 409);
    assert.doesNotThrow(() => assertSendable({ purpose: "TRANSACTIONAL", approvalStatus: "NONE" }), "işlemsel muaftır");

    await requestCampaignApproval(ctx.iso.prisma, { tenantId: ctx.tenant.id, campaignId: c.id, requestedBy: "staff-1" });
    // Aynı kişi onaylayamaz.
    await assert.rejects(
      () => decideCampaignApproval(ctx.iso.prisma, { tenantId: ctx.tenant.id, campaignId: c.id, approve: true, decidedBy: "staff-1", actorIsAdmin: true }),
      (e) => e instanceof ApprovalError && e.status === 409,
    );
    // Yönetici olmayan karar veremez.
    await assert.rejects(
      () => decideCampaignApproval(ctx.iso.prisma, { tenantId: ctx.tenant.id, campaignId: c.id, approve: true, decidedBy: "admin-1", actorIsAdmin: false }),
      (e) => e instanceof ApprovalError && e.status === 403,
    );
    const ok = await decideCampaignApproval(ctx.iso.prisma, { tenantId: ctx.tenant.id, campaignId: c.id, approve: true, decidedBy: "admin-1", actorIsAdmin: true });
    assert.strictEqual(ok.approvalStatus, "APPROVED");
    assert.doesNotThrow(() => assertSendable({ purpose: "COMMERCIAL", approvalStatus: "APPROVED" }));

    // Red → yeniden istek yolu açık.
    const c2 = await ctx.iso.prisma.campaign.create({ data: { editionId: ctx.edition.id, name: "K2", segmentRule: "hepsi" } });
    await requestCampaignApproval(ctx.iso.prisma, { tenantId: ctx.tenant.id, campaignId: c2.id, requestedBy: "staff-1" });
    const rej = await decideCampaignApproval(ctx.iso.prisma, { tenantId: ctx.tenant.id, campaignId: c2.id, approve: false, decidedBy: "admin-1", actorIsAdmin: true, note: "metin eksik" });
    assert.strictEqual(rej.approvalStatus, "REJECTED");
    const again = await requestCampaignApproval(ctx.iso.prisma, { tenantId: ctx.tenant.id, campaignId: c2.id, requestedBy: "staff-1" });
    assert.strictEqual(again.approvalStatus, "PENDING");
  } finally {
    await ctx.iso.cleanup();
  }
});

test("P19.4 - UTM: sözlük + katı kurucu + analitik", async () => {
  const { upsertUtmTerm, buildUtmUrl, usageStats, normalizeUtmTerm, UtmError } = await import(pathToFileURL(utmPath).href);
  assert.strictEqual(normalizeUtmTerm("  E-Bülten 2026! "), "e-bulten-2026");
  assert.strictEqual(normalizeUtmTerm("!!!"), null);
  const ctx = await setup("utm");
  try {
    await upsertUtmTerm(ctx.iso.prisma, { tenantId: ctx.tenant.id, kind: "SOURCE", value: "Bülten" });
    await upsertUtmTerm(ctx.iso.prisma, { tenantId: ctx.tenant.id, kind: "MEDIUM", value: "email" });
    await upsertUtmTerm(ctx.iso.prisma, { tenantId: ctx.tenant.id, kind: "CAMPAIGN", value: "yaz-kampanyasi" });

    const built = await buildUtmUrl(ctx.iso.prisma, {
      tenantId: ctx.tenant.id, baseUrl: "https://ornek.net/kayit?x=1",
      source: "bülten", medium: "EMAIL", campaign: "Yaz Kampanyası", content: "Üst Banner",
    });
    assert.strictEqual(built.url, "https://ornek.net/kayit?x=1&utm_source=bulten&utm_medium=email&utm_campaign=yaz-kampanyasi&utm_content=ust-banner");
    assert.deepStrictEqual(built.warnings, []);

    // Sözlük-dışı katı kipte 422, esnek kipte uyarılı geçer.
    await assert.rejects(
      () => buildUtmUrl(ctx.iso.prisma, { tenantId: ctx.tenant.id, baseUrl: "https://ornek.net/", source: "korsan", medium: "email", campaign: "yaz-kampanyasi" }),
      (e) => e instanceof UtmError && e.status === 422,
    );
    const lax = await buildUtmUrl(ctx.iso.prisma, { tenantId: ctx.tenant.id, baseUrl: "https://ornek.net/", source: "korsan", medium: "email", campaign: "yaz-kampanyasi", strict: false });
    assert.deepStrictEqual(lax.warnings, ["sözlük-dışı:source:korsan"]);

    const stats = await usageStats(ctx.iso.prisma, { tenantId: ctx.tenant.id });
    assert.strictEqual(stats.total, 2);
    assert.strictEqual(stats.byKind.UTM_BUILD, 2);
    const empty = await usageStats(ctx.iso.prisma, { tenantId: ctx.other.id });
    assert.strictEqual(empty.total, 0, "analitik kiracı-kapsamlı");
  } finally {
    await ctx.iso.cleanup();
  }
});

test("P19 - kablo: yayın onay kancası + kullanım kaydı + uçlar", async () => {
  const bc = fs.readFileSync(path.resolve("src/lib/api/comms-broadcast.ts"), "utf8");
  assert.ok(bc.includes("assertSendable"), "yayın onayı denetlemeli");
  assert.ok(bc.includes("APPROVAL_REQUIRED"), "onaysız ticari 409 üretmeli");
  assert.ok(bc.includes('kind: "CAMPAIGN_SEND"'), "gönderim kullanımı işlenmeli");

  const appr = fs.readFileSync(path.resolve("src/app/api/campaigns/approval/route.ts"), "utf8");
  assert.ok(appr.includes("requestCampaignApproval") && appr.includes("decideCampaignApproval"));
  assert.ok(appr.includes("requireAdmin"), "karar yönetici kapılı");
  for (const f of ["src/app/api/promo/assets/route.ts", "src/app/api/promo/refs/route.ts", "src/app/api/promo/utm-terms/route.ts", "src/app/api/promo/utm-links/route.ts", "src/app/api/promo/usage/route.ts"]) {
    const src = fs.readFileSync(path.resolve(f), "utf8");
    assert.ok(src.includes("requireStaff") && src.includes("resolveContext"), `${f} kapılı + kapsamlı olmalı`);
  }
});
