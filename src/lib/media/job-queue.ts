// ─── P14.3: Medya asenkron iş kuyruğu ─────────────────────────────────────────
// Sözleşme: enqueue (idempotent + kiracı kotalı) → claimNext (kiralı sahiplenme)
// → heartbeat/recordProgress → complete | fail (retry) | DEAD (dead-letter) |
// cancel. Crash-resume: kirası dolan RUNNING iş, deneme hakkı varsa yeniden
// sahiplenilir. Tek-worker varsayımı: SQLite'ta SKIP LOCKED yok; üretimde
// çok-worker için Postgres'e geçişte `FOR UPDATE SKIP LOCKED` gerekir (P22 notu).
// NOT: `@/` takma adı YOK — node --test (tip-sıyırma) uyumu için bağımsız.
import { hashDownloadToken, mintDownloadToken } from "../exports/jobs.ts";

export const MEDIA_JOB_MAX_ATTEMPTS = 3;
export const MEDIA_JOB_LEASE_MS = 30_000;
export const MEDIA_JOB_TENANT_QUOTA = 3;
export const MEDIA_JOB_ARTIFACT_TTL_MS = 24 * 60 * 60 * 1000;
export const MEDIA_JOB_TOKEN_TTL_MS = 15 * 60 * 1000;

export const MEDIA_JOB_ACTIVE = ["QUEUED", "RUNNING"] as const;
export const MEDIA_JOB_TERMINAL = ["SUCCEEDED", "FAILED", "DEAD", "CANCELLED", "EXPIRED"] as const;

export class MediaJobError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = "MediaJobError";
    this.status = status;
  }
}

