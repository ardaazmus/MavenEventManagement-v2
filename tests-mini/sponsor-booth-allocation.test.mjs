import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createIsolatedTestDb } from "../tests/support/test-db.mjs";

const libPath = path.resolve("src/lib/sponsorship/booth-allocation.ts");

async function setup() {
  const iso = await createIsolatedTestDb("p12");
  const tag = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const tenant = await iso.prisma.tenant.create({ data: { name: "T", slug: `t-p12-${tag}` } });
  const edition = await iso.prisma.eventEdition.create({ data: { tenantId: tenant.id, name: "E", slug: `e-p12-${tag}` } });
  const org = await iso.prisma.organization.create({ data: { tenantId: tenant.id, name: "Acme" } });
  const booth = await iso.prisma.boothUnit.create({ data: { editionId: edition.id, code: "A1", status: "AVAILABLE" } });
  const agreement = await iso.prisma.sponsorAgreement.create({
    data: { editionId: edition.id, organizationId: org.id, status: "CONTRACTED", signedAt: new Date("2026-01-01") },
  });
  return { iso, tenant, edition, org, booth, agreement };
}

test("P12.2 - happy path: tahsis + stand RESERVED olur (DB)", async () => {
  const { allocateBooth } = await import(pathToFileURL(libPath).href);
  const { iso, booth, agreement, org } = await setup();
  try {
    const res = await allocateBooth(iso.prisma, { boothUnitId: booth.id, agreementId: agreement.id });
    assert.strictEqual(res.ok, true, `tahsis başarılı olmalı: ${res.ok ? "" : res.error}`);
    assert.strictEqual(res.allocation.status, "RESERVED");
    assert.strictEqual(res.allocation.organizationId, org.id, "kurum anlaşmadan türetilmeli");
    const boothAfter = await iso.prisma.boothUnit.findUnique({ where: { id: booth.id } });
    assert.strictEqual(boothAfter.status, "RESERVED");
  } finally {
    await iso.cleanup();
  }
});

test("P12.2 - anlaşmasız/erken-aşama/iptal anlaşmayla tahsis yasak (DB)", async () => {
  const { allocateBooth } = await import(pathToFileURL(libPath).href);
  const { iso, edition, org, booth } = await setup();
  try {
    const noAgreement = await allocateBooth(iso.prisma, { boothUnitId: booth.id, agreementId: "" });
    assert.strictEqual(noAgreement.ok, false);
    assert.strictEqual(noAgreement.status, 400);

    for (const status of ["PROSPECT", "NEGOTIATION", "CANCELLED", "COMPLETED"]) {
      const ag = await iso.prisma.sponsorAgreement.create({
        data: { editionId: edition.id, organizationId: org.id, status },
      });
      const b = await iso.prisma.boothUnit.create({ data: { editionId: edition.id, code: `X-${status}`, status: "AVAILABLE" } });
      const r = await allocateBooth(iso.prisma, { boothUnitId: b.id, agreementId: ag.id });
      assert.strictEqual(r.ok, false, `${status} ile tahsis yasak olmalı`);
      assert.strictEqual(r.status, 400);
    }
  } finally {
    await iso.cleanup();
  }
});

test("P12.2 - cross-edition ve kurum uyuşmazlığı reddedilir (DB)", async () => {
  const { allocateBooth } = await import(pathToFileURL(libPath).href);
  const { iso, tenant, edition, org, booth } = await setup();
  try {
    const editionB = await iso.prisma.eventEdition.create({ data: { tenantId: tenant.id, name: "EB", slug: `eb-p12-${Date.now()}` } });
    const foreignAg = await iso.prisma.sponsorAgreement.create({
      data: { editionId: editionB.id, organizationId: org.id, status: "CONTRACTED" },
    });
    const cross = await allocateBooth(iso.prisma, { boothUnitId: booth.id, agreementId: foreignAg.id });
    assert.strictEqual(cross.ok, false);
    assert.strictEqual(cross.status, 400);

    const orgB = await iso.prisma.organization.create({ data: { tenantId: tenant.id, name: "Other" } });
    const ag = await iso.prisma.sponsorAgreement.create({
      data: { editionId: edition.id, organizationId: org.id, status: "CONTRACTED" },
    });
    const mismatch = await allocateBooth(iso.prisma, { boothUnitId: booth.id, agreementId: ag.id, organizationId: orgB.id });
    assert.strictEqual(mismatch.ok, false);
    assert.strictEqual(mismatch.status, 400);
  } finally {
    await iso.cleanup();
  }
});

