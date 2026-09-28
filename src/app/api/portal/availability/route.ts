// P20.3: Sponsor görüşme uygunluk pencereleri (gerçek an aralıkları).
// GET: sponsor jetonu kendi pencerelerini; katılımcı jetonu hedef anlaşmanın
// pencerelerini okur (bilinçli talep için). POST/DELETE: yalnız sponsor jetonu
// (anlaşma kapsamlı jeton yalnız o anlaşmaya yazar).
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { resolvePublicEdition } from "@/lib/api/public-guard";
import { extractToken, validatePortalToken, touchToken } from "@/lib/api/portal-tokens";
import { checkSponsorScope } from "@/lib/portal/sponsor-scope";
import { validateWindow, validateTimezone } from "@/lib/meetings/requests";
import { ActivityType } from "@/lib/api/activity";
import { enforceRateLimit } from "@/lib/rate-limit";

const MAX_WINDOWS = 100;

async function sponsorContext(req: NextRequest, body?: Record<string, unknown>) {
  const sp = req.nextUrl.searchParams;
  const editionId = (body?.editionId as string) ?? sp.get("editionId");
  const organizationId = (body?.organizationId as string) ?? sp.get("organizationId");
  if (!editionId || !organizationId) return { error: "editionId ve organizationId zorunlu", status: 400 } as const;
  const raw = extractToken(req) ?? (typeof body?.token === "string" ? body.token : null);
  if (!raw) return { error: "Portal erişim anahtarı gerekli", status: 410 } as const;
  const check = await validatePortalToken(raw);
  if (!check.ok) {
    return {
      error: check.reason === "UNKNOWN" ? "Etkinlik bulunamadı" : "Erişim anahtarınız geçersiz veya süresi dolmuş",
      status: check.reason === "UNKNOWN" ? 404 : 410,
    } as const;
  }
  const token = check.token;
  if (!checkSponsorScope(token, { editionId, organizationId }).ok) {
    return { error: "Etkinlik bulunamadı", status: 404 } as const;
  }
  touchToken(token.id);
  const publicEdition = await resolvePublicEdition(editionId);
  if (!publicEdition) return { error: "Etkinlik bulunamadı", status: 404 } as const;
  return { token, editionId, organizationId } as const;
}

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const editionId = sp.get("editionId");
    const agreementId = sp.get("agreementId");
    if (!editionId || !agreementId) {
      return NextResponse.json({ error: "editionId ve agreementId zorunlu" }, { status: 400 });
    }
    const raw = extractToken(req);
    if (!raw) return NextResponse.json({ error: "Portal erişim anahtarı gerekli" }, { status: 410 });
    const check = await validatePortalToken(raw);
    if (!check.ok) {
      return NextResponse.json(
        { error: check.reason === "UNKNOWN" ? "Etkinlik bulunamadı" : "Erişim anahtarınız geçersiz veya süresi dolmuş" },
        { status: check.reason === "UNKNOWN" ? 404 : 410 },
      );
    }
    const token = check.token;
    if (token.editionId !== editionId) return NextResponse.json({ error: "Etkinlik bulunamadı" }, { status: 404 });

    const agreement = await db.sponsorAgreement.findFirst({
      where: { id: agreementId, editionId },
      select: { id: true, organizationId: true },
    });
    if (!agreement) return NextResponse.json({ error: "Anlaşma bulunamadı" }, { status: 404 });
    // sponsor: yalnız kendi (kapsamlıysa yalnız o anlaşma); katılımcı: aynı edisyon herkes okur
    if (token.scope === "SPONSOR") {
      if (!checkSponsorScope(token, { editionId, organizationId: agreement.organizationId, agreementId }).ok) {
        return NextResponse.json({ error: "Anlaşma bulunamadı" }, { status: 404 });
      }
    } else if (token.scope !== "PARTICIPANT" || !token.personId) {
      return NextResponse.json({ error: "Etkinlik bulunamadı" }, { status: 404 });
    }
    touchToken(token.id);
    const windows = await db.sponsorAvailability.findMany({
      where: { editionId, agreementId },
      orderBy: { slotStart: "asc" },
      take: MAX_WINDOWS,
    });
    return NextResponse.json({ items: windows });
  } catch (err) {
    console.error("portal/availability GET error:", err);
    return NextResponse.json({ error: "Uygunluk alınamadı" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const denied = enforceRateLimit(req, { key: "portal-availability", limit: 30, windowMs: 60_000 });
    if (denied) return denied;
    const body = (await req.json()) as Record<string, unknown>;
    const ctx = await sponsorContext(req, body);
    if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });

    const bodyAgreementId = typeof body.agreementId === "string" ? body.agreementId : null;
    if (ctx.token.agreementId && bodyAgreementId && ctx.token.agreementId !== bodyAgreementId) {
      return NextResponse.json({ error: "Anlaşma bulunamadı" }, { status: 404 });
    }
    const targetAgreementId = ctx.token.agreementId ?? bodyAgreementId;
    if (!targetAgreementId) return NextResponse.json({ error: "agreementId zorunlu" }, { status: 400 });
    const agreement = await db.sponsorAgreement.findFirst({
      where: { id: targetAgreementId, editionId: ctx.editionId, organizationId: ctx.organizationId },
      select: { id: true, status: true },
    });
    if (!agreement) return NextResponse.json({ error: "Anlaşma bulunamadı" }, { status: 404 });
    if (agreement.status === "CANCELLED") {
      return NextResponse.json({ error: "İptal edilmiş anlaşmaya pencere açılamaz" }, { status: 409 });
    }
    if (typeof body.slotStart !== "string" || typeof body.slotEnd !== "string") {
      return NextResponse.json({ error: "slotStart/slotEnd zorunlu" }, { status: 400 });
    }
    const window = validateWindow(body.slotStart, body.slotEnd);
    if (!window.ok) return NextResponse.json({ error: window.error }, { status: window.status });
    const tz = validateTimezone(body.timezone);
    if (!tz.ok) return NextResponse.json({ error: tz.error }, { status: 400 });
    const count = await db.sponsorAvailability.count({ where: { agreementId: agreement.id } });
    if (count >= MAX_WINDOWS) {
      return NextResponse.json({ error: `En fazla ${MAX_WINDOWS} pencere açılabilir` }, { status: 409 });
    }
    const label = typeof body.label === "string" ? body.label.trim().slice(0, 200) || null : null;
    const created = await db.sponsorAvailability.create({
      data: {
        editionId: ctx.editionId, agreementId: agreement.id,
        slotStart: window.start, slotEnd: window.end, timezone: tz.timezone, label,
      },
    });
    await db.activityLog.create({
      data: {
        type: ActivityType.MEETING_SAVED,
        editionId: ctx.editionId,
        message: "Portal: görüşme uygunluk penceresi açıldı",
        entityType: "SponsorAvailability",
        entityId: created.id,
        actorName: "Sponsor Portalı",
      },
    });
    return NextResponse.json({ ok: true, window: created }, { status: 201 });
  } catch (err) {
    console.error("portal/availability POST error:", err);
    return NextResponse.json({ error: "Pencere açılamadı" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const denied = enforceRateLimit(req, { key: "portal-availability", limit: 30, windowMs: 60_000 });
    if (denied) return denied;
    const ctx = await sponsorContext(req);
    if ("error" in ctx) return NextResponse.json({ error: ctx.error }, { status: ctx.status });
    const id = req.nextUrl.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id zorunlu" }, { status: 400 });
    const window = await db.sponsorAvailability.findFirst({
      where: { id, editionId: ctx.editionId, agreement: { organizationId: ctx.organizationId } },
      select: { id: true, agreementId: true },
    });
    if (!window) return NextResponse.json({ error: "Pencere bulunamadı" }, { status: 404 });
    if (ctx.token.agreementId && ctx.token.agreementId !== window.agreementId) {
      return NextResponse.json({ error: "Pencere bulunamadı" }, { status: 404 });
    }
    await db.sponsorAvailability.delete({ where: { id: window.id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("portal/availability DELETE error:", err);
    return NextResponse.json({ error: "Pencere silinemedi" }, { status: 500 });
  }
}