export interface MediaJobRow {
  id: string;
  tenantId: string;
  editionId: string;
  status: string;
  idempotencyKey: string | null;
  attempts: number;
  maxAttempts: number;
  leaseUntil: Date | null;
  progressJson: string;
  resultJson: string | null;
  error: string | null;
  artifactDir: string | null;
  fileTokenHash: string | null;
  tokenExpiresAt: Date | null;
  expiresAt: Date | null;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface MediaJobPrisma {
  mediaExportJob: {
    create: (args: { data: Record<string, unknown> }) => Promise<MediaJobRow>;
    findUnique: (args: { where: Record<string, unknown> }) => Promise<MediaJobRow | null>;
    findFirst: (args: { where: Record<string, unknown>; orderBy?: unknown }) => Promise<MediaJobRow | null>;
    findMany: (args: { where: Record<string, unknown>; orderBy?: unknown; select?: unknown }) => Promise<MediaJobRow[]>;
    count: (args: { where: Record<string, unknown> }) => Promise<number>;
    update: (args: { where: Record<string, unknown>; data: Record<string, unknown> }) => Promise<MediaJobRow>;
    updateMany: (args: { where: Record<string, unknown>; data: Record<string, unknown> }) => Promise<{ count: number }>;
  };
}

export interface EnqueueInput {
  tenantId: string;
  editionId: string;
  idempotencyKey?: string | null;
  createdBy?: string | null;
  maxAttempts?: number;
  artifactTtlMs?: number;
  quota?: number;
}

export interface EnqueueResult {
  job: MediaJobRow;
  deduped: boolean;
}

function cleanKey(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim().slice(0, 64);
  return trimmed ? trimmed : null;
}

export async function enqueueMediaJob(prisma: MediaJobPrisma, input: EnqueueInput): Promise<EnqueueResult> {
  if (!input.tenantId || !input.editionId) {
    throw new MediaJobError("tenantId ve editionId zorunludur", 422);
  }
  const key = cleanKey(input.idempotencyKey);
  if (key) {
    const existing = await prisma.mediaExportJob.findUnique({
      where: { tenantId_idempotencyKey: { tenantId: input.tenantId, idempotencyKey: key } },
    });
    if (existing) return { job: existing, deduped: true };
  }
  const quota = input.quota ?? MEDIA_JOB_TENANT_QUOTA;
  const active = await prisma.mediaExportJob.count({
    where: { tenantId: input.tenantId, status: { in: [...MEDIA_JOB_ACTIVE] } },
  });
  if (active >= quota) {
    throw new MediaJobError(`Kiracı iş kotası dolu (${active}/${quota}) — sonra tekrar deneyin`, 429);
  }
  const ttl = input.artifactTtlMs ?? MEDIA_JOB_ARTIFACT_TTL_MS;
  const job = await prisma.mediaExportJob.create({
    data: {
      tenantId: input.tenantId,
      editionId: input.editionId,
      status: "QUEUED",
      idempotencyKey: key,
      maxAttempts: input.maxAttempts ?? MEDIA_JOB_MAX_ATTEMPTS,
      expiresAt: new Date(Date.now() + ttl),
      createdBy: input.createdBy ?? null,
    },
  });
  return { job, deduped: false };
}

export interface ClaimOptions {
  now?: Date;
  leaseMs?: number;
}

export async function claimNextMediaJob(prisma: MediaJobPrisma, opts: ClaimOptions = {}): Promise<MediaJobRow | null> {
  const now = opts.now ?? new Date();
  const leaseMs = opts.leaseMs ?? MEDIA_JOB_LEASE_MS;
  // Önce en eski QUEUED; yoksa kirası dolmuş ve hakkı kalmış RUNNING (crash-resume).
  const candidate =
    (await prisma.mediaExportJob.findFirst({
      where: { status: "QUEUED" },
      orderBy: { createdAt: "asc" },
    })) ??
    (await prisma.mediaExportJob.findFirst({
      where: { status: "RUNNING", leaseUntil: { lt: now } },
      orderBy: { leaseUntil: "asc" },
    }));
  if (!candidate) return null;
  if (candidate.status === "RUNNING" && candidate.attempts >= candidate.maxAttempts) {
    // Kirası dolmuş ama hakkı bitmiş — dead-letter'a taşı, iş alma.
    await prisma.mediaExportJob.update({
      where: { id: candidate.id },
      data: { status: "DEAD", leaseUntil: null, error: candidate.error ?? "Deneme hakkı tükendi (stale lease)" },
    });
    return claimNextMediaJob(prisma, opts);
  }
  return prisma.mediaExportJob.update({
    where: { id: candidate.id },
    data: { status: "RUNNING", attempts: candidate.attempts + 1, leaseUntil: new Date(now.getTime() + leaseMs), error: null },
  });
}

export async function heartbeatMediaJob(prisma: MediaJobPrisma, jobId: string, leaseMs: number = MEDIA_JOB_LEASE_MS): Promise<MediaJobRow> {
  const job = await prisma.mediaExportJob.findUnique({ where: { id: jobId } });
  if (!job) throw new MediaJobError("İş bulunamadı", 404);
  if (job.status !== "RUNNING") throw new MediaJobError(`Yalnız RUNNING işe nabız verilir (${job.status})`, 409);
  return prisma.mediaExportJob.update({
    where: { id: jobId },
    data: { leaseUntil: new Date(Date.now() + leaseMs) },
  });
}

export async function recordMediaProgress(prisma: MediaJobPrisma, jobId: string, patch: Record<string, unknown>): Promise<MediaJobRow> {
  const job = await prisma.mediaExportJob.findUnique({ where: { id: jobId } });
  if (!job) throw new MediaJobError("İş bulunamadı", 404);
  if (!(MEDIA_JOB_ACTIVE as readonly string[]).includes(job.status)) {
    throw new MediaJobError(`Kararlı işe ilerleme yazılamaz (${job.status})`, 409);
  }
  let current: Record<string, unknown> = {};
  try {
    current = JSON.parse(job.progressJson) as Record<string, unknown>;
  } catch {
    current = {};
  }
  return prisma.mediaExportJob.update({
    where: { id: jobId },
    data: { progressJson: JSON.stringify({ ...current, ...patch, updatedAt: new Date().toISOString() }) },
  });
}

export interface CompleteInput {
  result: Record<string, unknown>;
  artifactDir?: string | null;
  tokenTtlMs?: number;
  includeDownloadToken?: boolean;
}

export interface CompleteResult {
  job: MediaJobRow;
  downloadToken: string | null;
  downloadTokenExpiresAt: Date | null;
}

export async function completeMediaJob(prisma: MediaJobPrisma, jobId: string, input: CompleteInput): Promise<CompleteResult> {
  const job = await prisma.mediaExportJob.findUnique({ where: { id: jobId } });
  if (!job) throw new MediaJobError("İş bulunamadı", 404);
  if (job.status !== "RUNNING") throw new MediaJobError(`Yalnız RUNNING iş tamamlanır (${job.status})`, 409);
  let downloadToken: string | null = null;
  let downloadTokenExpiresAt: Date | null = null;
  const data: Record<string, unknown> = {
    status: "SUCCEEDED",
    resultJson: JSON.stringify(input.result),
    artifactDir: input.artifactDir ?? job.artifactDir,
    leaseUntil: null,
    error: null,
  };
  if (input.includeDownloadToken !== false) {
    const minted = mintDownloadToken(job.id, input.tokenTtlMs ?? MEDIA_JOB_TOKEN_TTL_MS);
    downloadToken = minted.token;
    downloadTokenExpiresAt = minted.expiresAt;
    data.fileTokenHash = hashDownloadToken(minted.token);
    data.tokenExpiresAt = minted.expiresAt;
  }
  const updated = await prisma.mediaExportJob.update({ where: { id: jobId }, data });
  return { job: updated, downloadToken, downloadTokenExpiresAt };
}

export interface FailInput {
  error: string;
  retryable?: boolean;
}

export async function failMediaJob(prisma: MediaJobPrisma, jobId: string, input: FailInput): Promise<MediaJobRow> {
  const job = await prisma.mediaExportJob.findUnique({ where: { id: jobId } });
  if (!job) throw new MediaJobError("İş bulunamadı", 404);
  if (job.status !== "RUNNING") throw new MediaJobError(`Yalnız RUNNING iş başarısız kapanır (${job.status})`, 409);
  const retryable = input.retryable !== false;
  if (retryable && job.attempts < job.maxAttempts) {
    return prisma.mediaExportJob.update({
      where: { id: jobId },
      data: { status: "QUEUED", leaseUntil: null, error: input.error },
    });
  }
  // Dead-letter: hak tükendi ya da retryable değil.
  return prisma.mediaExportJob.update({
    where: { id: jobId },
    data: { status: retryable ? "DEAD" : "FAILED", leaseUntil: null, error: input.error },
  });
}

export async function cancelMediaJob(prisma: MediaJobPrisma, jobId: string, tenantId: string): Promise<MediaJobRow> {
  const job = await prisma.mediaExportJob.findUnique({ where: { id: jobId } });
  if (!job || job.tenantId !== tenantId) throw new MediaJobError("İş bulunamadı", 404);
  if (!(MEDIA_JOB_ACTIVE as readonly string[]).includes(job.status)) {
    throw new MediaJobError(`Kararlı iş iptal edilemez (${job.status})`, 409);
  }
  return prisma.mediaExportJob.update({
    where: { id: jobId },
    data: { status: "CANCELLED", leaseUntil: null },
  });
}

export async function getMediaJob(prisma: MediaJobPrisma, jobId: string, tenantId: string): Promise<MediaJobRow | null> {
  const job = await prisma.mediaExportJob.findUnique({ where: { id: jobId } });
  if (!job || job.tenantId !== tenantId) return null;
  return job;
}

export async function purgeExpiredMediaJobs(prisma: MediaJobPrisma, now: Date = new Date()): Promise<MediaJobRow[]> {
  const expired = await prisma.mediaExportJob.findMany({
    where: { status: "SUCCEEDED", expiresAt: { lt: now } },
    select: { id: true },
  });
  const out: MediaJobRow[] = [];
  for (const row of expired as Array<{ id: string }>) {
    out.push(
      await prisma.mediaExportJob.update({
        where: { id: row.id },
        data: { status: "EXPIRED", fileTokenHash: null, tokenExpiresAt: null },
      }),
    );
  }
  return out;
}
