// /api/notifications — Aktivite günlüğünden türetilen bildirim merkezi (§47 domain event → UI bildirim)
// GET ?editionId=&limit= → son olaylar + önem seviyesi + hedef modül (zil menüsü tıklanınca ilgili ekrana gider)
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// önem seviyesi — tip bazlı (kalanlar teal/normal)
const SEVERITY_MAP: Record<string, "rose" | "amber" | "emerald" | "teal"> = {
  REGISTRATION_CANCELLED: "rose",
  SCAN_DENIED: "rose",
  REFUND_SAVED: "rose",
  REGISTRATION_CONFIRMED: "emerald",
  PAYMENT_RECEIVED: "emerald",
  EDITION_PUBLISHED: "emerald",
  SCAN_ALLOWED: "emerald",
  CERT_ISSUE_SAVED: "emerald",
  CLAIM_SAVED: "amber",
  PAYMENT_SAVED: "amber",
  CAPABILITY_TOGGLED: "amber",
  CME_SAVED: "amber",
};

// entityType → hedef modül (zil tıklanınca SPA navigasyonu)
const MODULE_MAP: Record<string, string> = {
  Registration: "registrations",
  WaitlistEntry: "registrations",
  Invitation: "registrations",
  EventParticipation: "registrations",
  Payment: "finance",
  Order: "finance",
  Refund: "finance",
  Expense: "accounting",
  Entitlement: "sponsorship",
  EntitlementClaim: "sponsorship",
  SponsorAgreement: "sponsorship",
  Deliverable: "sponsorship",
  BoothAllocation: "sponsorship",
  BoothUnit: "sponsorship",
  Submission: "scientific",
  Review: "scientific",
  Decision: "scientific",
  Authorship: "scientific",
  ProgramSession: "program",
  ProgramRoom: "program",
  Reservation: "accommodation",
  HotelProperty: "accommodation",
  ScanEvent: "onsite",
  BadgeInstance: "badges",
  BadgeProfile: "badges",
  Credential: "onsite",
  CertificateDefinition: "certificates",
  CertificateIssue: "certificates",
  FormSubmission: "forms",
  FormDefinition: "forms",
  Person: "people",
  Delegation: "people",
  Organization: "organizations",
  Task: "operations",
  Campaign: "communications",
  EventEdition: "editions",
  EventCapability: "settings",
  Tenant: "settings",
};

// entityType boş bırakılmış günlük kayıtları için tip bazlı yedek eşleme
const TYPE_MODULE_MAP: Record<string, string> = {
  REGISTRATION_CONFIRMED: "registrations",
  REGISTRATION_SAVED: "registrations",
  REGISTRATION_CANCELLED: "registrations",
  CATEGORY_SAVED: "registrations",
  INVITATION_SENT: "communications",
  CLAIM_SAVED: "sponsorship",
  ENTITLEMENT_SAVED: "sponsorship",
  SPONSOR_AGREEMENT: "sponsorship",
  DELIVERABLE_SAVED: "sponsorship",
  BOOTH_ALLOCATED: "sponsorship",
  BOOTHS_SAVED: "sponsorship",
  ORDER_SAVED: "finance",
  PAYMENT_SAVED: "finance",
  PAYMENT_RECEIVED: "finance",
  REFUND_SAVED: "finance",
  SUBMISSION_SAVED: "scientific",
  REVIEW_SAVED: "scientific",
  DECISION_SAVED: "scientific",
  SESSION_SAVED: "program",
  PROGRAM_ASSIGNMENT: "program",
  CME_SAVED: "program",
  HOTEL_SAVED: "accommodation",
  RESERVATION_SAVED: "accommodation",
  BADGE_SAVED: "badges",
  SCAN_SAVED: "onsite",
  SCAN_ALLOWED: "onsite",
  SCAN_DENIED: "onsite",
  CERT_DEF_SAVED: "certificates",
  CERT_ISSUE_SAVED: "certificates",
  PERSON_SAVED: "people",
  PERSON_MERGED: "people",
  ORG_SAVED: "organizations",
  ORG_ASSIGNMENT: "organizations",
  EDITION_CREATED: "editions",
  EDITION_SAVED: "editions",
  EDITION_PUBLISHED: "editions",
  CAPABILITY_TOGGLED: "settings",
  CAMPAIGN_SAVED: "communications",
};

function moduleFor(entityType?: string | null, type?: string): string | null {
  if (entityType && MODULE_MAP[entityType]) return MODULE_MAP[entityType];
  if (type && TYPE_MODULE_MAP[type]) return TYPE_MODULE_MAP[type];
  return null;
}

export async function GET(req: NextRequest) {
  try {
    const editionId = req.nextUrl.searchParams.get("editionId");
    const limitParam = Number(req.nextUrl.searchParams.get("limit") ?? 25);
    const limit = Number.isFinite(limitParam) && limitParam > 0 && limitParam <= 100 ? limitParam : 25;

    const items = await db.activityLog.findMany({
      where: editionId ? { editionId } : {},
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    return NextResponse.json({
      items: items.map((a) => ({
        id: a.id,
        type: a.type,
        message: a.message,
        actorName: a.actorName,
        entityType: a.entityType,
        createdAt: a.createdAt.toISOString(),
        severity: SEVERITY_MAP[a.type] ?? "teal",
        module: moduleFor(a.entityType, a.type),
      })),
    });
  } catch (e) {
    console.error("GET /api/notifications", e);
    return NextResponse.json({ error: "Bildirimler okunamadı" }, { status: 500 });
  }
}
