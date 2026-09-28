import { NextRequest, NextResponse } from "next/server";
import { resolveEditionContext, GuardError } from "@/lib/api/tenant-guard";
import { requireStaff } from "@/lib/auth/request-context";
import { buildPlanSnapshot } from "@/lib/api/floor";

export const dynamic = "force-dynamic";

// GET /api/floor-studio/plan?editionId=...
// Maven → Floor Studio plan anlık görünümü (§20: ortak kimlik boothUnitId).
// Dış Floor Studio uygulaması bu endpoint ile salon planını çeker.
export async function GET(req: NextRequest) {
  // N-08 rol kapısı — envanter iddiasıyla uyum (auth-off'ta null, davranış korunur).
  const staffGate = await requireStaff();
  if (staffGate) return staffGate;
  const editionId = req.nextUrl.searchParams.get("editionId");
  if (!editionId) {
    return NextResponse.json({ error: "editionId zorunlu" }, { status: 400 });
  }
  // G0-b: dış uygulamaya plan verilmeden önce edisyon bağlamı doğrulanır
  try {
    await resolveEditionContext(editionId, { required: true });
  } catch (e) {
    if (e instanceof GuardError) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
  const snapshot = await buildPlanSnapshot(editionId);
  if (!snapshot.edition) {
    return NextResponse.json({ error: "Edisyon bulunamadı" }, { status: 404 });
  }
  return NextResponse.json(snapshot);
}
