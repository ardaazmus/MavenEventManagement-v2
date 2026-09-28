// Görüşme talepleri — katılımcı talep açar, sponsor karar verir.
// GET: SPONSOR jetonu kendi anlaşmalarının taleplerini, PARTICIPANT jetonu
// kendi taleplerini görür. POST: katılımcı talep açar (REQUESTED).
// Talep eden kişi iletişimi açıkça paylaşmış sayılır (görüşme bağlamı) —
// sponsor görünümünde talepçi e-posta/telefon maskesizdir.
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { resolvePublicEdition } from "@/lib/api/public-guard";
import { extractToken, validatePortalToken, touchToken } from "@/lib/api/portal-tokens";
import { checkSponsorScope, agreementFilter } from "@/lib/portal/sponsor-scope";
import { validateSlot, validateTimezone, slotWithinWindows } from "@/lib/meetings/requests";
import { ActivityType } from "@/lib/api/activity";
import { enforceRateLimit } from "@/lib/rate-limit";

const MEETINGABLE = ["CONTRACTED", "ACTIVE"];
const DAY_MS = 86_400_000;

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const editionId = sp.get("editionId");
    if (!editionId) return NextResponse.json({ error: "editionId zorunlu" }, { status: 400 });

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
    if (token.editionId !== editionId) {
      return NextResponse.json({ error: "Etkinlik bulunamadı" }, { status: 404 });
    }
    touchToken(token.id);

    const publicEdition = await resolvePublicEdition(editionId);
    if (!publicEdition) return NextResponse.json({ error: "Etkinlik bulunamadı" }, { status: 404 });

    if (token.scope === "SPONSOR") {
      const organizationId = sp.get("organizationId");
      if (!organizationId) return NextResponse.json({ error: "organizationId zorunlu" }, { status: 400 });
      if (!checkSponsorScope(token, { editionId, organizationId }).ok) {
        return NextResponse.json({ error: "Etkinlik bulunamadı" }, { status: 404 });
      }
      const scopeFilter = agreementFilter(token);
      const items = await db.meetingRequest.findMany({
        where: {
          editionId,
          agreement: { organizationId, ...(scopeFilter.id ? { id: scopeFilter.id } : {}) },
        },
        include: {
          requester: { select: { firstName: true, lastName: true, email: true, phone: true, company: true, title: true } },
          agreement: { select: { id: true } },
        },
        orderBy: { slotStart: "asc" },
        take: 500,
      });
      return NextResponse.json({ items });
    }

    if (token.scope === "PARTICIPANT" && token.personId) {
      const items = await db.meetingRequest.findMany({
        where: { editionId, requesterPersonId: token.personId },
        include: { agreement: { select: { id: true, organization: { select: { name: true } } } } },
        orderBy: { slotStart: "asc" },
        take: 200,
      });
      return NextResponse.json({
        items: items.map((m) => ({
          id: m.id, agreementId: m.agreementId, sponsorName: m.agreement.organization.name,
          title: m.title, slotStart: m.slotStart, slotEnd: m.slotEnd, location: m.location,
          note: m.note, status: m.status, decidedAt: m.decidedAt, createdAt: m.createdAt,
        })),
      });
    }

    return NextResponse.json({ error: "Etkinlik bulunamadı" }, { status: 404 });
  } catch (err) {
    console.error("portal/meetings GET error:", err);
    return NextResponse.json({ error: "Görüşme listesi alınamadı" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const denied = enforceRateLimit(req, { key: "portal-meetings", limit: 20, windowMs: 60_000 });
    if (denied) return denied;
    const body = (await req.json()) as Record<string, unknown>;
    const editionId = body.editionId;
    const agreementId = body.agreementId;
    if (typeof editionId !== "string" || !editionId) {
      return NextResponse.json({ error: "editionId zorunlu" }, { status: 400 });
    }
    if (typeof agreementId !== "string" || !agreementId) {
      return NextResponse.json({ error: "agreementId zorunlu" }, { status: 400 });
    }

    const raw = extractToken(req) ?? (typeof body.token === "string" ? body.token : null);
    if (!raw) return NextResponse.json({ error: "Erişim belirteci geçersiz" }, { status: 404 });
    const check = await validatePortalToken(raw);
    if (!check.ok) return NextResponse.json({ error: "Erişim belirteci geçersiz" }, { status: 404 });
    const token = check.token;
    // katılımcı talebi: PARTICIPANT jetonu + kendi edisyonu + kişi bağlı
    if (token.scope !== "PARTICIPANT" || !token.personId || token.editionId !== editionId) {
      return NextResponse.json({ error: "Erişim belirteci geçersiz" }, { status: 404 });
    }
    touchToken(token.id);

    const publicEdition = await resolvePublicEdition(editionId);
    if (!publicEdition) return NextResponse.json({ error: "Etkinlik bulunamadı" }, { status: 404 });

    const agreement = await db.sponsorAgreement.findFirst({
      where: { id: agreementId, editionId },
      select: { id: true, status: true, organization: { select: { name: true } } },
    });
    if (!agreement) return NextResponse.json({ error: "Anlaşma bulunamadı" }, { status: 404 });
    if (!MEETINGABLE.includes(agreement.status)) {
      return NextResponse.json({ error: "Bu sponsor şu an görüşme kabul etmiyor" }, { status: 409 });
    }

    const participation = await db.eventParticipation.findFirst({
      where: { editionId, personId: token.personId },
      select: { id: true },
    });
    if (!participation) return NextResponse.json({ error: "Katılım bulunamadı" }, { status: 404 });

    if (typeof body.slotStart !== "string" || typeof body.slotEnd !== "string") {
      return NextResponse.json({ error: "slotStart/slotEnd zorunlu" }, { status: 400 });
    }
    const slot = validateSlot({ slotStart: body.slotStart, slotEnd: body.slotEnd });
    if (!slot.ok) return NextResponse.json({ error: slot.error }, { status: slot.status });
    const tz = validateTimezone(body.timezone);
    if (!tz.ok) return NextResponse.json({ error: tz.error }, { status: 400 });

    // P20.3: pencere tanımlıysa talep pencere içinde olmalı (gerçek an karşılaştırması)
    const windows = await db.sponsorAvailability.findMany({
      where: { editionId, agreementId: agreement.id },
      select: { slotStart: true, slotEnd: true },
    });
    if (!slotWithinWindows(slot.start, slot.end, windows)) {
      return NextResponse.json({ error: "Talep edilen saat sponsorun uygunluk penceresi dışında" }, { status: 409 });
    }

    const edition = await db.eventEdition.findUnique({
      where: { id: editionId },
      select: { startDate: true, endDate: true },
    });
    if (edition?.startDate && slot.start.getTime() < edition.startDate.getTime() - DAY_MS) {
      return NextResponse.json({ error: "Görüşme etkinlik döneminin dışında" }, { status: 400 });
    }
    if (edition?.endDate && slot.end.getTime() > edition.endDate.getTime() + DAY_MS) {
      return NextResponse.json({ error: "Görüşme etkinlik döneminin dışında" }, { status: 400 });
    }

    const str = (v: unknown, max: number): string | null => {
      if (typeof v !== "string") return null;
      const s = v.trim();
      if (!s) return null;
      return s.slice(0, max);
    };
    const meeting = await db.meetingRequest.create({
      data: {
        editionId,
        agreementId: agreement.id,
        requesterPersonId: token.personId,
        title: str(body.title, 200),
        slotStart: slot.start,
        slotEnd: slot.end,
        timezone: tz.timezone,
        location: str(body.location, 200),
        note: str(body.note, 1000),
      },
    });
    await db.activityLog.create({
      data: {
        type: ActivityType.MEETING_SAVED,
        editionId,
        message: `Portal: görüşme talebi — ${agreement.organization?.name ?? ""} (${meeting.id.slice(-6)})`,
        entityType: "MeetingRequest",
        entityId: meeting.id,
        actorName: "Katılımcı Portalı",
      },
    });
    return NextResponse.json({ ok: true, meeting }, { status: 201 });
  } catch (err) {
    console.error("portal/meetings POST error:", err);
    return NextResponse.json({ error: "Görüşme talebi açılamadı" }, { status: 500 });
  }
}
