import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createIsolatedTestDb } from "../tests/support/test-db.mjs";

const queuePath = path.resolve("src/lib/media/job-queue.ts");
const workerPath = path.resolve("src/lib/media/worker.ts");

async function setup(tag) {
  const iso = await createIsolatedTestDb(`p14-3-${tag}`);
  const uniq = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const tenant = await iso.prisma.tenant.create({ data: { name: "T", slug: `t-p143-${tag}-${uniq}` } });
  const edition = await iso.prisma.eventEdition.create({ data: { tenantId: tenant.id, name: "E", slug: `e-p143-${tag}-${uniq}` } });
  const storeDir = fs.mkdtempSync(path.join(os.tmpdir(), `maven-media-${tag}-`));
  return { iso, tenant, edition, storeDir };
}

async function teardown(ctx) {
  await ctx.iso.cleanup();
  fs.rmSync(ctx.storeDir, { recursive: true, force: true });
}

test("P14.3 - enqueue: idempotent anahtar + kiracı kotası", async () => {
  const { enqueueMediaJob, MediaJobError } = await import(pathToFileURL(queuePath).href);
  const ctx = await setup("quota");
  try {
    const first = await enqueueMediaJob(ctx.iso.prisma, {
      tenantId: ctx.tenant.id, editionId: ctx.edition.id, idempotencyKey: "anahtar-1", createdBy: "staff-1",
    });
    assert.strictEqual(first.job.status, "QUEUED");
    assert.strictEqual(first.deduped, false);
    assert.ok(first.job.expiresAt.getTime() > Date.now());

    const again = await enqueueMediaJob(ctx.iso.prisma, {
      tenantId: ctx.tenant.id, editionId: ctx.edition.id, idempotencyKey: "anahtar-1", createdBy: "staff-1",
    });
    assert.strictEqual(again.deduped, true);
    assert.strictEqual(again.job.id, first.job.id);

    // Kota: 3 aktif dolunca 4. talep 429 yer.
    await enqueueMediaJob(ctx.iso.prisma, { tenantId: ctx.tenant.id, editionId: ctx.edition.id, idempotencyKey: "k-2" });
    await enqueueMediaJob(ctx.iso.prisma, { tenantId: ctx.tenant.id, editionId: ctx.edition.id, idempotencyKey: "k-3" });
    await assert.rejects(
      () => enqueueMediaJob(ctx.iso.prisma, { tenantId: ctx.tenant.id, editionId: ctx.edition.id, idempotencyKey: "k-4" }),
      (e) => e instanceof MediaJobError && e.status === 429,
    );
    // Komşu kiracı kendi kotasından etkilenmez.
    const tenant2 = await ctx.iso.prisma.tenant.create({ data: { name: "T2", slug: `t-p143-q2-${Date.now()}` } });
    const other = await enqueueMediaJob(ctx.iso.prisma, { tenantId: tenant2.id, editionId: ctx.edition.id, idempotencyKey: "k-4" });
    assert.strictEqual(other.deduped, false);
  } finally {
    await teardown(ctx);
  }
});

test("P14.3 - worker mutlu yol: indir/tara/sakla + ilerleme + bildirim", async () => {
  const { processOneMediaJob } = await import(pathToFileURL(workerPath).href);
  const { enqueueMediaJob } = await import(pathToFileURL(queuePath).href);
  const ctx = await setup("happy");
  try {
    await ctx.iso.prisma.mediaAsset.createMany({
      data: [
        { editionId: ctx.edition.id, name: "gomulu.png", kind: "IMAGE", dataUrl: "data:image/png;base64,aGk=" },
        { editionId: ctx.edition.id, name: "uzak.jpg", kind: "IMAGE", externalUrl: "https://cdn.ornek.net/u.jpg" },
        { editionId: ctx.edition.id, name: "supheli.html", kind: "DOCUMENT", externalUrl: "https://cdn.ornek.net/x.html" },
      ],
    });
    const { job } = await enqueueMediaJob(ctx.iso.prisma, { tenantId: ctx.tenant.id, editionId: ctx.edition.id });
    const seen = [];
    const out = await processOneMediaJob(ctx.iso.prisma, {
      storeDir: ctx.storeDir,
      fetchOne: async (url) => {
        seen.push(url);
        if (url.endsWith(".html")) return { bytes: Buffer.from("<html>"), contentType: "text/html" };
        return { bytes: Buffer.from("JPEGDATA"), contentType: "image/jpeg" };
      },
    });
    assert.deepStrictEqual({ claimed: out.claimed, status: out.status }, { claimed: true, status: "SUCCEEDED" });

    const done = await ctx.iso.prisma.mediaExportJob.findUnique({ where: { id: job.id } });
    assert.strictEqual(done.status, "SUCCEEDED");
    assert.strictEqual(done.attempts, 1);
    assert.ok(done.artifactDir && done.artifactDir.startsWith(ctx.storeDir));
    const progress = JSON.parse(done.progressJson);
    assert.strictEqual(progress.total, 3);
    assert.strictEqual(progress.done, 3);
    const result = JSON.parse(done.resultJson);
    assert.strictEqual(result.stored, 2, "gömülü + uzak saklanmalı");
    assert.strictEqual(result.skipped, 1, "HTML taramada elenmeli");
    assert.ok(result.manifestSha256);

    const files = fs.readdirSync(done.artifactDir);
    assert.ok(files.includes("manifest.json"));
    assert.strictEqual(files.filter((f) => f !== "manifest.json").length, 2);
    const manifest = JSON.parse(fs.readFileSync(path.join(done.artifactDir, "manifest.json"), "utf8"));
    assert.strictEqual(manifest.assets.length, 3);
    assert.ok(manifest.assets.find((a) => a.name === "supheli.html" && a.file === null && /tarama|MIME/.test(a.note)));
    // Boş kuyruk ikinci çağrıda iş vermez.
    const idle = await processOneMediaJob(ctx.iso.prisma, { storeDir: ctx.storeDir });
    assert.strictEqual(idle.claimed, false);
  } finally {
    await teardown(ctx);
  }
});

