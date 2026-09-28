// P14.3/P14.4: GET /api/media/export-jobs/[id] (durum + ilerleme) ve
// DELETE (iptal). Kadro kapılı; iş yalnız kendi kiracısından okunur.
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { GuardError, resolveContext } from "@/lib/api/tenant-guard";
import { requireStaff } from "@/lib/auth/request-context";
import { enforceRateLimit } from "@/lib/rate-limit";
import { cancelMediaJob, getMediaJob, MediaJobError } from "@/lib/media/job-queue";

function safeJson(raw: string | null): Record<string, unknown> | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const staffGate = await requireStaff();
  if (staffGate) return staffGate;
  try {
    const tenantId = await resolveContext(null);
    const { id } = await ctx.params;
    const job = await getMediaJob(db as never, id, tenantId);
    if (!job) return NextResponse.json({ error: "İş bulunamadı" }, { status: 404 });
    return NextResponse.json({
      jobId: job.id,
      status: job.status,
      attempts: job.attempts,
      maxAttempts: job.maxAttempts,
      progress: safeJson(job.progressJson),
      result: safeJson(job.resultJson),
      error: job.error,
      downloadReady: job.status === "SUCCEEDED" && !!job.fileTokenHash,
      tokenExpiresAt: job.tokenExpiresAt?.toISOString() ?? null,
      expiresAt: job.expiresAt?.toISOString() ?? null,
      createdAt: job.createdAt.toISOString(),
      updatedAt: job.updatedAt.toISOString(),
    });
  } catch (e) {
    if (e instanceof GuardError) return NextResponse.json({ error: e.message }, { status: e.status });
    if (e instanceof MediaJobError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("GET /api/media/export-jobs/[id]", e);
    return NextResponse.json({ error: "İş okunamadı" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const limited = enforceRateLimit(req, { key: "media-export-jobs-cancel", limit: 30, windowMs: 60_000 });
  if (limited) return limited;
  const staffGate = await requireStaff();
  if (staffGate) return staffGate;
  try {
    const tenantId = await resolveContext(null);
    const { id } = await ctx.params;
    const job = await cancelMediaJob(db as never, id, tenantId);
    return NextResponse.json({ jobId: job.id, status: job.status });
  } catch (e) {
    if (e instanceof GuardError) return NextResponse.json({ error: e.message }, { status: e.status });
    if (e instanceof MediaJobError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("DELETE /api/media/export-jobs/[id]", e);
    return NextResponse.json({ error: "İş iptal edilemedi" }, { status: 500 });
  }
}
