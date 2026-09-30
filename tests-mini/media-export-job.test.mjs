import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import JSZip from "jszip";
import { createIsolatedTestDb } from "../tests/support/test-db.mjs";

const queuePath = path.resolve("src/lib/media/job-queue.ts");
const workerPath = path.resolve("src/lib/media/worker.ts");
const dlPath = path.resolve("src/lib/media/downloads.ts");

async function setup(tag) {
  const iso = await createIsolatedTestDb(`p14-4-${tag}`);
  const uniq = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const tenant = await iso.prisma.tenant.create({ data: { name: "T", slug: `t-p144-${tag}-${uniq}` } });
  const edition = await iso.prisma.eventEdition.create({ data: { tenantId: tenant.id, name: "E", slug: `e-p144-${tag}-${uniq}` } });
  const storeDir = fs.mkdtempSync(path.join(os.tmpdir(), `maven-dl-${tag}-`));
  return { iso, tenant, edition, storeDir };
}

async function teardown(ctx) {
  await ctx.iso.cleanup();
  fs.rmSync(ctx.storeDir, { recursive: true, force: true });
}

async function succeededJob(ctx) {
  const { enqueueMediaJob } = await import(pathToFileURL(queuePath).href);
  const { processOneMediaJob } = await import(pathToFileURL(workerPath).href);
  await ctx.iso.prisma.mediaAsset.createMany({
    data: [
      { editionId: ctx.edition.id, name: "bir.png", kind: "IMAGE", dataUrl: "data:image/png;base64,aGk=" },
      { editionId: ctx.edition.id, name: "iki.jpg", kind: "IMAGE", externalUrl: "https://cdn.ornek.net/iki.jpg" },
    ],
  });
  const { job } = await enqueueMediaJob(ctx.iso.prisma, { tenantId: ctx.tenant.id, editionId: ctx.edition.id });
  const out = await processOneMediaJob(ctx.iso.prisma, {
    storeDir: ctx.storeDir,
    fetchOne: async () => ({ bytes: Buffer.from("JPEGDATA"), contentType: "image/jpeg" }),
  });
  assert.strictEqual(out.status, "SUCCEEDED");
  return ctx.iso.prisma.mediaExportJob.findUnique({ where: { id: job.id } });
}

test("P14.4 - jeton veriliş/doğrulama: kapsam + süre + hash-eşleşme", async () => {
  const { issueMediaDownloadToken, verifyMediaDownloadToken, recordMediaDownload } = await import(pathToFileURL(dlPath).href);
  const { MediaJobError } = await import(pathToFileURL(queuePath).href);
  const { enqueueMediaJob } = await import(pathToFileURL(queuePath).href);
  const ctx = await setup("token");
  try {
    const job = await succeededJob(ctx);
    const { token, expiresAt } = await issueMediaDownloadToken(ctx.iso.prisma, { jobId: job.id, tenantId: ctx.tenant.id });
    assert.ok(token.length > 40);
    assert.ok(expiresAt.getTime() > Date.now());

    // Ham jeton saklanmaz.
    const stored = await ctx.iso.prisma.mediaExportJob.findUnique({ where: { id: job.id } });
    assert.ok(stored.fileTokenHash && stored.fileTokenHash.length === 64);
    assert.ok(!JSON.stringify(stored).includes(token));

    const ok = await verifyMediaDownloadToken(ctx.iso.prisma, job.id, token);
    assert.strictEqual(ok.ok, true);
    assert.strictEqual(ok.artifactDir, job.artifactDir);

    // Kurcalanmış jeton reddedilir.
    const bad = await verifyMediaDownloadToken(ctx.iso.prisma, job.id, `${token.slice(0, -2)}xx`);
    assert.strictEqual(bad.ok, false);
    assert.strictEqual(bad.status, 401);

    // Süresi dolmuş jeton reddedilir.
    const short = await issueMediaDownloadToken(ctx.iso.prisma, { jobId: job.id, tenantId: ctx.tenant.id, ttlMs: 1 });
    await new Promise((r) => setTimeout(r, 5));
    const expired = await verifyMediaDownloadToken(ctx.iso.prisma, job.id, short.token);
    assert.strictEqual(expired.ok, false);

    // Yanlış kiracı jeton alamaz; kuyruktaki iş indirilemez.
    const tenant2 = await ctx.iso.prisma.tenant.create({ data: { name: "X", slug: `t-p144-x-${Date.now()}` } });
    await assert.rejects(() => issueMediaDownloadToken(ctx.iso.prisma, { jobId: job.id, tenantId: tenant2.id }), (e) => e instanceof MediaJobError && e.status === 404);
    const { job: queued } = await enqueueMediaJob(ctx.iso.prisma, { tenantId: ctx.tenant.id, editionId: ctx.edition.id });
    await assert.rejects(() => issueMediaDownloadToken(ctx.iso.prisma, { jobId: queued.id, tenantId: ctx.tenant.id }), (e) => e instanceof MediaJobError && e.status === 409);

    await recordMediaDownload(ctx.iso.prisma, { jobId: job.id, actorName: "token" });
    const count = await ctx.iso.prisma.mediaExportDownload.count({ where: { jobId: job.id } });
    assert.strictEqual(count, 1);
  } finally {
    await teardown(ctx);
  }
});

