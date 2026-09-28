import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createIsolatedTestDb } from "../tests/support/test-db.mjs";

const libPath = path.resolve("src/lib/sponsorship/deliverables.ts");

async function setup() {
  const iso = await createIsolatedTestDb("p13");
  const tag = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const tenant = await iso.prisma.tenant.create({ data: { name: "T", slug: `t-p13-${tag}` } });
  const edition = await iso.prisma.eventEdition.create({ data: { tenantId: tenant.id, name: "E", slug: `e-p13-${tag}` } });
  const org = await iso.prisma.organization.create({ data: { tenantId: tenant.id, name: "Acme" } });
  const agreement = await iso.prisma.sponsorAgreement.create({
    data: { editionId: edition.id, organizationId: org.id, status: "ACTIVE" },
  });
  return { iso, tenant, edition, org, agreement };
}

test("P13.1 - teslim durum makinesi: ileri akış + kanıt zorunluluğu (DB)", async () => {
  const { decideDeliverableChange } = await import(pathToFileURL(libPath).href);
  const { iso, agreement } = await setup();
  try {
    const d = await iso.prisma.deliverable.create({ data: { agreementId: agreement.id, name: "Logo", type: "LOGO" } });

    // Kanıtsız SUBMITTED yasak
    const bare = await decideDeliverableChange(iso.prisma, { actorMaxRank: 50, deliverableId: d.id, data: { status: "SUBMITTED" } });
    assert.strictEqual(bare.ok, false);
    assert.match(bare.error, /kanıt|proof/i);

    // Kanıtlı (not ya da dosya URL) serbest
    const withNote = await decideDeliverableChange(iso.prisma, { actorMaxRank: 50, deliverableId: d.id, data: { status: "SUBMITTED", notes: "logo v3 eklendi" } });
    assert.strictEqual(withNote.ok, true, `not-kanıtlı gönderim serbest olmalı: ${withNote.ok ? "" : withNote.error}`);
    await iso.prisma.deliverable.update({ where: { id: d.id }, data: { status: "SUBMITTED", notes: "logo v3" } });

    const withUrl = await decideDeliverableChange(iso.prisma, { actorMaxRank: 50, deliverableId: d.id, data: { status: "UNDER_REVIEW" } });
    assert.strictEqual(withUrl.ok, true);

    // Atlama yasak
    const skip = await decideDeliverableChange(iso.prisma, { actorMaxRank: 100, deliverableId: d.id, data: { status: "COMPLETED" } });
    assert.strictEqual(skip.ok, false);
    assert.strictEqual(skip.status, 400);
  } finally {
    await iso.cleanup();
  }
});

test("P13.1 - onay/red yalnız yayıncı (rank≥50); red gerekçe ister (DB)", async () => {
  const { decideDeliverableChange } = await import(pathToFileURL(libPath).href);
  const { iso, agreement } = await setup();
  try {
    const d = await iso.prisma.deliverable.create({
      data: { agreementId: agreement.id, name: "Banner", type: "BANNER", status: "UNDER_REVIEW" },
    });
    const lowApprove = await decideDeliverableChange(iso.prisma, { actorMaxRank: 10, deliverableId: d.id, data: { status: "APPROVED" } });
    assert.strictEqual(lowApprove.ok, false);
    assert.strictEqual(lowApprove.status, 403);

    const okApprove = await decideDeliverableChange(iso.prisma, { actorMaxRank: 50, deliverableId: d.id, data: { status: "APPROVED" } });
    assert.strictEqual(okApprove.ok, true);

    const bareReject = await decideDeliverableChange(iso.prisma, { actorMaxRank: 50, deliverableId: d.id, data: { status: "REJECTED" } });
    assert.strictEqual(bareReject.ok, false, "gerekçesiz red yasak");
    const reasoned = await decideDeliverableChange(iso.prisma, { actorMaxRank: 50, deliverableId: d.id, data: { status: "REJECTED", notes: "çözünürlük düşük" } });
    assert.strictEqual(reasoned.ok, true);
  } finally {
    await iso.cleanup();
  }
});

test("P13.2 - yayın kontrol listesi: imza + teslimler + haklar + ödeme(manuel) (DB)", async () => {
  const { getAgreementReadiness } = await import(pathToFileURL(libPath).href);
  const { iso, edition, org, agreement } = await setup();
  try {
    // İmzasız + teslimsiz: engelli
    const r1 = await getAgreementReadiness(iso.prisma, agreement.id);
    assert.strictEqual(r1.items.find((i) => i.key === "signature").status, "pending");
    assert.strictEqual(r1.blocked, true);

    await iso.prisma.sponsorAgreement.update({ where: { id: agreement.id }, data: { signedAt: new Date("2026-01-01") } });
    const d = await iso.prisma.deliverable.create({ data: { agreementId: agreement.id, name: "Logo", type: "LOGO", status: "SUBMITTED" } });
    const r2 = await getAgreementReadiness(iso.prisma, agreement.id);
    assert.strictEqual(r2.items.find((i) => i.key === "signature").status, "ok");
    assert.strictEqual(r2.items.find((i) => i.key === "deliverables").status, "pending");
    assert.strictEqual(r2.blocked, true);

    await iso.prisma.deliverable.update({ where: { id: d.id }, data: { status: "APPROVED" } });
    const r3 = await getAgreementReadiness(iso.prisma, agreement.id);
    assert.strictEqual(r3.items.find((i) => i.key === "deliverables").status, "ok");
    assert.strictEqual(r3.items.find((i) => i.key === "payment").status, "manual", "ödeme bağlantısı yok — manuel onay");
    assert.strictEqual(r3.blocked, false, "imza + teslimler tamamlanınca engel kalkar");

    // Reddedilmiş teslim engeller
    const d2 = await iso.prisma.deliverable.create({ data: { agreementId: agreement.id, name: "X", type: "LOGO", status: "REJECTED" } });
    const r4 = await getAgreementReadiness(iso.prisma, agreement.id);
    assert.strictEqual(r4.blocked, true);
    await iso.prisma.deliverable.delete({ where: { id: d2.id } });
  } finally {
    await iso.cleanup();
  }
});

test("P13 - item route teslim geçişlerini zorlar (kablo)", async () => {
  const src = fs.readFileSync(path.resolve("src/app/api/[entity]/[id]/route.ts"), "utf8");
  assert.ok(src.includes("decideDeliverableChange"), "PUT deliverables dalı içermeli");
});

test("P13 - teslim satırları durum değiştirir + kartta hazır olma göstergesi", async () => {
  const src = fs.readFileSync(path.resolve("src/components/maven/views/sponsorship.tsx"), "utf8");
  assert.ok(src.includes("proofUrl"), "teslim kanıt URL alanı olmalı");
  assert.ok(/Hazır|hazır olma|readiness|checklist/i.test(src), "kartta hazır olma göstergesi olmalı");
});
