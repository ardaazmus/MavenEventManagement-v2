// P19.4: GET /api/promo/usage — kullanım analitiği.
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { GuardError, resolveContext } from "@/lib/api/tenant-guard";
import { requireStaff } from "@/lib/auth/request-context";
import { enforceRateLimit } from "@/lib/rate-limit";
import { usageStats, UtmError } from "@/lib/promo/utm";

export async function GET(req: NextRequest) {
  const limited = enforceRateLimit(req, { key: "promo-usage", limit: 60, windowMs: 60_000 });
  if (limited) return limited;
  const staffGate = await requireStaff();
  if (staffGate) return staffGate;
  try {
    const tenantId = await resolveContext(null);
    const sp = req.nextUrl.searchParams;
    const stats = await usageStats(db as never, {
      tenantId,
      kind: sp.get("kind") ?? undefined,
      campaignId: sp.get("campaignId") ?? undefined,
      assetId: sp.get("assetId") ?? undefined,
    });
    return NextResponse.json(stats);
  } catch (e) {
    if (e instanceof GuardError) return NextResponse.json({ error: e.message }, { status: e.status });
    if (e instanceof UtmError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("GET /api/promo/usage", e);
    return NextResponse.json({ error: "Analitik okunamadı" }, { status: 500 });
  }
}
