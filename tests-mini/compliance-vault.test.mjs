import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { createIsolatedTestDb } from "../tests/support/test-db.mjs";

const invPath = path.resolve("src/lib/compliance/data-inventory.ts");
const archPath = path.resolve("src/lib/compliance/edition-archive.ts");
const dsarPath = path.resolve("src/lib/compliance/dsar.ts");
const eraPath = path.resolve("src/lib/compliance/erasure-job.ts");
const drillPath = path.resolve("src/lib/compliance/restore-drill.ts");

async function setup(tag) {
  const iso = await createIsolatedTestDb(`p18-${tag}`);
  const uniq = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const tenant = await iso.prisma.tenant.create({ data: { name: "T", slug: `t-p18-${tag}-${uniq}` } });
  const edition = await iso.prisma.eventEdition.create({ data: { tenantId: tenant.id, name: "E", slug: `e-p18-${tag}-${uniq}`, status: "POST_EVENT" } });
  const person = await iso.prisma.person.create({ data: { tenantId: tenant.id, firstName: "Ayşe", lastName: "Yılmaz", email: "ayse@ornek.net", phone: "05321112233" } });
  return { iso, tenant, edition, person };
}

test("P18.1 - envanter: eksiksiz + geçerli + çekirdek modeller kayıtlı", async () => {
  const { DATA_INVENTORY, validateInventory, inventoryByModel, modelsByDeletionMethod } = await import(pathToFileURL(invPath).href);
  assert.deepStrictEqual(validateInventory(), [], "envanter tutarlı olmalı");
  assert.ok(DATA_INVENTORY.length >= 15, "çekirdek PII modelleri kayıtlı olmalı");
  for (const m of ["Person", "EventParticipation", "Registration", "Order", "Payment", "CustomerContact", "ContactConsent", "SendDecision", "MailSuppression", "MediaAsset", "KvkkErasureRequest", "ActivityLog"]) {
    assert.ok(inventoryByModel(m), `${m} envanterde olmalı`);
  }
  assert.ok(modelsByDeletionMethod("ANONYMIZE").includes("Person"));
  assert.ok(modelsByDeletionMethod("DELETE").includes("CustomerContact"));
  // Yasal saklama modelleri süresiz ya da uzun süreli olmalı.
  assert.strictEqual(inventoryByModel("Order").retentionDays, 3650);
  assert.strictEqual(inventoryByModel("MailSuppression").retentionDays, null);
});

test("P18.2 - arşiv engelleri: açık finans/iş 409 dizer", async () => {
  const { checkArchiveBlockers, ArchiveError } = await import(pathToFileURL(archPath).href);
  const ctx = await setup("block");
  try {
    // Temiz edisyon engelsizdir.
    assert.deepStrictEqual(await checkArchiveBlockers(ctx.iso.prisma, { tenantId: ctx.tenant.id, editionId: ctx.edition.id }), []);

    // Her engel türünden birer kayıt.
    await ctx.iso.prisma.order.create({ data: { editionId: ctx.edition.id, status: "OPEN", totalAmount: 100 } });
    const paid = await ctx.iso.prisma.order.create({ data: { editionId: ctx.edition.id, status: "PAID", totalAmount: 50 } });
    await ctx.iso.prisma.payment.create({ data: { orderId: paid.id, amount: 50, status: "PENDING" } });
    const part = await ctx.iso.prisma.eventParticipation.create({ data: { editionId: ctx.edition.id, personId: ctx.person.id } });
    await ctx.iso.prisma.registration.create({ data: { editionId: ctx.edition.id, participationId: part.id, status: "SUBMITTED" } });
    await ctx.iso.prisma.campaign.create({ data: { editionId: ctx.edition.id, name: "K", segmentRule: "hepsi", status: "SCHEDULED" } });
    await ctx.iso.prisma.task.create({ data: { editionId: ctx.edition.id, title: "İş", status: "IN_PROGRESS" } });

    const blockers = await checkArchiveBlockers(ctx.iso.prisma, { tenantId: ctx.tenant.id, editionId: ctx.edition.id });
    assert.deepStrictEqual(blockers.map((b) => b.kind).sort(), ["OPEN_ORDER", "OPEN_REGISTRATION", "OPEN_TASK", "PENDING_PAYMENT", "SCHEDULED_CAMPAIGN"].sort());
    assert.ok(blockers.every((b) => b.count === 1 && b.detail.length > 0));

    // Yabancı edisyon 404.
    await assert.rejects(() => checkArchiveBlockers(ctx.iso.prisma, { tenantId: ctx.tenant.id, editionId: "yok" }), (e) => e instanceof ArchiveError && e.status === 404);
  } finally {
    await ctx.iso.cleanup();
  }
});

