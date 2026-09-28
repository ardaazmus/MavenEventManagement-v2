import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createIsolatedTestDb } from "../tests/support/test-db.mjs";

const libPath = path.resolve("src/lib/sponsorship/agreements.ts");

test("P07.1 - validateAgreementInput: organization zorunlu, status enum, amountMinor sözleşmesi", async () => {
  const { validateAgreementInput, CANONICAL_STATUSES } = await import(pathToFileURL(libPath).href);

  assert.deepStrictEqual([...CANONICAL_STATUSES].sort(), [
    "ACTIVE",
    "CANCELLED",
    "COMPLETED",
    "CONTRACTED",
    "NEGOTIATION",
    "PROSPECT",
  ]);

  // Happy path + amountMinor→amount eşlemesi (DB alanı amount, sözleşme amountMinor)
  const happy = { organizationId: "org1", status: "PROSPECT", amountMinor: 25000000, currency: "TRY" };
  assert.strictEqual(validateAgreementInput(happy, false), null);
  assert.strictEqual(happy.amount, 25000000, "amountMinor DB amount alanına eşlenmeli");
  assert.ok(!("amountMinor" in happy), "amountMinor Prisma'ya ulaşmamalı");
  // status yoksa varsayılan PROSPECT kabul edilir
  assert.strictEqual(validateAgreementInput({ organizationId: "org1", amountMinor: 0 }, false), null);

  // H-01: organizasyonsuz oluşturma reddedilir
  assert.match(validateAgreementInput({ status: "PROSPECT", amountMinor: 100 }, false) ?? "", /organizationId/);
  assert.match(validateAgreementInput({ organizationId: "  ", status: "PROSPECT" }, false) ?? "", /organizationId/);

  // H-02: UI eski aşamaları reddedilir
  for (const bad of ["LEAD", "PROPOSAL", "CONTRACT", "PAID", "lead", ""]) {
    const err = validateAgreementInput({ organizationId: "org1", status: bad }, false);
    assert.ok(err && /status/i.test(err), `status=${JSON.stringify(bad)} reddedilmeli`);
  }

  // P07.4: oluşturmada yalnız PROSPECT/NEGOTIATION
  for (const bad of ["CONTRACTED", "ACTIVE", "COMPLETED", "CANCELLED"]) {
    const err = validateAgreementInput({ organizationId: "org1", status: bad }, false);
    assert.ok(err, `create status=${bad} reddedilmeli (P08 geçişleriyle kazanılır)`);
  }
  assert.strictEqual(validateAgreementInput({ organizationId: "org1", status: "NEGOTIATION" }, false), null);

  // N-02: amountMinor tamsayı kuruş, negatif/NaN/kesirli/taşma yok
  for (const bad of [-1, -100, 1.5, NaN, Infinity, 2147483648, "100", null]) {
    const err = validateAgreementInput({ organizationId: "org1", amountMinor: bad }, false);
    assert.ok(err && /amountMinor/.test(err), `amountMinor=${String(bad)} reddedilmeli`);
  }
  assert.strictEqual(validateAgreementInput({ organizationId: "org1", amountMinor: 1 }, false), null, "0,01 TL (1 kuruş) geçerli");

  // Legacy `amount` alanı açık göç mesajıyla reddedilir
  const legacy = validateAgreementInput({ organizationId: "org1", amount: 250000 }, false);
  assert.ok(legacy && /amountMinor/.test(legacy), "legacy amount amountMinor'a yönlendirmeli");

  // Update yolu: kısmi alanlar serbest, kurallar aynı
  assert.strictEqual(validateAgreementInput({ notes: "x" }, true), null);
  assert.ok(validateAgreementInput({ status: "LEAD" }, true), "update LEAD reddedilmeli");
  assert.ok(validateAgreementInput({ amount: 5 }, true), "update legacy amount reddedilmeli");
});

test("P07.1 - para round-trip sözleşmesi: 250000,00 TRY → 25000000 kuruş → ₺250.000,00", async () => {
  const { toMinor, fmtMoney } = await import(pathToFileURL(path.resolve("src/lib/money.ts")).href);
  assert.strictEqual(toMinor(250000), 25000000);
  assert.strictEqual(toMinor(0.01), 1);
  assert.strictEqual(fmtMoney(25000000, "TRY"), "₺250.000,00");
});

test("P07.1 - assertAgreementScope: package/tier edition aidiyeti + organizasyon varlığı", async () => {
  const { assertAgreementScope, AgreementScopeError } = await import(pathToFileURL(libPath).href);
  const iso = await createIsolatedTestDb("p07-1-scope");
  try {
    const tenant = await iso.prisma.tenant.create({ data: { name: "T", slug: `t-p071-${Date.now()}` } });
    const editionA = await iso.prisma.eventEdition.create({ data: { tenantId: tenant.id, name: "EA", slug: `ea-p071-${Date.now()}` } });
    const editionB = await iso.prisma.eventEdition.create({ data: { tenantId: tenant.id, name: "EB", slug: `eb-p071-${Date.now()}` } });
    const org = await iso.prisma.organization.create({ data: { tenantId: tenant.id, name: "Acme" } });
    const tierA = await iso.prisma.sponsorTierDefinition.create({ data: { editionId: editionA.id, name: "Gold" } });
    const packB = await iso.prisma.sponsorPackage.create({ data: { editionId: editionB.id, name: "Silver Pack" } });

    // Happy path: aynı edition paket/tier + mevcut organizasyon
    await assertAgreementScope(iso.prisma, {
      tenantId: tenant.id,
      editionId: editionA.id,
      organizationId: org.id,
      tierId: tierA.id,
    });

    // Cross-edition paket reddedilir
    await assert.rejects(
      () => assertAgreementScope(iso.prisma, { tenantId: tenant.id, editionId: editionA.id, organizationId: org.id, packageId: packB.id }),
      (e) => e instanceof AgreementScopeError && /edition/i.test(e.message),
    );

    // Var olmayan organizasyon reddedilir
    await assert.rejects(
      () => assertAgreementScope(iso.prisma, { tenantId: tenant.id, editionId: editionA.id, organizationId: "nope" }),
      (e) => e instanceof AgreementScopeError && /rganizasyon|organization/i.test(e.message),
    );

    // Başka kiracının organizasyonu reddedilir
    const tenantB = await iso.prisma.tenant.create({ data: { name: "TB", slug: `tb-p071-${Date.now()}` } });
    const foreignOrg = await iso.prisma.organization.create({ data: { tenantId: tenantB.id, name: "Foreign" } });
    await assert.rejects(
      () => assertAgreementScope(iso.prisma, { tenantId: tenant.id, editionId: editionA.id, organizationId: foreignOrg.id }),
      (e) => e instanceof AgreementScopeError,
    );
  } finally {
    await iso.cleanup();
  }
});

test("P07.1 - registry sponsor-agreements validate + beforeWrite kablosu", async () => {
  const src = fs.readFileSync(path.resolve("src/lib/api/registry.ts"), "utf8");
  const start = src.indexOf('"sponsor-agreements": {');
  assert.ok(start !== -1, "registry sponsor-agreements girdisi olmalı");
  const end = src.indexOf("deliverables: {", start);
  const block = src.slice(start, end);
  assert.ok(block.includes("validate"), "sponsor-agreements validate kancası olmalı (sözleşme + amountMinor eşlemesi)");
  assert.ok(block.includes("beforeWrite"), "sponsor-agreements beforeWrite kancası olmalı (edition aidiyeti)");
});
