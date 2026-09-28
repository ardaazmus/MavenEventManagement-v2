// H-10: Şirket snapshot indirme (JSON arşiv).
// Kapı: requireAdmin() + hız sınırı; indirme KVKK denetimine yazılır.
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { resolveContext, GuardError } from "@/lib/api/tenant-guard";
import { requireAdmin, requestActor } from "@/lib/auth/request-context";
import { enforceRateLimit } from "@/lib/rate-limit";
import { logExport } from "@/lib/privacy/export-guard";
import { buildCompanySnapshot, snapshotFilename, type SnapshotPrisma } from "@/lib/exports/company-snapshot";

export async function GET(req: NextRequest) {
  const denied = enforceRateLimit(req, { key: "company-snapshot", limit: 6, windowMs: 60_000 });
  if (denied) return denied;
  const adminGate = await requireAdmin();
  if (adminGate) return adminGate;

  try {
    const tenantId = await resolveContext(null);
    const snapshot = await buildCompanySnapshot(db as unknown as SnapshotPrisma, tenantId);
    const actor = await requestActor();
    await logExport(db, {
      tenantId,
      editionId: null,
      type: "COMPANY_SNAPSHOT",
      count: snapshot.editionsTotal + snapshot.seriesTotal,
      actorName: actor?.uid ?? null,
    });

    const body = JSON.stringify(snapshot, null, 2);
    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="${snapshotFilename(snapshot.meta.tenantSlug)}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    if (e instanceof GuardError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    if (e instanceof Error && e.message === "TENANT_NOT_FOUND") {
      return NextResponse.json({ error: "Kiracı bulunamadı" }, { status: 404 });
    }
    console.error("GET /api/export/company-snapshot", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Snapshot oluşturulamadı" }, { status: 500 });
  }
}
