// P14.3: POST /api/media/export-jobs — asenkron medya arşiv talebi (202 + job id).
// Kadro kapılı + edisyon kiracı doğrulamalı + oran sınırlı. Idempotency-Key
// başlığı aynı anahtarla tekrarlanan talebi aynı işe bağlar.
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { GuardError, verifyEditionTenant, resolveContext } from "@/lib/api/tenant-guard";
import { requestActor, requireStaff } from "@/lib/auth/request-context";
import { enforceRateLimit } from "@/lib/rate-limit";
import { enqueueMediaJob, MediaJobError } from "@/lib/media/job-queue";

export async function POST(req: NextRequest) {
  const limited = enforceRateLimit(req, { key: "media-export-jobs", limit: 20, windowMs: 60_000 });
  if (limited) return limited;
  const staffGate = await requireStaff();
  if (staffGate) return staffGate;

  let body: { editionId?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Geçersiz istek gövdesi" }, { status: 400 });
  }
  if (typeof body.editionId !== "string" || !body.editionId) {
    return NextResponse.json({ error: "editionId zorunludur" }, { status: 422 });
  }
  const idempotencyKey = req.headers.get("idempotency-key");

  try {
    const tenantId = await resolveContext(null);
    await verifyEditionTenant(body.editionId);
    const actor = await requestActor();
    const { job, deduped } = await enqueueMediaJob(db as never, {
      tenantId,
      editionId: body.editionId,
      idempotencyKey,
      createdBy: actor?.uid ?? null,
    });
    await db.activityLog.create({
      data: {
        type: "EXPORT_REQUESTED",
        message: `Medya ihracat işi: ${job.id} (${job.status}${deduped ? ", idempotent" : ""})`,
        tenantId,
        editionId: body.editionId,
        entityType: "MediaExportJob",
        entityId: job.id,
        actorName: actor?.uid ?? "Bilinmeyen",
      },
    });
    return NextResponse.json(
      { jobId: job.id, status: job.status, deduped, attempts: job.attempts, expiresAt: job.expiresAt?.toISOString() ?? null },
      { status: 202 },
    );
  } catch (e) {
    if (e instanceof GuardError) return NextResponse.json({ error: e.message }, { status: e.status });
    if (e instanceof MediaJobError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("POST /api/media/export-jobs", e);
    return NextResponse.json({ error: "Medya işi açılamadı" }, { status: 500 });
  }
}
