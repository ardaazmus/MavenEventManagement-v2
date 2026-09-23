// Maven Event Management — Generic API registry
// §58 Master Domain Graph'taki tüm modeller için tek CRUD sözleşmesi.
// Entity registry: isim → prisma delegate + include + arama alanları + audit.

import { db } from "@/lib/db";
import { ActivityType } from "./activity";

type AnyDelegate = {
  findMany: (args?: Record<string, unknown>) => Promise<unknown[]>;
  findUnique: (args: Record<string, unknown>) => Promise<unknown>;
  create: (args: Record<string, unknown>) => Promise<unknown>;
  update: (args: Record<string, unknown>) => Promise<unknown>;
  delete: (args: Record<string, unknown>) => Promise<unknown>;
  count: (args?: Record<string, unknown>) => Promise<number>;
};

export interface EntityConfig {
  delegate: AnyDelegate;
  include?: Record<string, unknown>;
  searchFields?: string[];          // serbest metin arama alanları (contains)
  filterFields?: string[];          // ?field=value eşitlik filtreleri
  defaultWhere?: Record<string, unknown>; // tüm listeye uygulanan taban filtre (ör. MERGED kişileri gizle)
  orderBy?: Record<string, "asc" | "desc">;
  auditType?: string;               // aktivite günlüğü tipi
  auditMessage?: (data: Record<string, unknown>, action: "create" | "update" | "delete") => string;
}

