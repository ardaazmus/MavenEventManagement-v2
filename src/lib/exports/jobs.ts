// ─── P14.3a: Denetimli dışa aktarım iş defteri ─────────────────────────────────
// Akış: talep (staff) → küçük iş anında READY + jeton; resmi/büyük iş
// NEEDS_APPROVAL → yönetici onayı/reddi → READY + jeton. İndirme jetonu HMAC
// imzalı + süreli; ham jeton yalnız yanıtta bir kez döner, saklanan sha256.
// Saklama: süresi dolan işler purge ile EXPIRED yapılır, hash silinir (lazy).
import crypto from "node:crypto";

export const EXPORT_TOKEN_TTL_MS = 15 * 60 * 1000;
export const EXPORT_APPROVAL_ROW_THRESHOLD = 2000;

export class ExportJobError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = "ExportJobError";
    this.status = status;
  }
}

function tokenKey(): string {
  return process.env.EXPORT_TOKEN_KEY ?? process.env.MAVEN_SESSION_KEY ?? "dev-export-key-do-not-use-in-prod";
}

function sign(payload: string): string {
  return crypto.createHmac("sha256", tokenKey()).update(payload).digest("base64url");
}

export function mintDownloadToken(jobId: string, ttlMs: number = EXPORT_TOKEN_TTL_MS): { token: string; expiresAt: Date } {
  const exp = Date.now() + ttlMs;
  const payload = `${jobId}.${exp}`;
  return { token: `${payload}.${sign(payload)}`, expiresAt: new Date(exp) };
}

export function hashDownloadToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function parseDownloadToken(token: string): { jobId: string; exp: number } | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [jobId, expRaw, sig] = parts;
  const exp = Number(expRaw);
  if (!jobId || !Number.isInteger(exp)) return null;
  const expected = sign(`${jobId}.${expRaw}`);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  return { jobId, exp };
}

export interface ExportJobPrisma {
  exportJob: {
    create: (args: { data: Record<string, unknown> }) => Promise<{
      id: string;
      tenantId: string;
      status: string;
      tokenExpiresAt: Date | null;
    }>;
    findUnique: (args: { where: Record<string, unknown> }) => Promise<{
      id: string;
      tenantId: string;
      editionId: string | null;
      type: string;
      status: string;
      paramsJson: string;
      fileTokenHash: string | null;
      tokenExpiresAt: Date | null;
    } | null>;
    findMany: (args: { where: Record<string, unknown>; select?: unknown }) => Promise<Array<{ id: string }>>;
    update: (args: { where: Record<string, unknown>; data: Record<string, unknown> }) => Promise<{
      id: string;
      status: string;
      tokenExpiresAt: Date | null;
    }>;
    updateMany: (args: { where: Record<string, unknown>; data: Record<string, unknown> }) => Promise<{ count: number }>;
  };
  exportDownload: {
    create: (args: { data: Record<string, unknown> }) => Promise<unknown>;
  };
  registration: {
    count: (args: { where: Record<string, unknown> }) => Promise<number>;
  };
}

export interface ExportParams {
  status?: string;
  q?: string;
  company?: string;
  official?: boolean;
}

export interface RequestExportInput {
  tenantId: string;
  editionId: string;
  type: string;
  params: ExportParams;
  createdBy?: string | null;
  tokenTtlMs?: number;
}

export interface RequestedJob {
  id: string;
  status: string;
  token: string | null;
  tokenExpiresAt: Date | null;
  rowCount: number;
}

async function estimateRows(prisma: ExportJobPrisma, input: RequestExportInput): Promise<number> {
  if (input.type !== "REGISTRATIONS") return 0;
  // Rıza filtresi dahil sayım (P14.2 ile aynı kapsam).
  return prisma.registration.count({
    where: {
      editionId: input.editionId,
      participation: { is: { person: { is: { consentVersion: { not: null } } } } },
    },
  });
}