test("P14.3 - crash-resume: kirası dolan RUNNING iş yeniden sahiplenilir", async () => {
  const { processOneMediaJob } = await import(pathToFileURL(workerPath).href);
  const { enqueueMediaJob, claimNextMediaJob } = await import(pathToFileURL(queuePath).href);
  const ctx = await setup("resume");
  try {
    await ctx.iso.prisma.mediaAsset.create({ data: { editionId: ctx.edition.id, name: "a.png", kind: "IMAGE", dataUrl: "data:image/png;base64,aGk=" } });
    const { job } = await enqueueMediaJob(ctx.iso.prisma, { tenantId: ctx.tenant.id, editionId: ctx.edition.id });
    const claimed = await claimNextMediaJob(ctx.iso.prisma);
    assert.strictEqual(claimed.id, job.id);
    assert.strictEqual(claimed.attempts, 1);
    // Crash simülasyonu: kira geçmişte kaldı, iş RUNNING asılı.
    await ctx.iso.prisma.mediaExportJob.update({ where: { id: job.id }, data: { leaseUntil: new Date(Date.now() - 60_000) } });

    const out = await processOneMediaJob(ctx.iso.prisma, { storeDir: ctx.storeDir });
    assert.strictEqual(out.status, "SUCCEEDED");
    const done = await ctx.iso.prisma.mediaExportJob.findUnique({ where: { id: job.id } });
    assert.strictEqual(done.attempts, 2, "resume ikinci deneme sayılmalı");
  } finally {
    await teardown(ctx);
  }
});

test("P14.3 - retry tükenince dead-letter; retryable-olmayan FAILED olur", async () => {
  const { processOneMediaJob } = await import(pathToFileURL(workerPath).href);
  const { enqueueMediaJob, failMediaJob, claimNextMediaJob } = await import(pathToFileURL(queuePath).href);
  const ctx = await setup("dead");
  try {
    // İş-seviyesi arıza: yazılamaz artefakt kökü → 3 deneme → DEAD.
    const { job } = await enqueueMediaJob(ctx.iso.prisma, { tenantId: ctx.tenant.id, editionId: ctx.edition.id, maxAttempts: 3 });
    const badRoot = path.join(ctx.storeDir, "kok");
    fs.writeFileSync(badRoot, "dosya"); // dizin değil — mkdirSync patlar
    for (let i = 0; i < 3; i++) {
      const out = await processOneMediaJob(ctx.iso.prisma, { storeDir: path.join(badRoot, "alt") });
      assert.strictEqual(out.jobId, job.id);
    }
    const dead = await ctx.iso.prisma.mediaExportJob.findUnique({ where: { id: job.id } });
    assert.strictEqual(dead.status, "DEAD");
    assert.strictEqual(dead.attempts, 3);
    assert.ok(dead.error);

    // Ölü iş bir daha sahiplenilmez.
    const none = await claimNextMediaJob(ctx.iso.prisma);
    assert.strictEqual(none, null);

    // Doğrudan fail: retryable-olmayan → FAILED.
    const { job: j2 } = await enqueueMediaJob(ctx.iso.prisma, { tenantId: ctx.tenant.id, editionId: ctx.edition.id });
    await claimNextMediaJob(ctx.iso.prisma);
    const failed = await failMediaJob(ctx.iso.prisma, j2.id, { error: "kötü girdi", retryable: false });
    assert.strictEqual(failed.status, "FAILED");
  } finally {
    await teardown(ctx);
  }
});

