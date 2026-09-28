import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createIsolatedTestDb } from "../tests/support/test-db.mjs";

const libPath = path.resolve("src/lib/sponsorship/enforcement.ts");
const itemRoutePath = path.resolve("src/app/api/[entity]/[id]/route.ts");

async function setup() {
  const iso = await createIsolatedTestDb("p08-2");
  const tenant = await iso.prisma.tenant.create({ data: { name: "T", slug: `t-p082-${Date.now()}-${Math.random().toString(36).slice(2, 7)}` } });
  const edition = await iso.prisma.eventEdition.create({ data: { tenantId: tenant.id, name: "E", slug: `e-p082-${Date.now()}-${Math.random().toString(36).slice(2, 7)}` } });
  const org = await iso.prisma.organization.create({ data: { tenantId: tenant.id, name: "Acme" } });
  const agreement = await iso.prisma.sponsorAgreement.create({
    data: { editionId: edition.id, organizationId: org.id, amount: 1000, currency: "TRY", status: "PROSPECT" },
  });
  return { iso, agreement };
}

test("P08.2 - decideSponsorStatusChange: ileri geçiş + imza kuralı (DB)", async () => {
  const { decideSponsorStatusChange } = await import(pathToFileURL(libPath).href);
  const { iso, agreement } = await setup();
  try {
    // PROSPECT→NEGOTIATION serbest
    const ok = await decideSponsorStatusChange(iso.prisma, {
      actorMaxRank: 50,
      agreementId: agreement.id,
      data: { status: "NEGOTIATION" },
    });
    assert.strictEqual(ok.ok, true);
    assert.strictEqual(ok.audit.from, "PROSPECT");
    assert.strictEqual(ok.audit.to, "NEGOTIATION");

    // Atlama yasak (400)
    const skip = await decideSponsorStatusChange(iso.prisma, {
      actorMaxRank: 100,
      agreementId: agreement.id,
      data: { status: "CONTRACTED", signedAt: "2026-01-01" },
    });
    assert.strictEqual(skip.ok, false);
    assert.strictEqual(skip.status, 400);

    // CONTRACTED imzasız yasak; imzalı + basamaklı akışta serbest
    await iso.prisma.sponsorAgreement.update({ where: { id: agreement.id }, data: { status: "NEGOTIATION" } });
    const unsigned = await decideSponsorStatusChange(iso.prisma, {
      actorMaxRank: 50,
      agreementId: agreement.id,
      data: { status: "CONTRACTED" },
    });
    assert.strictEqual(unsigned.ok, false);
    const signed = await decideSponsorStatusChange(iso.prisma, {
      actorMaxRank: 50,
      agreementId: agreement.id,
      data: { status: "CONTRACTED", signedAt: "2026-02-01T00:00:00.000Z" },
    });
    assert.strictEqual(signed.ok, true);
  } finally {
    await iso.cleanup();
  }
});

test("P08.2 - decideSponsorStatusChange: iptal/reopen gerekçe + rütbe + alan temizliği (DB)", async () => {
  const { decideSponsorStatusChange } = await import(pathToFileURL(libPath).href);
  const { iso, agreement } = await setup();
  try {
    // Gerekçesiz iptal yasak
    const noReason = await decideSponsorStatusChange(iso.prisma, {
      actorMaxRank: 50,
      agreementId: agreement.id,
      data: { status: "CANCELLED" },
    });
    assert.strictEqual(noReason.ok, false);

    // Gerekçeli iptal serbest; yardımcı alan Prisma'ya gitmez
    const cancel = await decideSponsorStatusChange(iso.prisma, {
      actorMaxRank: 50,
      agreementId: agreement.id,
      data: { status: "CANCELLED", transitionReason: "Sponsor vazgeçti" },
    });
    assert.strictEqual(cancel.ok, true);
    assert.ok(!("transitionReason" in cancel.data), "transitionReason Prisma verisinden ayıklanmalı");
    assert.strictEqual(cancel.audit.reason, "Sponsor vazgeçti");

    // Reopen düşük rütbeyle 403
    await iso.prisma.sponsorAgreement.update({ where: { id: agreement.id }, data: { status: "NEGOTIATION" } });
    const lowRank = await decideSponsorStatusChange(iso.prisma, {
      actorMaxRank: 10,
      agreementId: agreement.id,
      data: { status: "PROSPECT", transitionReason: "x" },
    });
    assert.strictEqual(lowRank.ok, false);
    assert.strictEqual(lowRank.status, 403);

    // Geçişsiz güncellemede yardımcı alan yine ayıklanır, denetim kaydı yok
    const plain = await decideSponsorStatusChange(iso.prisma, {
      actorMaxRank: 10,
      agreementId: agreement.id,
      data: { notes: "hello", transitionReason: "stray" },
    });
    assert.strictEqual(plain.ok, true);
    assert.strictEqual(plain.audit, null);
    assert.ok(!("transitionReason" in plain.data));
  } finally {
    await iso.cleanup();
  }
});

test("P08.2 - item route sponsor geçişlerini update öncesi zorlar + denetim yazar (kablo)", async () => {
  const src = fs.readFileSync(itemRoutePath, "utf8");
  assert.ok(src.includes("decideSponsorStatusChange"), "item route geçiş kararını kullanmalı");
  const putIdx = src.indexOf("export async function PUT");
  const putBlock = src.slice(putIdx, src.indexOf("export async function DELETE"));
  assert.ok(putBlock.includes("sponsor-agreements"), "PUT sponsor dalı içermeli");
  assert.ok(
    putBlock.indexOf("decideSponsorStatusChange") < putBlock.indexOf("config.delegate.update"),
    "geçiş kararı update ÖNCESİ verilmeli",
  );
  assert.ok(putBlock.includes("transitionAudit") || putBlock.includes("from") && putBlock.includes("transitionReason"), "geçiş denetimi yazılmalı");
});
