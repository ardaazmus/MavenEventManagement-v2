import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createIsolatedTestDb } from "../tests/support/test-db.mjs";

const libPath = path.resolve("src/lib/sponsorship/capacity.ts");

async function setup() {
  const iso = await createIsolatedTestDb("p10");
  const tag = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const tenant = await iso.prisma.tenant.create({ data: { name: "T", slug: `t-p10-${tag}` } });
  const edition = await iso.prisma.eventEdition.create({ data: { tenantId: tenant.id, name: "E", slug: `e-p10-${tag}` } });
  const org = await iso.prisma.organization.create({ data: { tenantId: tenant.id, name: "Acme" } });
  return { iso, tenant, edition, org };
}

test("P10.1 - kullanımda olan tier/package silinemez (guard)", async () => {
  const { guardTierDelete, guardPackageDelete } = await import(pathToFileURL(libPath).href);
  const { iso, edition, org } = await setup();
  try {
    const tier = await iso.prisma.sponsorTierDefinition.create({ data: { editionId: edition.id, name: "Gold" } });

    // Boş tier silinebilir
    assert.strictEqual(await guardTierDelete(iso.prisma, tier.id), null);
    // Paket bağlı tier silinemez
    await iso.prisma.sponsorPackage.create({ data: { editionId: edition.id, tierId: tier.id, name: "GP" } });
    assert.match((await guardTierDelete(iso.prisma, tier.id)) ?? "", /kullanım/i);

    const tier2 = await iso.prisma.sponsorTierDefinition.create({ data: { editionId: edition.id, name: "Silver" } });
    await iso.prisma.sponsorAgreement.create({
      data: { editionId: edition.id, organizationId: org.id, tierId: tier2.id, status: "PROSPECT" },
    });
    assert.match((await guardTierDelete(iso.prisma, tier2.id)) ?? "", /kullanım/i, "anlaşmalı tier silinemez");

    // Boş paket silinebilir; anlaşmalı paket silinemez
    const pack2 = await iso.prisma.sponsorPackage.create({ data: { editionId: edition.id, name: "SP" } });
    assert.strictEqual(await guardPackageDelete(iso.prisma, pack2.id), null);
    await iso.prisma.sponsorAgreement.create({
      data: { editionId: edition.id, organizationId: org.id, packageId: pack2.id, status: "PROSPECT" },
    });
    assert.match((await guardPackageDelete(iso.prisma, pack2.id)) ?? "", /kullanım/i);
  } finally {
    await iso.cleanup();
  }
});

test("P10.1 - tier/package validate: ad zorunlu, kapasite/fiyat tamsayı (registry kablosu)", async () => {
  const { validateTierInput, validatePackageInput } = await import(pathToFileURL(libPath).href);
  assert.match(validateTierInput({ name: "  " }, false) ?? "", /ad|name/i);
  assert.strictEqual(validateTierInput({ name: "Gold", capacity: 5, price: 1000, currency: "TRY" }, false), null);
  assert.ok(validateTierInput({ name: "G", capacity: -1 }, false), "negatif kapasite yasak");
  assert.ok(validateTierInput({ name: "G", capacity: 1.5 }, false), "kesirli kapasite yasak");
  assert.strictEqual(validateTierInput({ name: "G", capacity: null }, false), null, "null kapasite = sınırsız");
  assert.ok(validateTierInput({ name: "G", price: -5 }, false), "negatif fiyat yasak");
  assert.ok(validatePackageInput({}, false), "paket adı zorunlu");
  assert.strictEqual(validatePackageInput({ name: "P" }, false), null);

  const registry = fs.readFileSync(path.resolve("src/lib/api/registry.ts"), "utf8");
  for (const entity of ['"sponsor-tiers"', '"sponsor-packages"']) {
    const start = registry.indexOf(`${entity}: {`);
    assert.ok(start !== -1, `${entity} registry girdisi olmalı`);
    const block = registry.slice(start, start + 3000);
    assert.ok(block.includes("validate"), `${entity} validate kancası olmalı`);
    assert.ok(block.includes("beforeDelete"), `${entity} beforeDelete kancası olmalı`);
  }
  const itemRoute = fs.readFileSync(path.resolve("src/app/api/[entity]/[id]/route.ts"), "utf8");
  assert.ok(itemRoute.includes("beforeDelete"), "DELETE beforeDelete kancasını çağırmalı");
});