export const registry: Record<string, EntityConfig> = {
  organizations: {
    delegate: db.organization as unknown as AnyDelegate,
    include: { _count: { select: { eventAssignments: true, sponsorAgreements: true, contacts: true } } },
    searchFields: ["name", "city"],
    filterFields: ["tenantId", "type"],
    orderBy: { name: "asc" },
    auditType: ActivityType.ORG_SAVED,
    auditMessage: (d) => `Kurum güncellendi: ${d.name ?? ""}`,
  },
  people: {
    delegate: db.person as unknown as AnyDelegate,
    searchFields: ["firstName", "lastName", "email", "company"],
    filterFields: ["tenantId", "status", "country"],
    defaultWhere: { status: { not: "MERGED" }, mergedIntoId: null }, // birleştirilenler listelerde gizlenir (Kimlik kuralı)
    orderBy: { lastName: "asc" },
    auditType: ActivityType.PERSON_SAVED,
    auditMessage: (d) => `Kişi güncellendi: ${d.firstName ?? ""} ${d.lastName ?? ""}`,
  },
  "event-series": {
    delegate: db.eventSeries as unknown as AnyDelegate,
    searchFields: ["name"],
    filterFields: ["tenantId"],
    orderBy: { name: "asc" },
  },
  editions: {
    delegate: db.eventEdition as unknown as AnyDelegate,
    include: { series: true, capabilities: true, _count: { select: { participations: true, registrations: true, sponsorAgreements: true, sessions: true } } },
    searchFields: ["name", "city"],
    filterFields: ["tenantId", "seriesId", "status", "isPublished"],
    orderBy: { startDate: "desc" },
    auditType: ActivityType.EDITION_SAVED,
    auditMessage: (d) => `Etkinlik güncellendi: ${d.name ?? ""}`,
  },
  capabilities: {
    delegate: db.eventCapability as unknown as AnyDelegate,
    filterFields: ["editionId", "key", "enabled"],
  },
  "org-assignments": {
    delegate: db.eventOrganizationAssignment as unknown as AnyDelegate,
    include: { organization: true, edition: { select: { name: true } } },
    filterFields: ["editionId", "organizationId", "role"],
    auditType: ActivityType.ORG_ASSIGNMENT,
    auditMessage: (d) => `Kurum rolü atandı: ${d.role ?? ""}`,
  },
  participations: {
    delegate: db.eventParticipation as unknown as AnyDelegate,
    include: {
      person: true,
      registrations: { include: { category: true } },
      roleAssignments: true,
      badgeInstances: { include: { profile: true } },
      _count: { select: { scanEvents: true } },
    },
    filterFields: ["editionId", "personId", "attendance", "source"],
    auditType: ActivityType.PARTICIPATION_SAVED,
    auditMessage: () => `Katılım güncellendi`,
  },
  snapshots: {
    delegate: db.eventProfileSnapshot as unknown as AnyDelegate,
    filterFields: ["participationId"],
  },
  "registration-categories": {
    delegate: db.registrationCategory as unknown as AnyDelegate,
    include: { _count: { select: { registrations: true } } },
    filterFields: ["editionId", "isActive"],
    orderBy: { order: "asc" },
    auditType: ActivityType.CATEGORY_SAVED,
    auditMessage: (d) => `Kategori güncellendi: ${d.name ?? ""}`,
  },
  registrations: {
    delegate: db.registration as unknown as AnyDelegate,
    include: {
      participation: { include: { person: true } },
      category: true,
      entitlementClaims: { include: { entitlement: true } },
    },
    filterFields: ["editionId", "status", "categoryId", "source", "fundingSource"],
    orderBy: { createdAt: "desc" },
    auditType: ActivityType.REGISTRATION_SAVED,
    auditMessage: (d) => `Kayıt güncellendi: ${d.confirmationNo ?? ""}`,
  },
  "role-assignments": {
    delegate: db.eventRoleAssignment as unknown as AnyDelegate,
    filterFields: ["participationId", "role", "status"],
    auditType: ActivityType.ROLE_ASSIGNED,
    auditMessage: (d) => `Rol atandı: ${d.role ?? ""}`,
  },
  invitations: {
    delegate: db.invitation as unknown as AnyDelegate,
    include: { organization: true },
    filterFields: ["editionId", "status", "organizationId"],
    orderBy: { createdAt: "desc" },
    auditType: ActivityType.INVITATION_SENT,
    auditMessage: (d) => `Davet kaydı: ${d.fullName ?? d.email ?? ""}`,
  },
  forms: {
    delegate: db.formDefinition as unknown as AnyDelegate,
    include: { fields: { orderBy: { order: "asc" } }, _count: { select: { submissions: true } } },
    filterFields: ["editionId", "status", "audience", "type"],
    orderBy: { createdAt: "desc" },
    auditType: ActivityType.SUBMISSION_SAVED,
    auditMessage: (d) => `Form güncellendi: ${d.name ?? ""}`,
  },
  "form-submissions": {
    delegate: db.formSubmission as unknown as AnyDelegate,
    include: {
      form: { select: { id: true, name: true, type: true, status: true } },
      registration: { include: { category: true } },
    },
    searchFields: ["respondentName", "respondentEmail", "organization"],
    filterFields: ["formId", "editionId", "status", "source"],
    orderBy: { createdAt: "desc" },
    auditType: ActivityType.SUBMISSION_SAVED,
    auditMessage: (d) => `Form gönderisi güncellendi: ${d.respondentName ?? ""}`,
  },
  expenses: {
    delegate: db.expense as unknown as AnyDelegate,
    include: { edition: { select: { id: true, name: true } } },
    searchFields: ["title", "vendor", "code", "spentBy"],
    filterFields: ["editionId", "status", "category", "paymentMethod"],
    orderBy: { incurredAt: "desc" },
    auditType: ActivityType.PAYMENT_SAVED,
    auditMessage: (d) => `Gider güncellendi: ${d.title ?? ""} (${d.amount ?? 0} ${d.currency ?? "TRY"})`,
  },
  "form-fields": {
    delegate: db.formField as unknown as AnyDelegate,
    filterFields: ["formId"],
    orderBy: { order: "asc" },
  },
  "form-answers": {
    delegate: db.formAnswer as unknown as AnyDelegate,
    filterFields: ["formId", "fieldId", "participationId"],
  },
  "catalog-items": {
    delegate: db.catalogItem as unknown as AnyDelegate,
    filterFields: ["editionId", "category", "isActive"],
    orderBy: { name: "asc" },
  },
  entitlements: {
    delegate: db.entitlement as unknown as AnyDelegate,
    include: { ownerOrganization: true, claims: true },
    filterFields: ["editionId", "ownerOrganizationId", "type", "source"],
    auditType: ActivityType.ENTITLEMENT_SAVED,
    auditMessage: (d) => `Hak havuzu güncellendi: ${d.label ?? ""}`,
  },
  claims: {
    delegate: db.entitlementClaim as unknown as AnyDelegate,
    include: { entitlement: { include: { ownerOrganization: true } }, participation: { include: { person: true } }, registration: true },
    filterFields: ["entitlementId", "status", "participationId"],
    orderBy: { reservedAt: "desc" },
    auditType: ActivityType.CLAIM_SAVED,
    auditMessage: () => `Hak kullanımı güncellendi`,
  },
  orders: {
    delegate: db.order as unknown as AnyDelegate,
    include: { lines: true, payments: true, refunds: true, buyerOrganization: true },
    filterFields: ["editionId", "status", "buyerOrganizationId"],
    orderBy: { createdAt: "desc" },
    auditType: ActivityType.ORDER_SAVED,
    auditMessage: (d) => `Sipariş güncellendi: ${d.orderNo ?? ""}`,
  },
  "order-lines": {
    delegate: db.orderLine as unknown as AnyDelegate,
    filterFields: ["orderId", "participationId", "registrationId"],
  },
  payments: {
    delegate: db.payment as unknown as AnyDelegate,
    include: { order: true },
    filterFields: ["orderId", "status", "source"],
    orderBy: { createdAt: "desc" },
    auditType: ActivityType.PAYMENT_SAVED,
    auditMessage: (d) => `Ödeme kaydı: ${d.amount ?? ""} ${d.currency ?? "TRY"}`,
  },
  refunds: {
    delegate: db.refund as unknown as AnyDelegate,
    include: { order: true },
    filterFields: ["orderId", "status"],
    orderBy: { createdAt: "desc" },
    auditType: ActivityType.REFUND_SAVED,
    auditMessage: (d) => `İade kaydı: ${d.amount ?? ""}`,
  },
  "sponsor-tiers": {
    delegate: db.sponsorTierDefinition as unknown as AnyDelegate,
    include: { agreements: true },
    filterFields: ["editionId"],
    orderBy: { displayOrder: "asc" },
  },
  "sponsor-packages": {
    delegate: db.sponsorPackage as unknown as AnyDelegate,
    include: { tier: true, agreements: true },
    filterFields: ["editionId", "tierId"],
  },
  "sponsor-agreements": {
    delegate: db.sponsorAgreement as unknown as AnyDelegate,
    include: {
      organization: true,
      package: { include: { tier: true } },
      tier: true,
      deliverables: true,
      boothAllocations: { include: { boothUnit: true } },
    },
    filterFields: ["editionId", "organizationId", "status", "packageId", "tierId"],
    orderBy: { createdAt: "desc" },
    auditType: ActivityType.SPONSOR_AGREEMENT,
    auditMessage: (d) => `Sponsor sözleşmesi güncellendi: ${d.status ?? ""}`,
  },
  deliverables: {
    delegate: db.deliverable as unknown as AnyDelegate,
    include: { agreement: { include: { organization: true } } },
    filterFields: ["agreementId", "status", "type"],
    auditType: ActivityType.DELIVERABLE_SAVED,
    auditMessage: (d) => `Teslim güncellendi: ${d.name ?? ""}`,
  },
  hotels: {
    delegate: db.hotelProperty as unknown as AnyDelegate,
    include: { roomTypes: true, blocks: { include: { roomType: true, inventoryNights: { orderBy: { date: "asc" } } } } },
    filterFields: ["editionId"],
    auditType: ActivityType.HOTEL_SAVED,
    auditMessage: (d) => `Otel güncellendi: ${d.name ?? ""}`,
  },
  "room-types": {
    delegate: db.roomType as unknown as AnyDelegate,
    filterFields: ["hotelId"],
  },
  "room-blocks": {
    delegate: db.roomBlock as unknown as AnyDelegate,
    include: { roomType: true, inventoryNights: { orderBy: { date: "asc" } } },
    filterFields: ["hotelId"],
  },
  "inventory-nights": {
    delegate: db.inventoryNight as unknown as AnyDelegate,
    filterFields: ["blockId"],
    orderBy: { date: "asc" },
  },
  reservations: {
    delegate: db.reservation as unknown as AnyDelegate,
    include: { block: { include: { hotel: true, roomType: true } }, roomType: true, primaryGuest: { include: { person: true } }, occupancySlots: true },
    filterFields: ["editionId", "status", "blockId", "payerType"],
    orderBy: { checkIn: "asc" },
    auditType: ActivityType.RESERVATION_SAVED,
    auditMessage: (d) => `Rezervasyon güncellendi: ${d.guestName ?? ""}`,
  },
  "occupancy-slots": {
    delegate: db.occupancySlot as unknown as AnyDelegate,
    filterFields: ["reservationId", "participationId"],
  },
  "roommate-requests": {
    delegate: db.roommateRequest as unknown as AnyDelegate,
    filterFields: ["status"],
  },
  "scientific-setup": {
    delegate: db.scientificSetup as unknown as AnyDelegate,
    filterFields: ["editionId"],
    auditType: ActivityType.SCIENTIFIC_SAVED,
    auditMessage: () => `Bilimsel kurulum güncellendi`,
  },
  tracks: {
    delegate: db.track as unknown as AnyDelegate,
    include: { _count: { select: { submissions: true } } },
    filterFields: ["editionId"],
  },
  submissions: {
    delegate: db.submission as unknown as AnyDelegate,
    include: {
      track: true,
      submitter: true,
      authorships: true,
      reviewAssignments: { include: { reviewer: true, reviews: true } },
      decisions: { orderBy: { decidedAt: "desc" } },
    },
    searchFields: ["title", "code", "presentingAuthorName"],
    filterFields: ["editionId", "status", "trackId", "type", "fileStatus"],
    orderBy: { createdAt: "desc" },
    auditType: ActivityType.SUBMISSION_SAVED,
    auditMessage: (d) => `Bildiri güncellendi: ${d.title ?? ""}`,
  },
  authorships: {
    delegate: db.authorship as unknown as AnyDelegate,
    filterFields: ["submissionId", "personId"],
    orderBy: { position: "asc" },
  },
  "review-assignments": {
    delegate: db.reviewAssignment as unknown as AnyDelegate,
    include: { reviewer: true, reviews: true, submission: { select: { title: true, code: true } } },
    filterFields: ["submissionId", "status", "reviewerId"],
    auditType: ActivityType.REVIEW_SAVED,
    auditMessage: () => `Hakem ataması güncellendi`,
  },
  reviews: {
    delegate: db.review as unknown as AnyDelegate,
    filterFields: ["assignmentId"],
  },
  decisions: {
    delegate: db.decision as unknown as AnyDelegate,
    include: { submission: true },
    filterFields: ["submissionId", "decision"],
    orderBy: { decidedAt: "desc" },
    auditType: ActivityType.DECISION_SAVED,
    auditMessage: (d) => `Bilimsel karar: ${d.decision ?? ""}`,
  },
  rooms: {
    delegate: db.programRoom as unknown as AnyDelegate,
    include: { sessions: true },
    filterFields: ["editionId"],
  },
  sessions: {
    delegate: db.programSession as unknown as AnyDelegate,
    include: {
      room: true,
      track: true,
      submission: true,
      assignments: { include: { person: true, participation: { include: { person: true } } } },
      _count: { select: { scanEvents: true } },
    },
    searchFields: ["title"],
    filterFields: ["editionId", "status", "roomId", "trackId", "type", "isVisible"],
    orderBy: { startTime: "asc" },
    auditType: ActivityType.SESSION_SAVED,
    auditMessage: (d) => `Oturum güncellendi: ${d.title ?? ""}`,
  },
  "program-assignments": {
    delegate: db.programAssignment as unknown as AnyDelegate,
    include: { person: true, session: true, participation: { include: { person: true } } },
    filterFields: ["sessionId", "role", "status"],
    auditType: ActivityType.PROGRAM_ASSIGNMENT,
    auditMessage: (d) => `Program görevi atandı: ${d.role ?? ""}`,
  },
  "badge-profiles": {
    delegate: db.badgeProfile as unknown as AnyDelegate,
    include: { _count: { select: { badgeInstances: true } } },
    filterFields: ["editionId"],
  },
  "badge-instances": {
    delegate: db.badgeInstance as unknown as AnyDelegate,
    include: { profile: true, participation: { include: { person: true } } },
    filterFields: ["participationId", "status", "profileId"],
    auditType: ActivityType.BADGE_SAVED,
    auditMessage: (d) => `Yaka kartı güncellendi: ${d.status ?? ""}`,
  },
  credentials: {
    delegate: db.credential as unknown as AnyDelegate,
    include: { participation: { include: { person: true } }, badge: true },
    filterFields: ["participationId", "status"],
  },
  "scan-events": {
    delegate: db.scanEvent as unknown as AnyDelegate,
    include: { participation: { include: { person: true } }, session: true },
    filterFields: ["participationId", "sessionId", "location", "action", "result"],
    orderBy: { scannedAt: "desc" },
    auditType: ActivityType.SCAN_SAVED,
    auditMessage: (d) => `Tarama kaydı: ${d.action ?? ""}`,
  },
  "certificate-definitions": {
    delegate: db.certificateDefinition as unknown as AnyDelegate,
    include: { issues: true },
    filterFields: ["editionId", "isActive"],
    auditType: ActivityType.CERT_DEF_SAVED,
    auditMessage: (d) => `Sertifika kuralı güncellendi: ${d.name ?? ""}`,
  },
  "certificate-issues": {
    delegate: db.certificateIssue as unknown as AnyDelegate,
    include: { definition: true, participation: { include: { person: true } } },
    filterFields: ["definitionId", "status", "participationId"],
    auditType: ActivityType.CERT_ISSUE_SAVED,
    auditMessage: (d) => `Sertifika güncellendi: ${d.status ?? ""}`,
  },
  "booth-units": {
    delegate: db.boothUnit as unknown as AnyDelegate,
    include: { allocation: { include: { organization: true, agreement: true } }, floorObject: true },
    filterFields: ["editionId", "status"],
    orderBy: { code: "asc" },
    auditType: ActivityType.BOOTHS_SAVED,
    auditMessage: (d) => `Stant güncellendi: ${d.code ?? ""}`,
  },
  "booth-allocations": {
    delegate: db.boothAllocation as unknown as AnyDelegate,
    include: { boothUnit: true, organization: true, agreement: true },
    filterFields: ["status", "agreementId", "organizationId"],
    auditType: ActivityType.BOOTH_ALLOCATED,
    auditMessage: () => `Stand tahsisi güncellendi`,
  },
  "floor-objects": {
    delegate: db.floorPlanObject as unknown as AnyDelegate,
    filterFields: ["boothUnitId"],
  },
  campaigns: {
    delegate: db.campaign as unknown as AnyDelegate,
    filterFields: ["editionId", "status", "channel"],
    orderBy: { name: "asc" },
    auditType: ActivityType.CAMPAIGN_SAVED,
    auditMessage: (d) => `Kampanya güncellendi: ${d.name ?? ""}`,
  },
  tasks: {
    delegate: db.task as unknown as AnyDelegate,
    include: { assignee: true, edition: { select: { name: true } } },
    filterFields: ["editionId", "status", "priority", "module", "assigneeId"],
    orderBy: { dueDate: "asc" },
    auditType: ActivityType.TASK_SAVED,
    auditMessage: (d) => `Görev güncellendi: ${d.title ?? ""}`,
  },
  delegations: {
    delegate: db.delegation as unknown as AnyDelegate,
    include: { leader: true, billingOrganization: true, members: { include: { participation: { include: { person: true } } } } },
    filterFields: ["editionId", "type"],
  },
  "delegation-members": {
    delegate: db.delegationMember as unknown as AnyDelegate,
    filterFields: ["delegationId"],
  },
  companions: {
    delegate: db.companion as unknown as AnyDelegate,
    filterFields: ["participationId"],
  },
  activity: {
    delegate: db.activityLog as unknown as AnyDelegate,
    filterFields: ["tenantId", "editionId", "type"],
    orderBy: { createdAt: "desc" },
  },

  // ─── GENİŞLETME DALGASI (kullanıcı düşünce bulutu 1-9) ────────────────────
  "organization-contacts": {
    delegate: db.organizationContact as unknown as AnyDelegate,
    filterFields: ["organizationId", "role"],
    auditType: ActivityType.ORG_SAVED,
    auditMessage: (d) => `Kurum iletişim kişisi güncellendi: ${d.name ?? ""}`,
  },
  "custom-roles": {
    delegate: db.customRole as unknown as AnyDelegate,
    filterFields: ["editionId", "isActive"],
    orderBy: { hierarchyLevel: "asc" },
    auditType: ActivityType.ROLE_ASSIGNED,
    auditMessage: (d) => `Özel rol güncellendi: ${d.name ?? ""}`,
  },
  "cv-entries": {
    delegate: db.cvEntry as unknown as AnyDelegate,
    filterFields: ["personId", "editionId", "kind"],
    orderBy: { order: "asc" },
    auditType: ActivityType.PERSON_SAVED,
    auditMessage: (d) => `CV kaydı güncellendi: ${d.title ?? ""}`,
  },
  "session-materials": {
    delegate: db.sessionMaterial as unknown as AnyDelegate,
    filterFields: ["sessionId", "editionId", "type", "status"],
    orderBy: { order: "asc" },
    auditType: ActivityType.SESSION_SAVED,
    auditMessage: (d) => `Oturum materyali güncellendi: ${d.title ?? ""}`,
  },
  "media-folders": {
    delegate: db.mediaFolder as unknown as AnyDelegate,
    filterFields: ["editionId", "parentId"],
    orderBy: { name: "asc" },
  },
  "media-assets": {
    delegate: db.mediaAsset as unknown as AnyDelegate,
    searchFields: ["name", "tags"],
    filterFields: ["editionId", "folderId", "kind", "linkedType"],
    orderBy: { createdAt: "desc" },
  },
  "api-integrations": {
    delegate: db.apiIntegration as unknown as AnyDelegate,
    searchFields: ["name", "provider"],
    filterFields: ["tenantId", "editionId", "direction", "kind", "status"],
    orderBy: { createdAt: "desc" },
  },
  "integration-logs": {
    delegate: db.integrationLog as unknown as AnyDelegate,
    filterFields: ["integrationId", "direction", "ok"],
    orderBy: { createdAt: "desc" },
  },
  "email-templates": {
    delegate: db.emailTemplate as unknown as AnyDelegate,
    filterFields: ["editionId", "category", "phase", "isActive"],
    orderBy: { createdAt: "desc" },
  },
  "mail-providers": {
    delegate: db.mailProviderConfig as unknown as AnyDelegate,
    filterFields: ["tenantId", "kind", "status"],
    orderBy: { createdAt: "desc" },
  },
  "badge-designs": {
    delegate: db.badgeDesign as unknown as AnyDelegate,
    filterFields: ["editionId", "isActive"],
    orderBy: { createdAt: "desc" },
  },
};

// ─── Yardımcı: hangi alanlar güncellenebilir (id/createdAt hariç) ──────────
const FORBIDDEN = new Set(["id", "createdAt"]);

export function sanitize(data: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) {
    if (FORBIDDEN.has(k)) continue;
    if (v === undefined) continue;
    out[k] = v === "" ? null : v;
  }
  return out;
}
