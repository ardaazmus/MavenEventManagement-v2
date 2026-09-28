// ─── P14.4: Medya ihracat işi — indirme ve güvenilir paket ────────────────────
// Sözleşme: YALNIZ trusted objects paketlenir — artefakt dizinindeki manifest
// listedeki dosyalar, sha256 doğrulanarak; listede olmayan ya da hash'i
// tutmayan dosya pakete girmez. İndirme imzalı + süreli jetonla açılır; ham
// jeton yalnız veriliş yanıtında bir kez döner. Süresi dolan iş EXPIRED olur,
// artefaktı temizlenir.
// NOT: `@/` takma adı YOK — node --test (tip-sıyırma) uyumu için bağımsız.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import JSZip from "jszip";
import { hashDownloadToken, mintDownloadToken, parseDownloadToken } from "../exports/jobs.ts";
import { safeEntryName } from "./archive.ts";
import { MediaJobError, MEDIA_JOB_TOKEN_TTL_MS, type MediaJobPrisma } from "./job-queue.ts";

export interface DownloadPrisma extends MediaJobPrisma {
  mediaExportDownload: {
    create: (args: { data: Record<string, unknown> }) => Promise<unknown>;
  };
}

export interface IssueTokenInput {
  jobId: string;
  tenantId: string;
  ttlMs?: number;
  now?: Date;
}

export async function issueMediaDownloadToken(
  prisma: DownloadPrisma,
  input: IssueTokenInput,
): Promise<{ token: string; expiresAt: Date }> {
  const now = input.now ?? new Date();
  const job = await prisma.mediaExportJob.findUnique({ where: { id: input.jobId } });
  if (!job || job.tenantId !== input.tenantId) throw new MediaJobError("İş bulunamadı", 404);
  if (job.status !== "SUCCEEDED") throw new MediaJobError(`Yalnız tamamlanan iş indirilir (${job.status})`, 409);
  if (!job.artifactDir) throw new MediaJobError("İş artefaktı yok", 410);
  if (job.expiresAt && job.expiresAt.getTime() <= now.getTime()) {
    throw new MediaJobError("İşin süresi doldu", 410);
  }
  const minted = mintDownloadToken(job.id, input.ttlMs ?? MEDIA_JOB_TOKEN_TTL_MS);
  await prisma.mediaExportJob.update({
    where: { id: job.id },
    data: { fileTokenHash: hashDownloadToken(minted.token), tokenExpiresAt: minted.expiresAt },
  });
  return { token: minted.token, expiresAt: minted.expiresAt };
}

export type VerifyMediaDownloadResult =
  | { ok: true; jobId: string; tenantId: string; editionId: string; artifactDir: string }
  | { ok: false; error: string; status: number };

export async function verifyMediaDownloadToken(
  prisma: DownloadPrisma,
  jobId: string,
  token: string,
  now: Date = new Date(),
): Promise<VerifyMediaDownloadResult> {
  const parsed = parseDownloadToken(token);
  if (!parsed || parsed.jobId !== jobId) return { ok: false, error: "Geçersiz jeton", status: 401 };
  if (parsed.exp <= now.getTime()) return { ok: false, error: "Jetonun süresi doldu", status: 401 };
  const job = await prisma.mediaExportJob.findUnique({ where: { id: jobId } });
  if (!job || job.status !== "SUCCEEDED") return { ok: false, error: "İş indirilebilir durumda değil", status: 404 };
  if (!job.fileTokenHash || !job.tokenExpiresAt || job.tokenExpiresAt.getTime() <= now.getTime()) {
    return { ok: false, error: "Jetonun süresi doldu", status: 401 };
  }
  if (job.expiresAt && job.expiresAt.getTime() <= now.getTime()) {
    return { ok: false, error: "İşin süresi doldu", status: 410 };
  }
  if (!job.artifactDir) return { ok: false, error: "İş artefaktı yok", status: 410 };
  const presented = Buffer.from(hashDownloadToken(token));
  const stored = Buffer.from(job.fileTokenHash);
  if (presented.length !== stored.length || !crypto.timingSafeEqual(presented, stored)) {
    return { ok: false, error: "Geçersiz jeton", status: 401 };
  }
  return { ok: true, jobId: job.id, tenantId: job.tenantId, editionId: job.editionId, artifactDir: job.artifactDir };
}