test("P10.2 - kapasite: CONTRACTED/ACTIVE sayımı, dolu seviyede 409", async () => {
  const { transitionSponsorAgreement } = await import(pathToFileURL(libPath).href);
  const { iso, edition, org } = await setup();
  try {
    const tier = await iso.prisma.sponsorTierDefinition.create({ data: { editionId: edition.id, name: "Gold", capacity: 1 } });
    const mk = (status) =>
      iso.prisma.sponsorAgreement.create({
        data: { editionId: edition.id, organizationId: org.id, tierId: tier.id, status },
      });
    const a1 = await mk("NEGOTIATION");
    const a2 = await mk("NEGOTIATION");

    const first = await transitionSponsorAgreement(iso.prisma, {
      actorMaxRank: 50,
      agreementId: a1.id,
      data: { status: "CONTRACTED", signedAt: "2026-01-01T00:00:00.000Z" },
    });
    assert.strictEqual(first.ok, true, `ilk kontrat yerleşmeli: ${first.ok ? "" : first.error}`);

    const second = await transitionSponsorAgreement(iso.prisma, {
      actorMaxRank: 50,
      agreementId: a2.id,
      data: { status: "CONTRACTED", signedAt: "2026-01-01T00:00:00.000Z" },
    });
    assert.strictEqual(second.ok, false);
    assert.strictEqual(second.status, 409);
    assert.match(second.error, /kapasite/i);

    // Aynı tier içinde CONTRACTED→ACTIVE slot tüketmez
    const promote = await transitionSponsorAgreement(iso.prisma, {
      actorMaxRank: 50,
      agreementId: a1.id,
      data: { status: "ACTIVE" },
    });
    assert.strictEqual(promote.ok, true, "aynı tier içi yükseltme engellenmemeli");
  } finally {
    await iso.cleanup();
  }
});

test("P10.2 - kapasite yarışı: paralel iki kontrattan yalnız biri yerleşir", async () => {
  const { transitionSponsorAgreement } = await import(pathToFileURL(libPath).href);
  const { iso, edition, org } = await setup();
  try {
    const tier = await iso.prisma.sponsorTierDefinition.create({ data: { editionId: edition.id, name: "Race", capacity: 1 } });
    const mk = (status) =>
      iso.prisma.sponsorAgreement.create({
        data: { editionId: edition.id, organizationId: org.id, tierId: tier.id, status },
      });
    const a1 = await mk("NEGOTIATION");
    const a2 = await mk("NEGOTIATION");

    const [r1, r2] = await Promise.all([
      transitionSponsorAgreement(iso.prisma, {
        actorMaxRank: 50,
        agreementId: a1.id,
        data: { status: "CONTRACTED", signedAt: "2026-01-01T00:00:00.000Z" },
      }),
      transitionSponsorAgreement(iso.prisma, {
        actorMaxRank: 50,
        agreementId: a2.id,
        data: { status: "CONTRACTED", signedAt: "2026-01-01T00:00:00.000Z" },
      }),
    ]);
    const oks = [r1, r2].filter((r) => r.ok);
    const fulls = [r1, r2].filter((r) => !r.ok && r.status === 409);
    assert.strictEqual(oks.length, 1, "yalnız biri yerleşmeli");
    assert.strictEqual(fulls.length, 1, "diğeri 409 kapasite almalı");

    const count = await iso.prisma.sponsorAgreement.count({
      where: { tierId: tier.id, status: { in: ["CONTRACTED", "ACTIVE"] } },
    });
    assert.strictEqual(count, 1, "DB'de yalnız 1 dolu slot olmalı");
  } finally {
    await iso.cleanup();
  }
});

test("P10.3 - kapasite UX: doluluk göstergesi + dolu seviyede seçim kapalı + 409 tazeleme", async () => {
  const kanban = fs.readFileSync(path.resolve("src/components/maven/sponsorship/sponsorship-kanban.tsx"), "utf8");
  const view = fs.readFileSync(path.resolve("src/components/maven/views/sponsorship.tsx"), "utf8");

  assert.ok(kanban.includes("tierUsage") || kanban.includes("usage"), "kanban tier doluluk bilgisi almalı");
  assert.ok(/dolu/.test(kanban), `"3/5 dolu" göstergesi olmalı`);
  assert.ok(kanban.includes("disabled"), "dolu seviye seçimi engellenmeli (UI ön-kontrol)");

  assert.ok(/kapasite|doldu/i.test(view), "409 kapasite sonrası görünüm tazelenmeli");
});
