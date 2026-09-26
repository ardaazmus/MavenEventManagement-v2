// /api/campaigns/schedule — Kampanyayı ileri bir tarihe planla (POST) veya
// zamanlanmış gönderimi iptal et (DELETE).
// POST { campaignId, scheduledAt(ISO) } → status SCHEDULED; DELETE ?campaignId= → taslağa döner.
// Zamani gelen kampanyaları 60 sn'lik kontrol döngüsü (instrumentation) otomatik gönderir;
// POST /api/campaigns/tick ile manuel tetikleme de mümkündür.
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { scheduleCampaign, cancelCampaignSchedule, ScheduleError } from "@/lib/api/campaign-scheduler";
import { verifyEditionTenant, GuardError } from "@/lib/api/tenant-guard";
import { requestActor, requireStaff } from "@/lib/auth/request-context";
import { enforceRateLimit } from "@/lib/rate-limit";

const STATUS: Record<string, number> = {
  CAMPAIGN_NOT_FOUND: 404,
  INVALID_STATUS: 409,
  NOT_SCHEDULED: 409,
  PAST_TIME: 400,
  VALIDATION: 400,
};

function mapError(e: unknown) {
  if (e instanceof ScheduleError) {
    return NextResponse.json({ error: e.message, code: e.code }, { status: STATUS[e.code] ?? 400 });
  }
  console.error("route /api/campaigns/schedule", e instanceof Error ? e.message : e);
  return NextResponse.json({ error: "Zamanlama işlemi tamamlanamadı" }, { status: 500 });
}

async function actorName(fallback = "Yönetici"): Promise<string> {
  const actor = await requestActor();
  if (!actor) return fallback;
  const u = await db.user.findUnique({ where: { id: actor.uid }, select: { name: true } });
  return u?.name ?? actor.role;
}

export async function POST(req: NextRequest) {
  const denied = enforceRateLimit(req, { key: "campaign-schedule", limit: 30, windowMs: 60_000 });
  if (denied) return denied;
  const staffGate = await requireStaff();
  if (staffGate) return staffGate;

  try {
    const body = (await req.json()) as Record<string, unknown>;
    const campaignId = typeof body.campaignId === "string" ? body.campaignId : "";
    const whenRaw = typeof body.scheduledAt === "string" ? body.scheduledAt : "";
    if (!campaignId) return NextResponse.json({ error: "campaignId zorunludur" }, { status: 400 });
    const scheduledAt = new Date(whenRaw);
    if (!whenRaw || Number.isNaN(scheduledAt.getTime())) {
      return NextResponse.json({ error: "scheduledAt geçerli bir ISO tarih/saat olmalıdır" }, { status: 400 });
    }

    const campaign = await db.campaign.findUnique({ where: { id: campaignId }, select: { editionId: true } });
    if (!campaign) return NextResponse.json({ error: "Kampanya bulunamadı" }, { status: 404 });
    try {
      await verifyEditionTenant(campaign.editionId);
    } catch (e) {
      if (e instanceof GuardError) return NextResponse.json({ error: e.message }, { status: e.status });
      throw e;
    }

    const updated = await scheduleCampaign({ campaignId, scheduledAt, actorName: await actorName() });
    return NextResponse.json({ ok: true, campaign: updated }, { status: 200 });
  } catch (e) {
    return mapError(e);
  }
}

export async function DELETE(req: NextRequest) {
  const denied = enforceRateLimit(req, { key: "campaign-schedule-cancel", limit: 30, windowMs: 60_000 });
  if (denied) return denied;
  const staffGate = await requireStaff();
  if (staffGate) return staffGate;

  try {
    const campaignId = req.nextUrl.searchParams.get("campaignId") ?? "";
    if (!campaignId) return NextResponse.json({ error: "campaignId zorunludur" }, { status: 400 });

    const campaign = await db.campaign.findUnique({ where: { id: campaignId }, select: { editionId: true } });
    if (!campaign) return NextResponse.json({ error: "Kampanya bulunamadı" }, { status: 404 });
    try {
      await verifyEditionTenant(campaign.editionId);
    } catch (e) {
      if (e instanceof GuardError) return NextResponse.json({ error: e.message }, { status: e.status });
      throw e;
    }

    const updated = await cancelCampaignSchedule({ campaignId, actorName: await actorName() });
    return NextResponse.json({ ok: true, campaign: updated }, { status: 200 });
  } catch (e) {
    return mapError(e);
  }
}
