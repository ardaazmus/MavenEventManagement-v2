// P19.3: POST /api/campaigns/approval — kampanya onay akışı.
// { campaignId, action: "request"|"approve"|"reject", note? }.
// İsteme kadro, karar yönetici; dört-göz lib'de zorunlu.
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { GuardError, resolveContext } from "@/lib/api/tenant-guard";
import { requestActor, requireAdmin, requireStaff } from "@/lib/auth/request-context";
import { enforceRateLimit } from "@/lib/rate-limit";
import { decideCampaignApproval, requestCampaignApproval, ApprovalError } from "@/lib/promo/campaign-approval";

export async function POST(req: NextRequest) {
  const limited = enforceRateLimit(req, { key: "campaign-approval", limit: 30, windowMs: 60_000 });
  if (limited) return limited;
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Geçersiz istek gövdesi" }, { status: 400 });
  }
  const campaignId = typeof body.campaignId === "string" ? body.campaignId : "";
  const action = typeof body.action === "string" ? body.action : "";
  if (!campaignId || !["request", "approve", "reject"].includes(action)) {
    return NextResponse.json({ error: "campaignId ve action (request|approve|reject) zorunludur" }, { status: 422 });
  }
  try {
    const tenantId = await resolveContext(null);
    const actor = await requestActor();
    const uid = actor?.uid ?? null;
    if (action === "request") {
      const staffGate = await requireStaff();
      if (staffGate) return staffGate;
      const updated = await requestCampaignApproval(db as never, {
        tenantId,
        campaignId,
        requestedBy: uid,
        note: typeof body.note === "string" ? body.note : null,
      });
      return NextResponse.json(updated);
    }
    const adminGate = await requireAdmin();
    if (adminGate) return adminGate;
    const updated = await decideCampaignApproval(db as never, {
      tenantId,
      campaignId,
      approve: action === "approve",
      decidedBy: uid,
      actorIsAdmin: true,
      note: typeof body.note === "string" ? body.note : null,
    });
    return NextResponse.json(updated);
  } catch (e) {
    if (e instanceof GuardError) return NextResponse.json({ error: e.message }, { status: e.status });
    if (e instanceof ApprovalError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("POST /api/campaigns/approval", e);
    return NextResponse.json({ error: "Onay işlemi başarısız" }, { status: 500 });
  }
}