test("P14.4 - trusted paket: yalnız manifest-doğrulanmış nesneler girer", async () => {
  const { buildTrustedZip } = await import(pathToFileURL(dlPath).href);
  const ctx = await setup("trust");
  try {
    const job = await succeededJob(ctx);
    // Saldırılar: listede-olmayan dosya + hash'i bozulan dosya.
    fs.writeFileSync(path.join(job.artifactDir, "korsan.bin"), Buffer.from("KORSAN"));
    const manifestPath = path.join(job.artifactDir, "manifest.json");
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    const victim = manifest.assets.find((a) => a.file);
    assert.ok(victim, "kurban dosya bulunmalı");
    fs.writeFileSync(path.join(job.artifactDir, victim.file), Buffer.from("BOZULDU-BOYUT-FARKLI-UZUN"));

    const pack = await buildTrustedZip(job.artifactDir);
    assert.strictEqual(pack.manifestAssets, 2);
    assert.strictEqual(pack.included, 1, "yalnız sağlam dosya girmeli");
    assert.strictEqual(pack.excluded.length, 1);
    assert.match(pack.excluded[0].reason, /boyut|hash/);

    const zip = await JSZip.loadAsync(pack.buffer);
    const names = Object.keys(zip.files).filter((n) => !n.endsWith("/"));
    assert.ok(!names.some((n) => n.includes("korsan")), `korsan pakete girmemeli: ${names.join(",")}`);
    assert.strictEqual(names.filter((n) => n !== "Medya/manifest.json").length, 1);
  } finally {
    await teardown(ctx);
  }
});

