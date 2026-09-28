// P14.3b: İhracat işi kararı — PATCH /api/exports/[id] {approve: boolean}.
// Yalnız yönetici (ORG_*). Onay READY + jeton üretir; red kapatır.
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { GuardError, resolveContext } from "@/lib/api/tenant-guard";
import { requestActor, requireAdmin } from "@/lib/auth/request-context";
import { decideExport, ExportJobError } from "@/lib/exports/jobs";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  const denied = await requireAdmin();
  if (denied) return denied;

  let body: { approve?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Geçersiz istek gövdesi" }, { status: 400 });
  }
  if (typeof body.approve !== "boolean") {
    return NextResponse.json({ error: "approve (boolean) zorunludur" }, { status: 400 });
  }

  try {
    const tenantId = await resolveContext(null);
    const actor = await requestActor();
    const decided = await decideExport(db as never, {
      jobId: id,
      tenantId,
      approve: body.approve,
      decidedBy: actor?.uid ?? null,
      actorIsAdmin: true,
    });
    const job = await db.exportJob.findUnique({ where: { id }, select: { editionId: true, type: true } });
    await db.activityLog.create({
      data: {
        type: body.approve ? "EXPORT_APPROVED" : "EXPORT_REJECTED",
        message: `İhracat işi ${body.approve ? "onaylandı" : "reddedildi"}: ${job?.type ?? "?"}`,
        tenantId,
        editionId: job?.editionId ?? null,
        entityType: "ExportJob",
        entityId: id,
        actorName: actor?.uid ?? "Bilinmeyen",
      },
    });
    return NextResponse.json({
      id: decided.id,
      status: decided.status,
      token: decided.token,
      tokenExpiresAt: decided.tokenExpiresAt?.toISOString() ?? null,
    });
  } catch (e) {
    if (e instanceof ExportJobError) return NextResponse.json({ error: e.message }, { status: e.status });
    if (e instanceof GuardError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("PATCH /api/exports/[id]", e);
    return NextResponse.json({ error: "Karar verilemedi" }, { status: 500 });
  }
}