export async function recordMediaDownload(
  prisma: DownloadPrisma,
  input: { jobId: string; actorName?: string | null },
): Promise<void> {
  await prisma.mediaExportDownload.create({ data: { jobId: input.jobId, actorName: input.actorName ?? null } });
}

export interface TrustedZipResult {
  buffer: Buffer;
  included: number;
  excluded: Array<{ file: string; reason: string }>;
  manifestAssets: number;
}

interface ManifestEntry {
  assetId?: string;
  name?: string;
  file?: string | null;
  bytes?: number;
  sha256?: string | null;
}

export async function buildTrustedZip(artifactDir: string): Promise<TrustedZipResult> {
  const manifestPath = path.join(artifactDir, "manifest.json");
  if (!fs.existsSync(manifestPath)) {
    throw new MediaJobError("Güvenilir manifest yok — paket kurulamaz", 410);
  }
  let manifest: { jobId?: string; assets?: ManifestEntry[] };
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as { jobId?: string; assets?: ManifestEntry[] };
  } catch {
    throw new MediaJobError("Manifest bozuk — paket kurulamaz", 410);
  }
  const entries = Array.isArray(manifest.assets) ? manifest.assets : [];
  const zip = new JSZip();
  const rootDir = zip.folder("Medya")!;
  const excluded: Array<{ file: string; reason: string }> = [];
  let included = 0;

  for (const entry of entries) {
    const file = typeof entry.file === "string" ? entry.file : null;
    const label = file ?? String(entry.name ?? entry.assetId ?? "bilinmeyen");
    if (!file) {
      excluded.push({ file: label, reason: entry && "note" in entry ? String((entry as Record<string, unknown>).note ?? "atlandı") : "atlandı" });
      continue;
    }
    // Path-traversal kalkanı: manifest dışına çıkılamaz.
    const resolved = path.resolve(artifactDir, file);
    if (resolved !== path.join(artifactDir, path.basename(file)) || !resolved.startsWith(path.resolve(artifactDir))) {
      excluded.push({ file: label, reason: "güvensiz yol" });
      continue;
    }
    if (!fs.existsSync(resolved)) {
      excluded.push({ file: label, reason: "dosya yok" });
      continue;
    }
    const bytes = fs.readFileSync(resolved);
    if (typeof entry.bytes === "number" && bytes.byteLength !== entry.bytes) {
      excluded.push({ file: label, reason: "boyut uyuşmazlığı" });
      continue;
    }
    if (typeof entry.sha256 === "string") {
      const actual = crypto.createHash("sha256").update(bytes).digest("hex");
      if (actual !== entry.sha256.toLowerCase()) {
        excluded.push({ file: label, reason: "hash uyuşmazlığı" });
        continue;
      }
    }
    rootDir.file(safeEntryName(String(entry.name ?? file)), bytes);
    included++;
  }

  rootDir.file(
    "manifest.json",
    JSON.stringify({ ...manifest, packagedAt: new Date().toISOString(), included, excluded }, null, 2),
  );
  const buffer = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
  return { buffer, included, excluded, manifestAssets: entries.length };
}

export async function purgeExpiredMediaArtifacts(
  prisma: DownloadPrisma,
  opts: { storeDir?: string } = {},
): Promise<{ jobs: number; dirsRemoved: number }> {
  const expired = (await prisma.mediaExportJob.findMany({
    where: { status: "EXPIRED" },
    select: { id: true, artifactDir: true },
  })) as Array<{ id: string; artifactDir: string | null }>;
  let dirsRemoved = 0;
  for (const row of expired) {
    if (row.artifactDir) {
      const dir = row.artifactDir;
      const allowRoot = opts.storeDir ? path.resolve(opts.storeDir) : null;
      // Silme yalnız beklenen kök altındaysa yapılır (yanlış dizin kalkanı).
      if (!allowRoot || path.resolve(dir).startsWith(allowRoot)) {
        fs.rmSync(dir, { recursive: true, force: true });
        dirsRemoved++;
      }
      await prisma.mediaExportJob.update({ where: { id: row.id }, data: { artifactDir: null } });
    }
  }
  return { jobs: expired.length, dirsRemoved };
}