test("P18.2 - arşiv akışı: snapshot + ARCHIVED + tekillik", async () => {
  const { archiveEdition, getEditionArchive, ArchiveError } = await import(pathToFileURL(archPath).href);
  const ctx = await setup("flow");
  try {
    const part = await ctx.iso.prisma.eventParticipation.create({ data: { editionId: ctx.edition.id, personId: ctx.person.id } });
    await ctx.iso.prisma.registration.create({ data: { editionId: ctx.edition.id, participationId: part.id, status: "CONFIRMED" } });
    await ctx.iso.prisma.order.create({ data: { editionId: ctx.edition.id, status: "PAID", totalAmount: 100 } });

    const { snapshot } = await archiveEdition(ctx.iso.prisma, { tenantId: ctx.tenant.id, editionId: ctx.edition.id, archivedBy: "admin-1" });
    assert.strictEqual(snapshot.counts.participations, 1);
    assert.strictEqual(snapshot.counts.registrations, 1);
    assert.strictEqual(snapshot.counts.orders, 1);
    assert.strictEqual(snapshot.edition.statusBefore, "POST_EVENT");
    assert.strictEqual(snapshot.archivedBy, "admin-1");

    const edition = await ctx.iso.prisma.eventEdition.findUnique({ where: { id: ctx.edition.id } });
    assert.strictEqual(edition.status, "ARCHIVED");
    const read = await getEditionArchive(ctx.iso.prisma, { tenantId: ctx.tenant.id, editionId: ctx.edition.id });
    assert.strictEqual(read.snapshot.archivedBy, "admin-1");

    // İkinci arşiv 409.
    await assert.rejects(() => archiveEdition(ctx.iso.prisma, { tenantId: ctx.tenant.id, editionId: ctx.edition.id }), (e) => e instanceof ArchiveError && e.status === 409);
  } finally {
    await ctx.iso.cleanup();
  }
});

test("P18.3 - DSAR paketi: JSON bütünlük + CSV kaçış + kapsam", async () => {
  const { buildDsarBundle, dsarToCsv, DsarError } = await import(pathToFileURL(dsarPath).href);
  const ctx = await setup("dsar");
  try {
    const part = await ctx.iso.prisma.eventParticipation.create({ data: { editionId: ctx.edition.id, personId: ctx.person.id, attendance: "CHECKED_IN" } });
    await ctx.iso.prisma.registration.create({ data: { editionId: ctx.edition.id, participationId: part.id, status: "CONFIRMED" } });
    await ctx.iso.prisma.order.create({ data: { editionId: ctx.edition.id, buyerPersonId: ctx.person.id, status: "PAID", totalAmount: 250, payerName: 'Ayşe "Vip", Yılmaz' } });
    await ctx.iso.prisma.contactConsent.create({ data: { tenantId: ctx.tenant.id, channel: "EMAIL", address: "ayse@ornek.net", purpose: "COMMERCIAL", status: "GRANTED" } });

    const bundle = await buildDsarBundle(ctx.iso.prisma, { tenantId: ctx.tenant.id, personId: ctx.person.id });
    assert.strictEqual(bundle.person.email, "ayse@ornek.net");
    assert.strictEqual(bundle.participations.length, 1);
    assert.strictEqual(bundle.participations[0].edition.name, "E");
    assert.strictEqual(bundle.registrations.length, 1);
    assert.strictEqual(bundle.orders.length, 1);
    assert.strictEqual(bundle.consents.length, 1);
    assert.ok(bundle.exportedAt);

    const csv = dsarToCsv(bundle);
    assert.ok(csv.includes("bolum,id,ozet,olusturma"));
    assert.ok(csv.includes("katilim,") && csv.includes("kayit,") && csv.includes("riza,"));
    assert.ok(csv.includes("# kisi: Ayşe Yılmaz <ayse@ornek.net>"));

    await assert.rejects(() => buildDsarBundle(ctx.iso.prisma, { tenantId: ctx.tenant.id, personId: "yok" }), (e) => e instanceof DsarError && e.status === 404);
  } finally {
    await ctx.iso.cleanup();
  }
});