test("P14.3 - iptal: kuyruktaki ve koşan iş durur; kararlı iş iptal edilemez", async () => {
  const { processOneMediaJob } = await import(pathToFileURL(workerPath).href);
  const { enqueueMediaJob, cancelMediaJob, claimNextMediaJob, MediaJobError } = await import(pathToFileURL(queuePath).href);
  const ctx = await setup("cancel");
  try {
    const { job } = await enqueueMediaJob(ctx.iso.prisma, { tenantId: ctx.tenant.id, editionId: ctx.edition.id });
    const cancelled = await cancelMediaJob(ctx.iso.prisma, job.id, ctx.tenant.id);
    assert.strictEqual(cancelled.status, "CANCELLED");
    const idle = await processOneMediaJob(ctx.iso.prisma, { storeDir: ctx.storeDir });
    assert.strictEqual(idle.claimed, false, "iptal edilen iş alınmamalı");
    await assert.rejects(() => cancelMediaJob(ctx.iso.prisma, job.id, ctx.tenant.id), (e) => e instanceof MediaJobError && e.status === 409);

    // Koşu ortasında iptal: worker dışarıdan gelen iptali görüp durur.
    await ctx.iso.prisma.mediaAsset.createMany({
      data: [
        { editionId: ctx.edition.id, name: "bir.png", kind: "IMAGE", externalUrl: "https://cdn.ornek.net/bir.png" },
        { editionId: ctx.edition.id, name: "iki.png", kind: "IMAGE", dataUrl: "data:image/png;base64,aGk=" },
      ],
    });
    const { job: j2 } = await enqueueMediaJob(ctx.iso.prisma, { tenantId: ctx.tenant.id, editionId: ctx.edition.id });
    const out = await processOneMediaJob(ctx.iso.prisma, {
      storeDir: ctx.storeDir,
      fetchOne: async (url) => {
        await cancelMediaJob(ctx.iso.prisma, j2.id, ctx.tenant.id);
        return { bytes: Buffer.from("x"), contentType: "image/png" };
      },
    });
    void claimNextMediaJob;
    assert.strictEqual(out.status, "CANCELLED");
    const after = await ctx.iso.prisma.mediaExportJob.findUnique({ where: { id: j2.id } });
    assert.strictEqual(after.status, "CANCELLED");
  } finally {
    await teardown(ctx);
  }
});

test("P14.3 - nabız + ilerleme birleşimi ve durum bekçileri", async () => {
  const { enqueueMediaJob, claimNextMediaJob, heartbeatMediaJob, recordMediaProgress, completeMediaJob, MediaJobError } =
    await import(pathToFileURL(queuePath).href);
  const ctx = await setup("beat");
  try {
    const { job } = await enqueueMediaJob(ctx.iso.prisma, { tenantId: ctx.tenant.id, editionId: ctx.edition.id });
    await assert.rejects(() => heartbeatMediaJob(ctx.iso.prisma, job.id), (e) => e instanceof MediaJobError && e.status === 409);
    const running = await claimNextMediaJob(ctx.iso.prisma);
    const beat = await heartbeatMediaJob(ctx.iso.prisma, job.id, 120_000);
    assert.ok(beat.leaseUntil.getTime() > running.leaseUntil.getTime());

    await recordMediaProgress(ctx.iso.prisma, job.id, { total: 10, done: 4 });
    await recordMediaProgress(ctx.iso.prisma, job.id, { done: 7 });
    const mid = await ctx.iso.prisma.mediaExportJob.findUnique({ where: { id: job.id } });
    const merged = JSON.parse(mid.progressJson);
    assert.strictEqual(merged.total, 10);
    assert.strictEqual(merged.done, 7);
    assert.ok(merged.updatedAt);

    const done = await completeMediaJob(ctx.iso.prisma, job.id, { result: { stored: 1 }, includeDownloadToken: true });
    assert.strictEqual(done.job.status, "SUCCEEDED");
    assert.ok(done.downloadToken && done.downloadToken.length > 40);
    assert.ok(done.job.fileTokenHash && done.job.fileTokenHash.length === 64);
    await assert.rejects(() => recordMediaProgress(ctx.iso.prisma, job.id, { done: 9 }), (e) => e instanceof MediaJobError && e.status === 409);
  } finally {
    await teardown(ctx);
  }
});

test("P14.3 - rota kablosu: 202 + Idempotency-Key + durum/iptal uçları", async () => {
  const post = fs.readFileSync(path.resolve("src/app/api/media/export-jobs/route.ts"), "utf8");
  assert.ok(post.includes("enqueueMediaJob"), "POST kuyruğu kullanmalı");
  assert.ok(post.includes("idempotency-key"), "Idempotency-Key başlığı okunmalı");
  assert.ok(post.includes("202"), "202 ile yanıtlanmalı");
  assert.ok(post.includes("requireStaff"), "kadro kapısı şart");
  assert.ok(post.includes("verifyEditionTenant"), "edisyon kiracı doğrulaması şart");
  assert.ok(post.includes("MediaJobError"), "kota/validasyon hataları taşınmalı");

  const item = fs.readFileSync(path.resolve("src/app/api/media/export-jobs/[id]/route.ts"), "utf8");
  assert.ok(item.includes("getMediaJob"), "GET durumu okumalı");
  assert.ok(item.includes("cancelMediaJob"), "DELETE iptal etmeli");
  assert.ok(item.includes("downloadReady"), "GET indirme hazırlığını bildirmeli");
});
