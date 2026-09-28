// P19.4: POST /api/promo/utm-links — sözlük-doğrulamalı UTM kurucu.
// GET /api/promo/usage — kullanım analitiği (tür/kampanya/varlık kırılımı).
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { GuardError, resolveContext, verifyEditionTenant } from "@/lib/api/tenant-guard";
import { requireStaff } from "@/lib/auth/request-context";
import { enforceRateLimit } from "@/lib/rate-limit";
import { buildUtmUrl, UtmError } from "@/lib/promo/utm";

export async function POST(req: NextRequest) {
  const limited = enforceRateLimit(req, { key: "promo-utm", limit: 60, windowMs: 60_000 });
  if (limited) return limited;
  const staffGate = await requireStaff();
  if (staffGate) return staffGate;
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Geçersiz istek gövdesi" }, { status: 400 });
  }
  try {
    const tenantId = await resolveContext(null);
    const editionId = typeof body.editionId === "string" && body.editionId ? body.editionId : null;
    if (editionId) await verifyEditionTenant(editionId);
    const str = (k: string): string | null => (typeof body[k] === "string" ? (body[k] as string) : null);
    const built = await buildUtmUrl(db as never, {
      tenantId,
      baseUrl: str("baseUrl") ?? "",
      source: str("source") ?? "",
      medium: str("medium") ?? "",
      campaign: str("campaign") ?? "",
      content: str("content"),
      term: str("term"),
      strict: body.strict !== false,
      campaignId: str("campaignId"),
      editionId,
    });
    return NextResponse.json(built, { status: 201 });
  } catch (e) {
    if (e instanceof GuardError) return NextResponse.json({ error: e.message }, { status: e.status });
    if (e instanceof UtmError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("POST /api/promo/utm-links", e);
    return NextResponse.json({ error: "UTM kurulamadı" }, { status: 500 });
  }
}