test("P12.2 - çift tahsis 409; serbest kalan stand yeniden tahsis edilebilir (DB)", async () => {
  const { allocateBooth } = await import(pathToFileURL(libPath).href);
  const { iso, edition, org, booth, agreement } = await setup();
  try {
    const first = await allocateBooth(iso.prisma, { boothUnitId: booth.id, agreementId: agreement.id });
    assert.strictEqual(first.ok, true);

    const ag2 = await iso.prisma.sponsorAgreement.create({
      data: { editionId: edition.id, organizationId: org.id, status: "ACTIVE" },
    });
    const dup = await allocateBooth(iso.prisma, { boothUnitId: booth.id, agreementId: ag2.id });
    assert.strictEqual(dup.ok, false);
    assert.strictEqual(dup.status, 409);

    // Serbest bırakma sonrası yeniden tahsis
    await iso.prisma.boothAllocation.update({ where: { boothUnitId: booth.id }, data: { releasedAt: new Date(), status: "RELEASED" } });
    await iso.prisma.boothUnit.update({ where: { id: booth.id }, data: { status: "AVAILABLE" } });
    const retry = await allocateBooth(iso.prisma, { boothUnitId: booth.id, agreementId: ag2.id });
    assert.strictEqual(retry.ok, true, `serbest stand yeniden tahsis edilmeli: ${retry.ok ? "" : retry.error}`);
  } finally {
    await iso.cleanup();
  }
});

test("P12.2 - eşzamanlı tahsis yarışı: biri 201, diğeri 409 (DB)", async () => {
  const { allocateBooth } = await import(pathToFileURL(libPath).href);
  const { iso, edition, org, booth } = await setup();
  try {
    const mk = () =>
      iso.prisma.sponsorAgreement.create({ data: { editionId: edition.id, organizationId: org.id, status: "CONTRACTED" } });
    const [ag1, ag2] = [await mk(), await mk()];
    const [r1, r2] = await Promise.all([
      allocateBooth(iso.prisma, { boothUnitId: booth.id, agreementId: ag1.id }),
      allocateBooth(iso.prisma, { boothUnitId: booth.id, agreementId: ag2.id }),
    ]);
    const oks = [r1, r2].filter((r) => r.ok);
    const conflicts = [r1, r2].filter((r) => !r.ok && r.status === 409);
    assert.strictEqual(oks.length, 1, "yalnız biri yerleşmeli");
    assert.strictEqual(conflicts.length, 1, "diğeri 409 almalı");
  } finally {
    await iso.cleanup();
  }
});

test("P12.1 - tahsis dialogu anlaşmayı açıkça seçtirir; otomatik ilk-eşleşme yok", async () => {
  const src = fs.readFileSync(path.resolve("src/components/maven/views/sponsorship.tsx"), "utf8");
  assert.ok(!src.includes("boothsAllocTargetOrg"), "otomatik ilk-anlaşma yardımcısı kaldırılmalı");
  assert.ok(src.includes("allocAgreementId") || src.includes("selectedAgreementId"), "dialog anlaşma seçimi durumu tutmalı");
  assert.ok(src.includes("CONTRACTED") && src.includes("ACTIVE"), "yalnız kesinleşmiş anlaşmalar listelenmeli");
});

test("P12.2 - flows booth.allocate lib kapısını kullanır (kablo)", async () => {
  const src = fs.readFileSync(path.resolve("src/app/api/flows/route.ts"), "utf8");
  assert.ok(src.includes("allocateBooth"), "booth.allocate allocateBooth lib'ini kullanmalı");
  const caseIdx = src.indexOf('case "booth.allocate"');
  const caseBlock = src.slice(caseIdx, src.indexOf("case \"reservation.confirm\""));
  assert.ok(!caseBlock.includes("upsert"), "sessiz upsert (üzerine yazma) kalkmalı");
});
