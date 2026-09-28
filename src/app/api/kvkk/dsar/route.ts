// P18.3: GET /api/kvkk/dsar?personId=…&format=json|csv — kişi verisi dışa aktarımı.
// Kadro kapılı + kiracı kapsamlı + oran sınırlı; her üretim ActivityLog'a düşer.
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { GuardError, resolveContext } from "@/lib/api/tenant-guard";
import { requestActor, requireStaff } from "@/lib/auth/request-context";
import { enforceRateLimit } from "@/lib/rate-limit";
import { buildDsarBundle, dsarToCsv, DsarError } from "@/lib/compliance/dsar";

export async function GET(req: NextRequest) {
  const limited = enforceRateLimit(req, { key: "kvkk-dsar", limit: 20, windowMs: 60_000 });
  if (limited) return limited;
  const staffGate = await requireStaff();
  if (staffGate) return staffGate;
  const personId = req.nextUrl.searchParams.get("personId");
  const format = req.nextUrl.searchParams.get("format") === "csv" ? "csv" : "json";
  if (!personId) return NextResponse.json({ error: "personId zorunludur" }, { status: 422 });
  try {
    const tenantId = await resolveContext(null);
    const bundle = await buildDsarBundle(db as never, { tenantId, personId });
    const actor = await requestActor();
    await db.activityLog.create({
      data: {
        type: "OTHER",
        message: `DSAR dışa aktarımı: kişi ${personId} (${format}) — ${bundle.participations.length} katılım, ${bundle.registrations.length} kayıt`,
        tenantId,
        editionId: null,
        entityType: "Person",
        entityId: personId,
        actorName: actor?.uid ?? "Bilinmeyen",
      },
    });
    if (format === "csv") {
      return new NextResponse(dsarToCsv(bundle), {
        status: 200,
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="dsar-${personId.slice(0, 8)}.csv"`,
          "Cache-Control": "no-store",
        },
      });
    }
    return NextResponse.json(bundle, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    if (e instanceof DsarError) return NextResponse.json({ error: e.message }, { status: e.status });
    if (e instanceof GuardError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("GET /api/kvkk/dsar", e);
    return NextResponse.json({ error: "DSAR üretilemedi" }, { status: 500 });
  }
}
