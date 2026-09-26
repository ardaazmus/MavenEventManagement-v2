// /api/campaigns/tick — Zamanlanmış kampanya kontrol döngüsünün MANUEL tetikleyicisi.
// Kontrol döngüsü normalde instrumentation ile 60 sn'de bir sunucu içinde çalışır;
// bu uç, tek bir kampanyayı anında değerlendirmek için admin kapılı bir yol sunar
// (doğrulama/operasyon/test senaryoları). Kiracı izolasyonu: campaignId zorunlu ve
// kampanyanın edisyonu oturum kiracısına ait olmalıdır.
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { processDueCampaigns } from "@/lib/api/campaign-scheduler";
import { verifyEditionTenant, GuardError } from "@/lib/api/tenant-guard";
import { requestActor, requireStaff } from "@/lib/auth/request-context";
import { enforceRateLimit } from "@/lib/rate-limit";

export async function POST(req: NextRequest) {
  const denied = enforceRateLimit(req, { key: "campaign-tick", limit: 60, windowMs: 60_000 });
  if (denied) return denied;
  const staffGate = await requireStaff();
  if (staffGate) return staffGate;

  try {
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const campaignId = typeof body.campaignId === "string" ? body.campaignId : "";
    if (!campaignId) return NextResponse.json({ error: "campaignId zorunludur" }, { status: 400 });

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

    const result = await processDueCampaigns({ campaignId, actorName });
    return NextResponse.json(result, { status: 200 });
  } catch (e) {
    console.error("POST /api/campaigns/tick", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Kontrol döngüsü tamamlanamadı" }, { status: 500 });
  }
}
