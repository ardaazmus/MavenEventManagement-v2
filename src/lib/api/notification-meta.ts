// Bildirim meta — severity ve hedef modül eşlemeleri (paylaşılan)
// /api/notifications (REST okuma) ve lib/db.ts canlı yayın kancası aynı dili konuşur.
// §47 domain event → UI bildirim sözleşmesi tek yerde tanımlı olur.

export type NotifSeverity = "rose" | "amber" | "emerald" | "teal";

// önem seviyesi — tip bazlı (kalanlar teal/normal)
export const SEVERITY_MAP: Record<string, NotifSeverity> = {
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
export const MODULE_MAP: Record<string, string> = {
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
  BoothAllocation: "floors",
  BoothUnit: "floors",
  FloorPlanObject: "floors",
  "booth-units": "floors",
  "booth-allocations": "floors",
  "floor-objects": "floors",
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
export const TYPE_MODULE_MAP: Record<string, string> = {
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

export function moduleFor(entityType?: string | null, type?: string): string | null {
  if (entityType && MODULE_MAP[entityType]) return MODULE_MAP[entityType];
  if (type && TYPE_MODULE_MAP[type]) return TYPE_MODULE_MAP[type];
  return null;
}

export function severityFor(type: string): NotifSeverity {
  return SEVERITY_MAP[type] ?? "teal";
}