test("P14.4 - süre sonu: EXPIRED + artefakt temizliği + indirme kapanır", async () => {
  const { purgeExpiredMediaJobs } = await import(pathToFileURL(queuePath).href);
  const { purgeExpiredMediaArtifacts, verifyMediaDownloadToken, issueMediaDownloadToken } = await import(pathToFileURL(dlPath).href);
  const { MediaJobError } = await import(pathToFileURL(queuePath).href);
  const ctx = await setup("expiry");
  try {
    const job = await succeededJob(ctx);
    const { token } = await issueMediaDownloadToken(ctx.iso.prisma, { jobId: job.id, tenantId: ctx.tenant.id });
    assert.strictEqual((await verifyMediaDownloadToken(ctx.iso.prisma, job.id, token)).ok, true);

    await ctx.iso.prisma.mediaExportJob.update({ where: { id: job.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    const marked = await purgeExpiredMediaJobs(ctx.iso.prisma);
    assert.strictEqual(marked.length, 1);
    assert.strictEqual(marked[0].status, "EXPIRED");
    assert.strictEqual(marked[0].fileTokenHash, null, "süre sonunda hash silinir");
    assert.strictEqual((await verifyMediaDownloadToken(ctx.iso.prisma, job.id, token)).ok, false, "süresi dolan iş indirilemez");

    assert.ok(fs.existsSync(job.artifactDir));
    const cleaned = await purgeExpiredMediaArtifacts(ctx.iso.prisma, { storeDir: ctx.storeDir });
    assert.deepStrictEqual(cleaned, { jobs: 1, dirsRemoved: 1 });
    assert.ok(!fs.existsSync(job.artifactDir));
    const after = await ctx.iso.prisma.mediaExportJob.findUnique({ where: { id: job.id } });
    assert.strictEqual(after.artifactDir, null);
    await assert.rejects(() => issueMediaDownloadToken(ctx.iso.prisma, { jobId: job.id, tenantId: ctx.tenant.id }), (e) => e instanceof MediaJobError);
  } finally {
    await teardown(ctx);
  }
});

test("P14.4 - bütçe: 1000 meta-veride süre/bellek sınırı içinde paket", async () => {
  const { enqueueMediaJob } = await import(pathToFileURL(queuePath).href);
  const { processOneMediaJob } = await import(pathToFileURL(workerPath).href);
  const { buildTrustedZip } = await import(pathToFileURL(dlPath).href);
  const ctx = await setup("budget");
  try {
    const rows = [];
    for (let i = 0; i < 1000; i++) {
      rows.push({ editionId: ctx.edition.id, name: `kare-${String(i).padStart(4, "0")}.png`, kind: "IMAGE", dataUrl: "data:image/png;base64,aGk=" });
    }
    await ctx.iso.prisma.mediaAsset.createMany({ data: rows });
    const { job } = await enqueueMediaJob(ctx.iso.prisma, { tenantId: ctx.tenant.id, editionId: ctx.edition.id });

    const memBefore = process.memoryUsage().heapUsed;
    const cpuBefore = process.cpuUsage();
    const started = Date.now();
    const out = await processOneMediaJob(ctx.iso.prisma, { storeDir: ctx.storeDir });
    const pack = await buildTrustedZip((await ctx.iso.prisma.mediaExportJob.findUnique({ where: { id: job.id } })).artifactDir);
    const elapsed = Date.now() - started;
    const cpu = process.cpuUsage(cpuBefore);
    const cpuMs = (cpu.user + cpu.system) / 1000;
    const memDeltaMb = (process.memoryUsage().heapUsed - memBefore) / 1024 / 1024;

    assert.strictEqual(out.status, "SUCCEEDED");
    assert.strictEqual(pack.included, 1000);
    assert.ok(pack.buffer.byteLength > 1000, "paket boş olmamalı");
    // Bütçe: BİRİNCİL kapı CPU süresi (paralel süit yükünden bağımsız; duvar-saati
    // eşzamanlı 20+ süreç altında 4 dakikaya şişip flake üretiyordu — 2026-09-30).
    assert.ok(cpuMs < 60_000, `1000 varlık CPU ${Math.round(cpuMs)}ms sürdü (<60sn CPU olmalı)`);
    // Duvar saati yalnız patolojik takılma (I/O kilitlenmesi) nöbeti için geniş payla:
    assert.ok(elapsed < 300_000, `duvar saati ${elapsed}ms (<300sn olmalı; yük payı)`);
    assert.ok(memDeltaMb < 512, `bellek artışı ${memDeltaMb.toFixed(1)}MB (<512MB olmalı)`);
  } finally {
    await teardown(ctx);
  }
});

test("P14.4 - rota kablosu: jeton ucu kadrolu, dosya ucu jeton-doğrulamalı", async () => {
  const tokenSrc = fs.readFileSync(path.resolve("src/app/api/media/export-jobs/[id]/token/route.ts"), "utf8");
  assert.ok(tokenSrc.includes("issueMediaDownloadToken"), "jeton ucu verilişi kullanmalı");
  assert.ok(tokenSrc.includes("requireStaff"), "jeton ucu kadro kapılı olmalı");
  assert.ok(tokenSrc.includes("resolveContext"), "jeton ucu kiracı kapsamalı olmalı");

  const fileSrc = fs.readFileSync(path.resolve("src/app/api/media/export-jobs/[id]/file/route.ts"), "utf8");
  assert.ok(fileSrc.includes("verifyMediaDownloadToken"), "dosya ucu jetonu doğrulamalı");
  assert.ok(fileSrc.includes("buildTrustedZip"), "dosya ucu güvenilir paketi kurmalı");
  assert.ok(fileSrc.includes("no-store"), "dosya ucu önbelleksiz olmalı");
  assert.ok(fileSrc.includes("recordMediaDownload"), "indirme kayda geçmeli");
  assert.ok(!fileSrc.includes("requireStaff"), "dosya ucunda kimlik jetonun kendisi olmalı");
  assert.ok(!fileSrc.match(/(^|[^A-Za-z])fetch\(/), "dosya ucu ağa çıkmamalı");
});
