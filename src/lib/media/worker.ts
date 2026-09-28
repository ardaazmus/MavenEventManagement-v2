// ─── P14.3: Medya işçi (worker) — indir/tara/sakla ────────────────────────────
// Akış: claim → edisyon medyalarını oku → dış URL'leri P14.2 doğrulayıcıyla
// indir → tara (MIME allowlist + boyut + sha256) → artefakt dizinine yaz +
// manifest.json → complete (imzalı jeton P14.4). dataUrl gömülüler doğrudan
// yazılır (DB güvenilir kaynaktır). İptal her varlıkta denetlenir.
// NOT: `@/` takma adı YOK — node --test (tip-sıyırma) uyumu için bağımsız.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fetchValidated, type DnsLookup } from "./ingestion.ts";
import { safeEntryName } from "./archive.ts";
import {
  cancelMediaJob,
  claimNextMediaJob,
  completeMediaJob,
  failMediaJob,
  getMediaJob,
  heartbeatMediaJob,
  recordMediaProgress,
  MediaJobError,
  type MediaJobPrisma,
} from "./job-queue.ts";

export const WORKER_SCAN_MAX_BYTES = 25 * 1024 * 1024;
const SCAN_ALLOWED_MIME_PREFIXES = ["image/", "video/", "audio/", "application/pdf", "application/zip", "application/x-zip"];
const SCAN_ALLOWED_MIME_EXACT = new Set(["application/octet-stream"]);

export interface WorkerMediaAsset {
  id: string;
  name: string;
  kind: string;
  mimeType: string | null;
  dataUrl: string | null;
  externalUrl: string | null;
  folderId: string | null;
}

export interface WorkerPrisma extends MediaJobPrisma {
  mediaAsset: {
    findMany: (args: { where: Record<string, unknown>; orderBy?: unknown }) => Promise<WorkerMediaAsset[]>;
  };
}

export type WorkerFetch = (url: string) => Promise<{ bytes: Buffer; contentType: string }>;

export interface WorkerDeps {
  fetchOne?: WorkerFetch;
  dnsLookup?: DnsLookup;
  storeDir?: string;
  maxBytes?: number;
  now?: () => number;
}

export interface WorkerOutcome {
  claimed: boolean;
  jobId?: string;
  status?: string;
}

function defaultStoreDir(): string {
  return process.env.MEDIA_EXPORT_STORE ?? path.join(process.cwd(), "db", "media-exports");
}

function scanObject(contentType: string, bytes: Buffer, maxBytes: number): { ok: true } | { ok: false; reason: string } {
  const type = contentType.toLowerCase().split(";")[0].trim();
  if (bytes.byteLength > maxBytes) return { ok: false, reason: `boyut ${bytes.byteLength} > ${maxBytes}` };
  const allowed = SCAN_ALLOWED_MIME_EXACT.has(type) || SCAN_ALLOWED_MIME_PREFIXES.some((p) => type.startsWith(p));
  if (!allowed) return { ok: false, reason: `MIME taramada elendi: ${type}` };
  return { ok: true };
}

