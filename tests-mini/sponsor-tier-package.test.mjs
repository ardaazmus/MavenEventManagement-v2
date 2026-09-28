import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createIsolatedTestDb } from "../tests/support/test-db.mjs";

const kanbanPath = path.resolve("src/components/maven/sponsorship/sponsorship-kanban.tsx");
const viewPath = path.resolve("src/components/maven/views/sponsorship.tsx");

test("P09.1 - modal tier/package seçimleri edition verisinden beslenir", async () => {
  const kanban = fs.readFileSync(kanbanPath, "utf8");
  const view = fs.readFileSync(viewPath, "utf8");

  // Görünüm edition'a göre tier/package listeler
  assert.ok(view.includes('listEntity') && view.includes("sponsor-tiers"), "tier listesi API'den gelmeli");
  assert.ok(view.includes("sponsor-packages"), "paket listesi API'den gelmeli");
  assert.ok(view.includes("editionId"), "listeler edition kapsamlı olmalı");

  // Kanban prop olarak alır + seçim sunar
  assert.ok(kanban.includes("tiers"), "kanban tiers prop almalı");
  assert.ok(kanban.includes("packages"), "kanban packages prop almalı");
  assert.ok(kanban.includes("tierId"), "kanban tierId seçmeli");
  assert.ok(kanban.includes("packageId"), "kanban packageId seçmeli");

  // Boş durum açık
  assert.ok(/Seviye yok|tier tanımla|Paket yok/i.test(kanban), "boş tier/paket durumu açıklanmalı");
});

test("P09.2 - paket hak özeti: fiyat + para birimi + tier + rightsSpec", async () => {
  const kanban = fs.readFileSync(kanbanPath, "utf8");
  assert.ok(kanban.includes("rightsSpec"), "seçili paketin hak özeti gösterilmeli");
  assert.ok(kanban.includes("fmtMoney"), "paket fiyatı fmtMoney ile gösterilmeli");
});

test("P09.2 - tierId/packageId sunucuya iletilir; aynı-edition paket kapsamdan geçer", async () => {
  const view = fs.readFileSync(viewPath, "utf8");
  assert.ok(view.includes("tierId"), "handleNewDeal tierId iletmeli");
  assert.ok(view.includes("packageId"), "handleNewDeal packageId iletmeli");

  const { assertAgreementScope } = await import(pathToFileURL(path.resolve("src/lib/sponsorship/agreements.ts")).href);
  const iso = await createIsolatedTestDb("p09-2");
  try {
    const tenant = await iso.prisma.tenant.create({ data: { name: "T", slug: `t-p092-${Date.now()}` } });
    const edition = await iso.prisma.eventEdition.create({ data: { tenantId: tenant.id, name: "E", slug: `e-p092-${Date.now()}` } });
    const org = await iso.prisma.organization.create({ data: { tenantId: tenant.id, name: "Acme" } });
    const tier = await iso.prisma.sponsorTierDefinition.create({ data: { editionId: edition.id, name: "Gold", price: 100000 } });
    const pack = await iso.prisma.sponsorPackage.create({
      data: { editionId: edition.id, tierId: tier.id, name: "Gold Pack", price: 120000, rightsSpec: "2 stand" },
    });
    await assertAgreementScope(iso.prisma, {
      tenantId: tenant.id,
      editionId: edition.id,
      organizationId: org.id,
      tierId: tier.id,
      packageId: pack.id,
    });
  } finally {
    await iso.cleanup();
  }
});