test("P18.4 - silme işi: kuru-çalıştırma + bekletme + tombstone + rıza çekme", async () => {
  const { previewErasure, executeErasure, detectLegalHolds, ErasureJobError } = await import(pathToFileURL(eraPath).href);
  const ctx = await setup("erasure");
  try {
    const part = await ctx.iso.prisma.eventParticipation.create({ data: { editionId: ctx.edition.id, personId: ctx.person.id } });
    await ctx.iso.prisma.registration.create({ data: { editionId: ctx.edition.id, participationId: part.id, status: "CONFIRMED" } });
    await ctx.iso.prisma.contactConsent.create({ data: { tenantId: ctx.tenant.id, channel: "EMAIL", address: "ayse@ornek.net", purpose: "COMMERCIAL", status: "GRANTED" } });
    const req = await ctx.iso.prisma.kvkkErasureRequest.create({
      data: { tenantId: ctx.tenant.id, email: "ayse@ornek.net", personId: ctx.person.id, status: "VERIFIED", dueAt: new Date(Date.now() + 86400000) },
    });

    // Bekletmeli durum: ödenmemiş sipariş yürütmeyi durdurur.
    const order = await ctx.iso.prisma.order.create({ data: { editionId: ctx.edition.id, buyerPersonId: ctx.person.id, status: "OPEN", totalAmount: 100 } });
    const preview = await previewErasure(ctx.iso.prisma, { tenantId: ctx.tenant.id, personId: ctx.person.id });
    assert.strictEqual(preview.executable, false);
    assert.strictEqual(preview.holds[0].kind, "UNPAID_ORDER");
    assert.strictEqual(preview.preservedCounts.participations, 1);
    assert.strictEqual(preview.preservedCounts.consents, 1);
    await assert.rejects(() => executeErasure(ctx.iso.prisma, { tenantId: ctx.tenant.id, requestId: req.id }), (e) => e instanceof ErasureJobError && e.status === 409);

    // Ödeme kapanınca yürütme tamamlanır.
    await ctx.iso.prisma.order.update({ where: { id: order.id }, data: { status: "PAID" } });
    assert.deepStrictEqual(await detectLegalHolds(ctx.iso.prisma, { tenantId: ctx.tenant.id, personId: ctx.person.id }), []);
    const done = await executeErasure(ctx.iso.prisma, { tenantId: ctx.tenant.id, requestId: req.id, handledBy: "kvkk-1" });
    assert.strictEqual(done.personId, ctx.person.id);

    const anon = await ctx.iso.prisma.person.findUnique({ where: { id: ctx.person.id } });
    assert.strictEqual(anon.firstName, "Silinmiş");
    assert.strictEqual(anon.email, null);
    assert.strictEqual(anon.phone, null);
    // Geçmiş korunur (referans bütünlüğü).
    assert.strictEqual(await ctx.iso.prisma.eventParticipation.count({ where: { personId: ctx.person.id } }), 1);
    assert.strictEqual(await ctx.iso.prisma.registration.count({ where: { participation: { personId: ctx.person.id } } }), 1);
    // Rıza geri çekildi + İYS kuyruğuna düştü.
    const consent = await ctx.iso.prisma.contactConsent.findFirst({ where: { tenantId: ctx.tenant.id } });
    assert.strictEqual(consent.status, "WITHDRAWN");
    assert.match(consent.proof, /^erasure:/);
    assert.strictEqual(await ctx.iso.prisma.iysOutbox.count({ where: { tenantId: ctx.tenant.id, action: "WITHDRAW" } }), 1);
    const completed = await ctx.iso.prisma.kvkkErasureRequest.findUnique({ where: { id: req.id } });
    assert.strictEqual(completed.status, "COMPLETED");
  } finally {
    await ctx.iso.cleanup();
  }
});

test("P18.5 - tatbikat: bütünlük + sayım + bütçe içinde RTO", async () => {
  const { runRestoreDrill } = await import(pathToFileURL(drillPath).href);
  const ctx = await setup("drill");
  try {
    await ctx.iso.prisma.eventParticipation.create({ data: { editionId: ctx.edition.id, personId: ctx.person.id } });
    const report = await runRestoreDrill(ctx.iso.dbPath);
    assert.strictEqual(report.ok, true, report.error ?? "tatbikat geçmeli");
    assert.strictEqual(report.integrity, "ok");
    assert.ok(report.tables >= 10);
    assert.strictEqual(report.rows.person, 1);
    assert.strictEqual(report.rows.eventParticipation, 1);
    assert.strictEqual(report.withinBudget, true, `RTO ${report.rtoMs}ms bütçede olmalı`);
    assert.ok(report.backupAgeSec >= 0);
    assert.ok(report.sourceBytes > 0);

    const missing = await runRestoreDrill("/yok/olmayan.db");
    assert.strictEqual(missing.ok, false);
    assert.ok(missing.error);
  } finally {
    await ctx.iso.cleanup();
  }
});

test("P18 - kablo: arşiv/DSAR/silme uçları + tatbikat betiği", async () => {
  const arch = fs.readFileSync(path.resolve("src/app/api/editions/[id]/archive/route.ts"), "utf8");
  assert.ok(arch.includes("requireAdmin") && arch.includes("archiveEdition") && arch.includes("dryRun"));
  const dsar = fs.readFileSync(path.resolve("src/app/api/kvkk/dsar/route.ts"), "utf8");
  assert.ok(dsar.includes("requireStaff") && dsar.includes("buildDsarBundle") && dsar.includes("no-store") && dsar.includes("DSAR dışa aktarımı"));
  const era = fs.readFileSync(path.resolve("src/app/api/kvkk/erasure/route.ts"), "utf8");
  assert.ok(era.includes("previewErasure") && era.includes("executeErasure") && era.includes("detectLegalHolds"));
  const drill = fs.readFileSync(path.resolve("scripts/restore-drill.mjs"), "utf8");
  assert.ok(drill.includes("runRestoreDrill") && drill.includes("artifacts/evidence/restore-drill"));
  const pkg = JSON.parse(fs.readFileSync(path.resolve("package.json"), "utf8"));
  assert.ok(pkg.scripts["drill:restore"], "drill:restore betiği kayıtlı olmalı");
});
