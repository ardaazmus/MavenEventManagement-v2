// Personel — P21.2 kohort / tekrar katılımı (kiracı düzeyi): kişi başına ilk
// giriş edisyonu kohorttur; sonraki edisyonlardaki tekrarlar matriste sayılır.
// Katılım kanıtı = izinli ENTRY taraması ya da CHECKED_IN katılımı.
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { resolveContext, GuardError } from "@/lib/api/tenant-guard";
import { requireStaff } from "@/lib/auth/request-context";
import { enforceRateLimit } from "@/lib/rate-limit";
import { buildCohorts, type AttendancePair } from "@/lib/analytics/aggregations";

const MAX_PAIRS = 50000;

function guardJson(e: unknown) {
  if (e instanceof GuardError) return NextResponse.json({ error: e.message }, { status: e.status });
  return null;
}

export async function GET(req: NextRequest) {
  const staffGate = await requireStaff();
  if (staffGate) return staffGate;
  try {
    const denied = enforceRateLimit(req, { key: "analytics-cohorts", limit: 12, windowMs: 60_000 });
    if (denied) return denied;
    const tenantId = await resolveContext(req.nextUrl.searchParams.get("tenantId"));

    const editions = await db.eventEdition.findMany({
      where: { tenantId },
      select: { id: true, name: true, startDate: true },
      orderBy: { startDate: "asc" },
      take: 100,
    });
    const editionIds = editions.map((e) => e.id);
    if (editionIds.length === 0) {
      return NextResponse.json({ cohorts: [], persons: 0, repeaters: 0, repeatRate: null, truncated: false });
    }

    const [scans, checked] = await Promise.all([
      db.scanEvent.findMany({
        where: { editionId: { in: editionIds }, action: "ENTRY", result: "ALLOWED", personId: { not: null } },
        select: { personId: true, editionId: true },
        take: MAX_PAIRS,
      }),
      db.eventParticipation.findMany({
        where: { editionId: { in: editionIds }, attendance: "CHECKED_IN" },
        select: { personId: true, editionId: true },
        take: MAX_PAIRS,
      }),
    ]);
    const pairs: AttendancePair[] = [
      ...scans.map((s) => ({ personId: s.personId as string, editionId: s.editionId as string })),
      ...checked.map((c) => ({ personId: c.personId, editionId: c.editionId })),
    ];

    return NextResponse.json({
      truncated: scans.length >= MAX_PAIRS || checked.length >= MAX_PAIRS,
      ...buildCohorts(
        pairs,
        editions.map((e) => ({ id: e.id, name: e.name, startMs: e.startDate?.getTime() ?? null })),
      ),
    });
  } catch (e) {
    const ge = guardJson(e);
    if (ge) return ge;
    console.error("analytics/cohorts error:", e);
    return NextResponse.json({ error: "Kohort alınamadı" }, { status: 500 });
  }
}
