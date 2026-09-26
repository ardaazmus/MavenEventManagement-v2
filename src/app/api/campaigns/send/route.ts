// /api/campaigns/send — Kampanyayı GERÇEK kanallara dağıt (EMAIL / SMS / WHATSAPP)
// mode TEST → yalnız test alıcısı (tekil doğrulama); mode LIVE → hedef kümesine toplu.
// Hedef kümesi kampanyanın hiyerarşik kapsamından çözülür (customerOnly / kategori /
// katılım listesi / özel liste). Rapor campaign.lastSendReport'a JSON olarak yazılır.
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { sendCampaignNow, BroadcastError } from "@/lib/api/comms-broadcast";
import { verifyEditionTenant, GuardError } from "@/lib/api/tenant-guard";
import { requestActor, requireStaff } from "@/lib/auth/request-context";
import { enforceRateLimit } from "@/lib/rate-limit";

export async function POST(req: NextRequest) {
  const denied = enforceRateLimit(req, { key: "campaign-send", limit: 20, windowMs: 60_000 });
  if (denied) return denied;
  const staffGate = await requireStaff();
  if (staffGate) return staffGate;

  try {
    const body = (await req.json()) as Record<string, unknown>;
    const campaignId = typeof body.campaignId === "string" ? body.campaignId : "";
    if (!campaignId) return NextResponse.json({ error: "campaignId zorunludur" }, { status: 400 });
    const mode = body.mode === "TEST" ? "TEST" : "LIVE";

    const campaign = await db.campaign.findUnique({ where: { id: campaignId }, select: { editionId: true } });
    if (!campaign) return NextResponse.json({ error: "Kampanya bulunamadı" }, { status: 404 });
    try {
      await verifyEditionTenant(campaign.editionId);
    } catch (e) {
      if (e instanceof GuardError) return NextResponse.json({ error: e.message }, { status: e.status });
      throw e;
    }

    const actor = await requestActor();
    let actorName = "Yönetici";
    if (actor) {
      const u = await db.user.findUnique({ where: { id: actor.uid }, select: { name: true } });
      actorName = u?.name ?? actor.role;
    }

    const report = await sendCampaignNow({
      campaignId,
      mode,
      testEmail: typeof body.testEmail === "string" ? body.testEmail : null,
      testPhone: typeof body.testPhone === "string" ? body.testPhone : null,
      actorName,
    });
    return NextResponse.json(report, { status: 200 });
  } catch (e) {
    if (e instanceof BroadcastError) {
      const status = e.code === "CAMPAIGN_NOT_FOUND" || e.code === "EDITION_NOT_FOUND" ? 404 : e.code === "VALIDATION" || e.code === "EMPTY_AUDIENCE" ? 400 : 409;
      return NextResponse.json({ error: e.message, code: e.code }, { status });
    }
    console.error("POST /api/campaigns/send", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Gönderim tamamlanamadı" }, { status: 500 });
  }
}
