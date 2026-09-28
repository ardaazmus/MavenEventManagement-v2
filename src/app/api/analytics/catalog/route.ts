// Personel — P21.1 metrik kataloğu: her KPI için isim, formül, grain,
// kaynak, timezone, tazelik ve sahip. Salt-okunur belgedir.
import { NextRequest, NextResponse } from "next/server";
import { requireStaff } from "@/lib/auth/request-context";
import { enforceRateLimit } from "@/lib/rate-limit";
import { METRIC_CATALOG } from "@/lib/analytics/catalog";

export async function GET(req: NextRequest) {
  const staffGate = await requireStaff();
  if (staffGate) return staffGate;
  const denied = enforceRateLimit(req, { key: "analytics-catalog", limit: 30, windowMs: 60_000 });
  if (denied) return denied;
  const key = req.nextUrl.searchParams.get("key");
  if (key) {
    const metric = METRIC_CATALOG.find((m) => m.key === key);
    if (!metric) return NextResponse.json({ error: "Metrik bulunamadı" }, { status: 404 });
    return NextResponse.json({ metric });
  }
  return NextResponse.json({ metrics: METRIC_CATALOG });
}
