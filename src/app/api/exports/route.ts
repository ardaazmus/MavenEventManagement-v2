// P14.3b: Denetimli ihracat talebi — POST /api/exports {type, editionId, params}.
// Kadro kapılı + edition kiracı doğrulamalı. Küçük iş anında READY + jeton;
// resmi/büyük iş NEEDS_APPROVAL kuyruğuna düşer (PATCH ile yönetici kararı).
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { GuardError, resolveContext, verifyEditionTenant } from "@/lib/api/tenant-guard";
import { requestActor, requireStaff } from "@/lib/auth/request-context";
import { enforceRateLimit } from "@/lib/rate-limit";
import { requestExport } from "@/lib/exports/jobs";

const ALLOWED_TYPES = ["REGISTRATIONS"] as const;

export async function POST(req: NextRequest) {
  const limited = enforceRateLimit(req, { key: "exports-request", limit: 20, windowMs: 60_000 });
  if (limited) return limited;
  const staffGate = await requireStaff();
  if (staffGate) return staffGate;

  let body: { type?: unknown; editionId?: unknown; params?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Geçersiz istek gövdesi" }, { status: 400 });
  }
  if (typeof body.type !== "string" || !(ALLOWED_TYPES as readonly string[]).includes(body.type)) {
    return NextResponse.json({ error: `type yalnız ${ALLOWED_TYPES.join(", ")} olabilir` }, { status: 400 });
  }
  if (typeof body.editionId !== "string" || !body.editionId) {
    return NextResponse.json({ error: "editionId zorunludur" }, { status: 400 });
  }
  const params = (body.params ?? {}) as { status?: unknown; q?: unknown; company?: unknown; official?: unknown };
  const clean = {
    status: typeof params.status === "string" ? params.status : "ALL",
    q: typeof params.q === "string" ? params.q : "",
    company: typeof params.company === "string" ? params.company : "",
    official: params.official === true,
  };

  try {
    const tenantId = await resolveContext(null);
    await verifyEditionTenant(body.editionId);
    const actor = await requestActor();
    const job = await requestExport(db as never, {
      tenantId,
      editionId: body.editionId,
      type: body.type,
      params: clean,
      createdBy: actor?.uid ?? null,
    });
    await db.activityLog.create({
      data: {
        type: job.status === "READY" ? "EXPORT_READY" : "EXPORT_REQUESTED",
        message: `İhracat işi: ${body.type} (${job.status}, ~${job.rowCount} satır)`,
        tenantId,
        editionId: body.editionId,
        entityType: "ExportJob",
        entityId: job.id,
        actorName: actor?.uid ?? "Bilinmeyen",
      },
    });
    return NextResponse.json(
      { id: job.id, status: job.status, rowCount: job.rowCount, token: job.token, tokenExpiresAt: job.tokenExpiresAt?.toISOString() ?? null },
      { status: 201 },
    );
  } catch (e) {
    if (e instanceof GuardError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("POST /api/exports", e);
    return NextResponse.json({ error: "İhracat işi açılamadı" }, { status: 500 });
  }
}