export async function requestExport(prisma: ExportJobPrisma, input: RequestExportInput): Promise<RequestedJob> {
  const rowCount = await estimateRows(prisma, input);
  const sensitive = input.params.official === true || rowCount > EXPORT_APPROVAL_ROW_THRESHOLD;
  if (!sensitive) {
    const created = await prisma.exportJob.create({
      data: {
        tenantId: input.tenantId,
        editionId: input.editionId,
        type: input.type,
        status: "READY",
        paramsJson: JSON.stringify(input.params),
        rowCount,
        createdBy: input.createdBy ?? null,
      },
    });
    const { token, expiresAt } = mintDownloadToken(created.id, input.tokenTtlMs);
    await prisma.exportJob.update({
      where: { id: created.id },
      data: { fileTokenHash: hashDownloadToken(token), tokenExpiresAt: expiresAt },
    });
    return { id: created.id, status: "READY", token, tokenExpiresAt: expiresAt, rowCount };
  }
  const created = await prisma.exportJob.create({
    data: {
      tenantId: input.tenantId,
      editionId: input.editionId,
      type: input.type,
      status: "NEEDS_APPROVAL",
      paramsJson: JSON.stringify(input.params),
      rowCount,
      createdBy: input.createdBy ?? null,
    },
  });
  return { id: created.id, status: "NEEDS_APPROVAL", token: null, tokenExpiresAt: null, rowCount };
}

export interface DecideExportInput {
  jobId: string;
  tenantId: string;
  approve: boolean;
  decidedBy?: string | null;
  actorIsAdmin: boolean;
  tokenTtlMs?: number;
}

export async function decideExport(
  prisma: ExportJobPrisma,
  input: DecideExportInput,
): Promise<{ id: string; status: string; token: string | null; tokenExpiresAt: Date | null }> {
  if (!input.actorIsAdmin) {
    throw new ExportJobError("İhracat onayı yönetici yetkisi ister", 403);
  }
  const job = await prisma.exportJob.findUnique({ where: { id: input.jobId } });
  if (!job || job.tenantId !== input.tenantId) {
    throw new ExportJobError("İş bulunamadı", 404);
  }
  if (job.status !== "NEEDS_APPROVAL") {
    throw new ExportJobError(`Bu iş kararlı (${job.status}) — tekrar karar verilemez`, 409);
  }
  if (!input.approve) {
    const updated = await prisma.exportJob.update({
      where: { id: job.id },
      data: { status: "REJECTED", decidedBy: input.decidedBy ?? null, decidedAt: new Date() },
    });
    return { id: updated.id, status: updated.status, token: null, tokenExpiresAt: null };
  }
  const { token, expiresAt } = mintDownloadToken(job.id, input.tokenTtlMs);
  const updated = await prisma.exportJob.update({
    where: { id: job.id },
    data: {
      status: "READY",
      fileTokenHash: hashDownloadToken(token),
      tokenExpiresAt: expiresAt,
      decidedBy: input.decidedBy ?? null,
      decidedAt: new Date(),
    },
  });
  return { id: updated.id, status: updated.status, token, tokenExpiresAt: updated.tokenExpiresAt };
}

export type VerifyDownloadResult =
  | { ok: true; job: { id: string; tenantId: string; editionId: string | null; type: string; paramsJson: string } }
  | { ok: false; error: string };

export async function verifyDownloadToken(
  prisma: ExportJobPrisma,
  jobId: string,
  token: string,
): Promise<VerifyDownloadResult> {
  const parsed = parseDownloadToken(token);
  if (!parsed || parsed.jobId !== jobId) {
    return { ok: false, error: "Geçersiz jeton" };
  }
  if (parsed.exp <= Date.now()) {
    return { ok: false, error: "Jetonun süresi doldu" };
  }
  const job = await prisma.exportJob.findUnique({ where: { id: jobId } });
  if (!job || job.status !== "READY") {
    return { ok: false, error: "İş indirilebilir durumda değil" };
  }
  if (!job.fileTokenHash || !job.tokenExpiresAt || job.tokenExpiresAt.getTime() <= Date.now()) {
    return { ok: false, error: "Jetonun süresi doldu" };
  }
  const presented = Buffer.from(hashDownloadToken(token));
  const stored = Buffer.from(job.fileTokenHash);
  if (presented.length !== stored.length || !crypto.timingSafeEqual(presented, stored)) {
    return { ok: false, error: "Geçersiz jeton" };
  }
  return { ok: true, job: { id: job.id, tenantId: job.tenantId, editionId: job.editionId, type: job.type, paramsJson: job.paramsJson } };
}

export async function recordDownload(
  prisma: ExportJobPrisma,
  input: { jobId: string; actorName?: string | null },
): Promise<void> {
  await prisma.exportDownload.create({ data: { jobId: input.jobId, actorName: input.actorName ?? null } });
}

export async function purgeExpiredJobs(prisma: ExportJobPrisma): Promise<number> {
  const res = await prisma.exportJob.updateMany({
    where: { status: "READY", tokenExpiresAt: { lt: new Date() } },
    data: { status: "EXPIRED", fileTokenHash: null, tokenExpiresAt: null },
  });
  return res.count;
}