export async function processOneMediaJob(prisma: WorkerPrisma, deps: WorkerDeps = {}): Promise<WorkerOutcome> {
  const job = await claimNextMediaJob(prisma);
  if (!job) return { claimed: false };
  const maxBytes = deps.maxBytes ?? WORKER_SCAN_MAX_BYTES;
  const fetchOne: WorkerFetch =
    deps.fetchOne ??
    (async (url: string) => {
      const got = await fetchValidated(url, { dnsLookup: deps.dnsLookup, maxBytes });
      return { bytes: got.bytes, contentType: got.contentType };
    });
  const storeRoot = deps.storeDir ?? defaultStoreDir();
  const artifactDir = path.join(storeRoot, job.id);

  const assets = await prisma.mediaAsset.findMany({
    where: { editionId: job.editionId },
    orderBy: [{ folderId: "asc" }, { name: "asc" }],
  });
  const manifest: Array<Record<string, unknown>> = [];
  let stored = 0;
  let skipped = 0;
  let totalBytes = 0;

  // Koşu-ortası iptal/karar değişimi: nabız/ilerleme 409 verirse zarif çık.
  const touch = async (patch?: Record<string, unknown>): Promise<boolean> => {
    try {
      await heartbeatMediaJob(prisma, job.id);
      if (patch) await recordMediaProgress(prisma, job.id, patch);
      return true;
    } catch (e) {
      if (e instanceof MediaJobError) return false;
      throw e;
    }
  };

  try {
    fs.mkdirSync(artifactDir, { recursive: true });
    if (!(await touch({ total: assets.length, done: 0, bytes: 0, phase: "download" }))) {
      const fresh = await getMediaJob(prisma, job.id, job.tenantId);
      return { claimed: true, jobId: job.id, status: fresh?.status ?? "UNKNOWN" };
    }
    for (const [index, a] of assets.entries()) {
      // İptal denetimi: her varlıkta taze durum.
      const fresh = await getMediaJob(prisma, job.id, job.tenantId);
      if (!fresh || fresh.status !== "RUNNING") {
        return { claimed: true, jobId: job.id, status: fresh?.status ?? "UNKNOWN" };
      }
      if (!(await touch())) {
        const latest = await getMediaJob(prisma, job.id, job.tenantId);
        return { claimed: true, jobId: job.id, status: latest?.status ?? "UNKNOWN" };
      }

      let bytes: Buffer | null = null;
      let contentType = (a.mimeType ?? "application/octet-stream").toLowerCase();
      let source: string = a.dataUrl ? "embedded" : a.externalUrl ? "external" : "none";
      let note: string | null = null;
      if (a.dataUrl && a.dataUrl.startsWith("data:")) {
        const comma = a.dataUrl.indexOf(",");
        const meta = a.dataUrl.slice(5, comma);
        if (meta.includes(";base64")) {
          bytes = Buffer.from(a.dataUrl.slice(comma + 1), "base64");
          const declared = meta.split(";")[0].trim();
          if (declared) contentType = declared.toLowerCase();
        } else {
          note = "base64 olmayan dataUrl atlandı";
        }
      } else if (a.externalUrl) {
        try {
          const got = await fetchOne(a.externalUrl);
          bytes = got.bytes;
          contentType = got.contentType;
        } catch (e) {
          note = e instanceof Error ? e.message : "indirme başarısız";
        }
      } else {
        note = "kaynak yok";
      }

      if (bytes) {
        const scan = scanObject(contentType, bytes, maxBytes);
        if (!scan.ok) {
          note = scan.reason;
          bytes = null;
        }
      }
      if (bytes) {
        const fileName = `${safeEntryName(a.name)}`;
        fs.writeFileSync(path.join(artifactDir, `${a.id}-${fileName}`), bytes);
        const sha256 = crypto.createHash("sha256").update(bytes).digest("hex");
        manifest.push({ assetId: a.id, name: a.name, file: `${a.id}-${fileName}`, bytes: bytes.byteLength, sha256, contentType, source });
        stored++;
        totalBytes += bytes.byteLength;
      } else {
        manifest.push({ assetId: a.id, name: a.name, file: null, bytes: 0, sha256: null, contentType, source, note });
        skipped++;
      }
      if (!(await touch({ total: assets.length, done: index + 1, bytes: totalBytes, phase: "download" }))) {
        const latest = await getMediaJob(prisma, job.id, job.tenantId);
        return { claimed: true, jobId: job.id, status: latest?.status ?? "UNKNOWN" };
      }
    }

    const manifestJson = JSON.stringify({ jobId: job.id, editionId: job.editionId, exportedAt: new Date().toISOString(), stored, skipped, totalBytes, assets: manifest }, null, 2);
    fs.writeFileSync(path.join(artifactDir, "manifest.json"), manifestJson);
    const completed = await completeMediaJob(prisma, job.id, {
      result: { stored, skipped, totalBytes, manifestSha256: crypto.createHash("sha256").update(manifestJson).digest("hex") },
      artifactDir,
    });
    return { claimed: true, jobId: job.id, status: completed.job.status };
  } catch (e) {
    if (e instanceof MediaJobError) {
      // Eşzamanlı durum değişimi (örn. dış iptal complete ile yarıştı) — fırlatma.
      const fresh = await getMediaJob(prisma, job.id, job.tenantId);
      return { claimed: true, jobId: job.id, status: fresh?.status ?? "UNKNOWN" };
    }
    const failed = await failMediaJob(prisma, job.id, { error: e instanceof Error ? e.message : "Worker çöktü", retryable: true });
    return { claimed: true, jobId: job.id, status: failed.status };
  }
}

export interface DrainOptions {
  maxJobs?: number;
  idleExit?: boolean;
}

export async function drainMediaJobs(prisma: WorkerPrisma, deps: WorkerDeps = {}, opts: DrainOptions = {}): Promise<WorkerOutcome[]> {
  const outcomes: WorkerOutcome[] = [];
  const maxJobs = opts.maxJobs ?? 25;
  for (let i = 0; i < maxJobs; i++) {
    const outcome = await processOneMediaJob(prisma, deps);
    outcomes.push(outcome);
    if (!outcome.claimed && opts.idleExit !== false) break;
  }
  return outcomes;
}

export { cancelMediaJob };
