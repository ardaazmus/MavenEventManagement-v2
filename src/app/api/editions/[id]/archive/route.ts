// P18.2: POST/GET /api/editions/[id]/archive — edisyon arşivleme + görüntü okuma.
// Arşivleme yönetici kapılıdır (geri döndürülemez); okuma kadro kapılıdır.
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { GuardError, resolveContext, verifyEditionTenant } from "@/lib/api/tenant-guard";
import { requestActor, requireAdmin, requireStaff } from "@/lib/auth/request-context";
import { enforceRateLimit } from "@/lib/rate-limit";
import { archiveEdition, checkArchiveBlockers, getEditionArchive, ArchiveError } from "@/lib/compliance/edition-archive";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const staffGate = await requireStaff();
  if (staffGate) return staffGate;
  try {
    const tenantId = await resolveContext(null);
    const { id } = await ctx.params;
    await verifyEditionTenant(id);
    const found = await getEditionArchive(db as never, { tenantId, editionId: id });
    if (!found) return NextResponse.json({ error: "Arşiv görüntüsü yok" }, { status: 404 });
    return NextResponse.json({ archive: found.archive, snapshot: found.snapshot });
  } catch (e) {
    if (e instanceof GuardError) return NextResponse.json({ error: e.message }, { status: e.status });
    if (e instanceof ArchiveError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("GET /api/editions/[id]/archive", e);
    return NextResponse.json({ error: "Arşiv okunamadı" }, { status: 500 });
  }
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const limited = enforceRateLimit(req, { key: "edition-archive", limit: 10, windowMs: 60_000 });
  if (limited) return limited;
  const adminGate = await requireAdmin();
  if (adminGate) return adminGate;
  const dryRun = req.nextUrl.searchParams.get("dryRun") === "1";
  try {
    const tenantId = await resolveContext(null);
    const { id } = await ctx.params;
    await verifyEditionTenant(id);
    if (dryRun) {
      const blockers = await checkArchiveBlockers(db as never, { tenantId, editionId: id });
      return NextResponse.json({ editionId: id, blockers, archivable: blockers.length === 0 });
    }
    const actor = await requestActor();
    const { snapshot } = await archiveEdition(db as never, { tenantId, editionId: id, archivedBy: actor?.uid ?? null });
    return NextResponse.json({ editionId: id, status: "ARCHIVED", snapshot }, { status: 201 });
  } catch (e) {
    if (e instanceof GuardError) return NextResponse.json({ error: e.message }, { status: e.status });
    if (e instanceof ArchiveError) return NextResponse.json({ error: e.message, blockers: e.blockers }, { status: e.status });
    console.error("POST /api/editions/[id]/archive", e);
    return NextResponse.json({ error: "Arşivlenemedi" }, { status: 500 });
  }
}
