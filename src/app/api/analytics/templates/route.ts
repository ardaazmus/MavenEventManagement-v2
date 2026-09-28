// Personel — P21.4 SQL şablon listesi: BI dışa aktarımı için kiracı-filtreli
// hazır sorgular (:tenantId / :editionId yer tutuculu). Salt-okunur metindir.
import { NextRequest, NextResponse } from "next/server";
import { requireStaff } from "@/lib/auth/request-context";
import { enforceRateLimit } from "@/lib/rate-limit";
import { SQL_TEMPLATES } from "@/lib/analytics/features";

export async function GET(req: NextRequest) {
  const staffGate = await requireStaff();
  if (staffGate) return staffGate;
  const denied = enforceRateLimit(req, { key: "analytics-templates", limit: 30, windowMs: 60_000 });
  if (denied) return denied;
  const key = req.nextUrl.searchParams.get("key");
  if (key) {
    const tpl = SQL_TEMPLATES.find((t) => t.key === key);
    if (!tpl) return NextResponse.json({ error: "Şablon bulunamadı" }, { status: 404 });
    return NextResponse.json({ template: tpl });
  }
  return NextResponse.json({ templates: SQL_TEMPLATES });
}
