import test from "node:test";
import assert from "node:assert/strict";
import { createIsolatedTestDb } from "../tests/support/test-db.mjs";
import { pathToFileURL } from "node:url";
import path from "node:path";

const libPath = path.resolve("src/lib/exports/jobs.ts");

async function setup() {
  const iso = await createIsolatedTestDb("p14-3a");
  const tag = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const tenant = await iso.prisma.tenant.create({ data: { name: "T", slug: `t-p143a-${tag}` } });
  const edition = await iso.prisma.eventEdition.create({ data: { tenantId: tenant.id, name: "E", slug: `e-p143a-${tag}` } });
  return { iso, tenant, edition };
}

test("P14.3a - küçük export otomatik READY + süreli jeton üretir", async () => {
  const { requestExport } = await import(pathToFileURL(libPath).href);
  const { iso, tenant, edition } = await setup();
  try {
    const job = await requestExport(iso.prisma, {
      tenantId: tenant.id,
      editionId: edition.id,
      type: "REGISTRATIONS",
      params: { status: "ALL", q: "", company: "", official: false },
      createdBy: "staff-1",
    });
    assert.strictEqual(job.status, "READY");
    assert.ok(job.token && job.token.length > 40, "indirme jetonu dönmeli");
    assert.ok(job.tokenExpiresAt.getTime() > Date.now());

    // Ham jeton saklanmaz — yalnız hash
    const stored = await iso.prisma.exportJob.findUnique({ where: { id: job.id } });
    assert.ok(stored.fileTokenHash && stored.fileTokenHash.length === 64);
    assert.ok(!JSON.stringify(stored).includes(job.token), "ham jeton saklanmamalı");
  } finally {
    await iso.cleanup();
  }
});

test("P14.3a - resmi/büyük export onay kuyruğuna düşer; karar akışı", async () => {
  const { requestExport, decideExport, ExportJobError } = await import(pathToFileURL(libPath).href);
  const { iso, tenant, edition } = await setup();
  try {
    const job = await requestExport(iso.prisma, {
      tenantId: tenant.id,
      editionId: edition.id,
      type: "REGISTRATIONS",
      params: { status: "ALL", q: "", company: "Acme", official: true },
      createdBy: "staff-1",
    });
    assert.strictEqual(job.status, "NEEDS_APPROVAL");
    assert.strictEqual(job.token, null, "onaysız jeton yok");

    // Red
    const rejected = await decideExport(iso.prisma, { jobId: job.id, tenantId: tenant.id, approve: false, decidedBy: "admin-1", actorIsAdmin: true });
    assert.strictEqual(rejected.status, "REJECTED");

    // Kararlı işe ikinci karar yasak
    await assert.rejects(
      () => decideExport(iso.prisma, { jobId: job.id, tenantId: tenant.id, approve: true, decidedBy: "admin-1", actorIsAdmin: true }),
      (e) => e instanceof ExportJobError,
    );

    // Yeni iş + onay → READY + jeton
    const job2 = await requestExport(iso.prisma, {
      tenantId: tenant.id,
      editionId: edition.id,
      type: "REGISTRATIONS",
      params: { status: "ALL", q: "", company: "", official: true },
      createdBy: "staff-1",
    });
    const approved = await decideExport(iso.prisma, { jobId: job2.id, tenantId: tenant.id, approve: true, decidedBy: "admin-1", actorIsAdmin: true });
    assert.strictEqual(approved.status, "READY");
    assert.ok(approved.token, "onay jeton üretmeli");

    // Admin olmayan karar veremez
    const job3 = await requestExport(iso.prisma, {
      tenantId: tenant.id,
      editionId: edition.id,
      type: "REGISTRATIONS",
      params: { status: "ALL", q: "", company: "", official: true },
      createdBy: "staff-1",
    });
    await assert.rejects(
      () => decideExport(iso.prisma, { jobId: job3.id, tenantId: tenant.id, approve: true, decidedBy: "staff-1", actorIsAdmin: false }),
      (e) => e instanceof ExportJobError && e.status === 403,
    );
  } finally {
    await iso.cleanup();
  }
});

test("P14.3a - jeton doğrulama: geçerli/bozuk/süresi-dolmuş/yanlış-iş (DB)", async () => {
  const { requestExport, verifyDownloadToken } = await import(pathToFileURL(libPath).href);
  const { iso, tenant, edition } = await setup();
  try {
    const job = await requestExport(iso.prisma, {
      tenantId: tenant.id,
      editionId: edition.id,
      type: "REGISTRATIONS",
      params: { status: "ALL", q: "", company: "", official: false },
      createdBy: "staff-1",
      tokenTtlMs: 60_000,
    });
    const ok = await verifyDownloadToken(iso.prisma, job.id, job.token);
    assert.strictEqual(ok.ok, true);
    assert.strictEqual(ok.job.tenantId, tenant.id);

    // Bozuk jeton
    const tampered = job.token.slice(0, -2) + (job.token.endsWith("AA") ? "BB" : "AA");
    assert.strictEqual((await verifyDownloadToken(iso.prisma, job.id, tampered)).ok, false);

    // Başka işin jetonu bu işte geçmez (izolasyon)
    const other = await requestExport(iso.prisma, {
      tenantId: tenant.id,
      editionId: edition.id,
      type: "REGISTRATIONS",
      params: { status: "ALL", q: "", company: "", official: false },
      createdBy: "staff-1",
    });
    assert.strictEqual((await verifyDownloadToken(iso.prisma, job.id, other.token)).ok, false);

    // Süresi dolmuş jeton
    const short = await requestExport(iso.prisma, {
      tenantId: tenant.id,
      editionId: edition.id,
      type: "REGISTRATIONS",
      params: { status: "ALL", q: "", company: "", official: false },
      createdBy: "staff-1",
      tokenTtlMs: -1000,
    });
    const expired = await verifyDownloadToken(iso.prisma, short.id, short.token);
    assert.strictEqual(expired.ok, false);
  } finally {
    await iso.cleanup();
  }
});

test("P14.3a - indirme kaydı + saklama temizliği (DB)", async () => {
  const { requestExport, recordDownload, purgeExpiredJobs } = await import(pathToFileURL(libPath).href);
  const { iso, tenant, edition } = await setup();
  try {
    const job = await requestExport(iso.prisma, {
      tenantId: tenant.id,
      editionId: edition.id,
      type: "REGISTRATIONS",
      params: { status: "ALL", q: "", company: "", official: false },
      createdBy: "staff-1",
      tokenTtlMs: -1000,
    });
    await recordDownload(iso.prisma, { jobId: job.id, actorName: "staff-1" });
    const logs = await iso.prisma.exportDownload.findMany({ where: { jobId: job.id } });
    assert.strictEqual(logs.length, 1);

    const purged = await purgeExpiredJobs(iso.prisma);
    assert.ok(purged >= 1);
    const after = await iso.prisma.exportJob.findUnique({ where: { id: job.id } });
    assert.strictEqual(after.status, "EXPIRED");
    assert.strictEqual(after.fileTokenHash, null, "süresi dolan jeton hash'i silinir");
  } finally {
    await iso.cleanup();
  }
});
