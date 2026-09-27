// Maven Event Management — Generic API registry
// §58 Master Domain Graph'taki tüm modeller için tek CRUD sözleşmesi.
// Entity registry: isim → prisma delegate + include + arama alanları + audit.

import { db } from "@/lib/db";
import { encryptSecret } from "@/lib/secrets";
import { ActivityType } from "./activity";

type AnyDelegate = {
  findMany: (args?: Record<string, unknown>) => Promise<unknown[]>;
  findUnique: (args: Record<string, unknown>) => Promise<unknown>;
  findFirst: (args?: Record<string, unknown>) => Promise<unknown>;
  create: (args: Record<string, unknown>) => Promise<unknown>;
  update: (args: Record<string, unknown>) => Promise<unknown>;
  delete: (args: Record<string, unknown>) => Promise<unknown>;
  count: (args?: Record<string, unknown>) => Promise<number>;
};

export interface EntityConfig {
  delegate: AnyDelegate;
  include?: Record<string, unknown>;
  searchFields?: string[];          // serbest metin arama alanları (contains)
  relationSearch?: (q: string) => Record<string, unknown>; // ilişki-uzanan serbest arama (P2: registrations vb.)
  filterFields?: string[];          // ?field=value eşitlik filtreleri
  defaultWhere?: Record<string, unknown>; // tüm listeye uygulanan taban filtre (ör. MERGED kişileri gizle)
  orderBy?: Record<string, "asc" | "desc">;
  auditType?: string;               // aktivite günlüğü tipi
  auditMessage?: (data: Record<string, unknown>, action: "create" | "update" | "delete") => string;
  // S3: sır koruma — okumada maskeleme (password sızması yasak), yazmada şifreleme
  readMask?: (row: Record<string, unknown>) => Record<string, unknown>;
  writeTransform?: (data: Record<string, unknown>, isUpdate: boolean) => Promise<Record<string, unknown>> | Record<string, unknown>;
  // DÜZELTME (server-side validation): varlık-bazlı yazım sözleşmesi — null döner (geçerli)
  // ya da hata mesajı döner (400). UI devre dışı butonu güvenlik kontrolü DEĞİLDİR.
  validate?: (data: Record<string, unknown>, isUpdate: boolean) => string | null;
  // Eşzamanlılık kontrolü kancası (B2B randevu çakışması): create/update ÖNCESİ
  // async çakışma denetimi — hata mesajı dönerse 409 ile reddedilir. Inside the
  // hook: withLock(anahtar) + çakışan-aralık sorgusu (check-then-write serileştirme).
  beforeWrite?: (data: Record<string, unknown>, isUpdate: boolean, existingId?: string) => Promise<string | null>;
}

export const registry: Record<string, EntityConfig> = {
  // Faz C: kiracı (firma) kaydı — yalnız aktif kiracı okunabilir/güncellenebilir (tenant-guard "self")
  tenants: {
    delegate: db.tenant as unknown as AnyDelegate,
    filterFields: [],
  },
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
    // DÜZELTME (etkinlik tarih sözleşmesi): startDate ZORUNLU geçerli tarih; endDate
    // SEÇİMLİ — verilirse startDate'den önce OLAMAZ. update'te yalnız tarih anahtarları
    // gönderildiyse denetlenir (kısmi güncellemelerde mevcut değerle çapraz kontrol).
    validate: (data, isUpdate) => {
      const readDate = (v: unknown): Date | null => {
        if (v == null) return null;
        const d = new Date(String(v));
        return Number.isNaN(d.getTime()) ? null : d;
      };
      if (!isUpdate) {
        if (data.startDate == null) return "startDate zorunludur";
        const s = readDate(data.startDate);
        if (!s) return "startDate geçersiz bir tarih";
        const e = readDate(data.endDate);
        if (data.endDate != null && !e) return "endDate geçersiz bir tarih";
        if (e && e < s) return "endDate başlangıçtan önce olamaz";
      } else if ("startDate" in data || "endDate" in data) {
        const s = readDate(data.startDate);
        const e = readDate(data.endDate);
        if (data.startDate != null && !s) return "startDate geçersiz bir tarih";
        if (data.endDate != null && !e) return "endDate geçersiz bir tarih";
        if (s && e && e < s) return "endDate başlangıçtan önce olamaz";
      }
      return null;
    },
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
    // P2: searchFields YOK — q serbest araması ilişki-uzanan alanlarda çözülür:
    // teyit no (skaler) + kategori ad/kod (scalar ilişki) + katılımcı ad/soyad/e-posta (nested ilişki)
    relationSearch: (q: string) => ({
      OR: [
        { confirmationNo: { contains: q } },
        { category: { is: { name: { contains: q } } } },
        { category: { is: { code: { contains: q } } } },
        { participation: { is: { person: { is: { firstName: { contains: q } } } } } },
        { participation: { is: { person: { is: { lastName: { contains: q } } } } } },
        { participation: { is: { person: { is: { email: { contains: q } } } } } },
      ],
    }),
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
    filterFields: ["editionId", "status", "audience", "type", "isTemplate"],
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
  // Faz B: manuel gelir kalemleri — Expense aynası, GLR kodlu
  incomes: {
    delegate: db.income as unknown as AnyDelegate,
    include: { edition: { select: { id: true, name: true } } },
    searchFields: ["title", "payer", "code"],
    filterFields: ["editionId", "status", "category", "method"],
    orderBy: { incomeDate: "desc" },
    auditType: ActivityType.PAYMENT_SAVED,
    auditMessage: (d) => `Gelir güncellendi: ${d.title ?? ""} (${d.amount ?? 0} ${d.currency ?? "TRY"})`,
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
  // ─── MÜŞTERİ DATASI — kiracı-çapraz iletişim havuzu (katılımcılardan üretim + manuel) ───
  "customer-contacts": {
    delegate: db.customerContact as unknown as AnyDelegate,
    searchFields: ["displayName", "email", "phone", "company", "city"],
    filterFields: ["tenantId", "kind", "source", "sourceEditionId", "commsOptIn"],
    orderBy: { createdAt: "desc" },
    auditType: ActivityType.CAMPAIGN_SAVED,
    auditMessage: (d) => `Müşteri kontağı güncellendi: ${d.displayName ?? ""}`,
    // yazım normalizasyonu: e-posta küçük-harf (güçlü eşleştirme işaretiyle uyum)
    writeTransform: (data) => {
      const out = { ...data };
      if (typeof out.email === "string") out.email = out.email.trim().toLowerCase();
      if (typeof out.phone === "string") out.phone = out.phone.trim();
      if (typeof out.displayName === "string") out.displayName = out.displayName.trim();
      return out;
    },
    // sunucu-doğrulama: ad zorunlu + e-posta VEYA telefon en az biri + biçim denetimi
    validate: (data, isUpdate) => {
      const email = typeof data.email === "string" ? data.email.trim() : "";
      const phone = typeof data.phone === "string" ? data.phone.trim() : "";
      if (!isUpdate && !(typeof data.displayName === "string" && data.displayName.trim())) return "displayName zorunludur";
      if (!email && !phone) return "E-posta veya telefon en az biri zorunludur";
      if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return "E-posta biçimi geçersiz";
      return null;
    },
    // mükerrer kontak koruması: aynı kiracıda aynı e-posta/telefon → 409
    beforeWrite: async (data, isUpdate, existingId) => {
      const tenantId = typeof data.tenantId === "string" ? data.tenantId : null;
      if (!tenantId) return null;
      const clauses: Record<string, string>[] = [];
      if (typeof data.email === "string" && data.email.trim()) clauses.push({ email: data.email.trim().toLowerCase() });
      if (typeof data.phone === "string" && data.phone.trim()) clauses.push({ phone: data.phone.trim() });
      if (clauses.length === 0) return null;
      const dup = await db.customerContact.findFirst({
        where: {
          tenantId,
          OR: clauses,
          ...(isUpdate && existingId ? { id: { not: existingId } } : {}),
        },
        select: { id: true, displayName: true },
      });
      return dup ? `Bu e-posta/telefon müşteri datasında zaten mevcut: ${dup.displayName}` : null;
    },
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
    // S3: kimlik bilgisi asla düz metin sızmaz — password/passwordCipher MASKELİ döner
    readMask: (row: Record<string, unknown>) => {
      const hasCredential = Boolean(row.password || row.passwordCipher);
      const { password: _pw, passwordCipher: _pc, ...safe } = row;
      void _pw; void _pc;
      return { ...safe, hasPassword: hasCredential };
    },
    // S3: yazmada body.password şifrelenip passwordCipher'a taşınır; düz metin hiç yazılmaz
    writeTransform: (data: Record<string, unknown>, isUpdate: boolean) => {
      const out = { ...data };
      const pw = typeof out.password === "string" ? out.password.trim() : "";
      delete out.password;
      if (pw) {
        out.passwordCipher = encryptSecret(pw);
      } else if (isUpdate && out.clearPassword === true) {
        out.passwordCipher = null;
      }
      delete out.clearPassword;
      return out;
    },
  },
  "badge-designs": {
    delegate: db.badgeDesign as unknown as AnyDelegate,
    filterFields: ["editionId", "isActive"],
    orderBy: { createdAt: "desc" },
  },

  // ─── Genişletme dalgası 6: Sosyal & Tur Planı + B2B Planı ──
  "social-plans": {
    delegate: db.socialPlan as unknown as AnyDelegate,
    include: { announcements: { orderBy: { sentAt: "desc" }, take: 50 }, _count: { select: { announcements: true } } },
    searchFields: ["title", "venue", "meetingPoint"],
    filterFields: ["editionId", "kind", "type", "status", "isOfficial"],
    orderBy: { startsAt: "asc" },
  },
  "social-announcements": {
    delegate: db.socialPlanAnnouncement as unknown as AnyDelegate,
    include: { person: { select: { id: true, firstName: true, lastName: true, email: true, company: true, photoUrl: true } } },
    filterFields: ["planId", "personId", "channel", "response"],
    orderBy: { sentAt: "desc" },
  },
  "b2b-plans": {
    delegate: db.b2bPlan as unknown as AnyDelegate,
    include: { assignments: { include: { person: { select: { id: true, firstName: true, lastName: true, email: true, company: true, title: true, photoUrl: true } } }, orderBy: { createdAt: "asc" } }, _count: { select: { assignments: true } } },
    searchFields: ["subject", "venue", "location"],
    filterFields: ["editionId", "status", "isPrivate"],
    orderBy: { startsAt: "asc" },
    // Yazım sözleşmesi: endsAt verilirse startsAt'tan önce OLAMAZ.
    validate: (data) => {
      const read = (v: unknown): Date | null => (v == null ? null : new Date(String(v)));
      if (data.startsAt != null && Number.isNaN(read(data.startsAt)!.getTime())) return "startsAt geçersiz bir tarih";
      if (data.endsAt != null && Number.isNaN(read(data.endsAt)!.getTime())) return "endsAt geçersiz bir tarih";
      const s = read(data.startsAt);
      const e = read(data.endsAt);
      if (s && e && e < s) return "Bitiş saati başlangıçtan önce olamaz";
      return null;
    },
    // EŞZAMANLILIK KONTROLÜ (Concurrency Control): aynı edisyonda aynı masa/konumda
    // zaman-çakışan iki randevu YASAK. withLock ile check-then-write serileştirilir
    // (tek-örnek garantisi — tx-lock.ts sözleşmesi); @@unique([editionId,startsAt,location])
    // ise DB düzeyinde son savunma hattıdır. MySQL geçişinde FOR UPDATE aynı sözleşmeyi verir.
    beforeWrite: async (data, isUpdate, existingId) => {
      const { withLock } = await import("@/lib/tx-lock");
      const editionId = typeof data.editionId === "string" ? data.editionId : null;
      const location = typeof data.location === "string" && data.location.trim() ? data.location.trim().toLowerCase() : null;
      const startsAt = data.startsAt ? new Date(String(data.startsAt)) : null;
      const endsAtRaw = data.endsAt ? new Date(String(data.endsAt)) : null;
      if (!editionId || !startsAt || !location) return null; // kısıt kapsamı dışı — DB invariant yeter
      // çakışma aralığı: yeni randevu [s, e) — endsAt yoksa 30dk varsayılan pencere
      const endsAt = endsAtRaw && !Number.isNaN(endsAtRaw.getTime()) && endsAtRaw > startsAt ? endsAtRaw : new Date(startsAt.getTime() + 30 * 60_000);
      return withLock(`b2b:${editionId}:${location}`, async () => {
        // Prisma zaman-çakışmasını doğrudan ifade edemediğinden adaylar üstünde kesin aralık testi
        const candidates = await db.b2bPlan.findMany({
          where: {
            editionId,
            status: { not: "CANCELLED" },
            startsAt: { not: null },
            OR: [{ location: data.location as string }, ...(typeof data.location === "string" ? [{ location: data.location.trim() }] : [])],
            ...(isUpdate && existingId ? { id: { not: existingId } } : {}),
          },
          select: { id: true, subject: true, startsAt: true, endsAt: true, location: true },
          take: 200,
        });
        for (const c of candidates) {
          if (!c.startsAt) continue;
          const cStart = new Date(c.startsAt);
          const cEnd = c.endsAt && c.endsAt > cStart ? new Date(c.endsAt) : new Date(cStart.getTime() + 30 * 60_000);
          if (cStart < endsAt && cEnd > startsAt) {
            return `Çakışma: "${c.subject}" bu masada ${cStart.toLocaleString("tr-TR")} saatinde planlanmış — aynı masa/zaman aralığına çift kayıt atılamaz`;
          }
        }
        return null;
      });
    },
  },
  "b2b-assignments": {
    delegate: db.b2bAssignment as unknown as AnyDelegate,
    include: { person: { select: { id: true, firstName: true, lastName: true, email: true, company: true, title: true, photoUrl: true } }, plan: { select: { id: true, subject: true, startsAt: true, venue: true, location: true, status: true } } },
    filterFields: ["planId", "personId", "status", "role"],
    orderBy: { createdAt: "asc" },
  },
  "agency-groups": {
    delegate: db.agencyGroup as unknown as AnyDelegate,
    searchFields: ["primaryContactName", "primaryContactEmail"],
    filterFields: ["editionId", "agencyOrganizationId", "tenantId"],
    orderBy: { createdAt: "desc" },
  },
  "custom-field-definitions": {
    delegate: db.customFieldDefinition as unknown as AnyDelegate,
    searchFields: ["key", "label"],
    filterFields: ["entityType", "editionId", "tenantId"],
    orderBy: { displayOrder: "asc" },
  },
  "custom-field-values": {
    delegate: db.customFieldValue as unknown as AnyDelegate,
    include: { definition: true },
    filterFields: ["definitionId", "entityId"],
  },
  "event-person-roles": {
    delegate: db.eventPersonRole as unknown as AnyDelegate,
    filterFields: ["editionId", "personId", "roleCategory", "roleName"],
  },
};


// ─── Yardımcı: hangi alanlar güncellenebilir (id/createdAt hariç) ──────────
const FORBIDDEN = new Set(["id", "createdAt"]);

// P2 (yeni-fazlar 8): durum-makinesi alanları generic PUT ile DEĞİŞTİRİLEMEZ —
// ilgili geçişlerin sahibi flows aksiyonlarıdır (§38: doğrudan status değiştirme
// YASAK). POST etkilenmez (meşru ilk-yazımlar korunur); yalnız güncelleme yolu.
const IMMUTABLE_ON_UPDATE: Record<string, Set<string>> = {
  payments: new Set(["status", "amount", "currency", "orderId", "paidAt"]),
  registrations: new Set(["status", "orderId", "participationId", "categoryId"]),
  orders: new Set(["status", "totalAmount", "currency"]),
  entitlements: new Set(["status", "used", "reserved"]),
};

export function sanitize(data: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) {
    if (FORBIDDEN.has(k)) continue;
    if (v === undefined) continue;
    out[k] = v === "" ? null : v;
  }
  return out;
}

// P2: PUT yolu — sanitize + entity'ye özel durum-makinesi alan düşmesi.
// Düşülen alan varsa hata DÖNMEZ (mevcut UI sessizce status gönderiyor olabilir);
// alan yazılmaz ve yanıt meta'sında bildirilir (davranış-koruma + şeffaflık).
export function sanitizeForUpdate(entity: string, data: Record<string, unknown>): { data: Record<string, unknown>; dropped: string[] } {
  const base = sanitize(data);
  const immutable = IMMUTABLE_ON_UPDATE[entity];
  if (!immutable) return { data: base, dropped: [] };
  const dropped: string[] = [];
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(base)) {
    if (immutable.has(k)) {
      dropped.push(k);
      continue;
    }
    out[k] = v;
  }
  return { data: out, dropped };
}

// ─── Tenant otomatik doldurma ───────────────────────────────────────────────
// Tenant-kapsamlı modellerde istemci tenantId göndermese/boş gönderse bile
// tek kiracılı kurulumda ilk tenant ile doldurulur — aksi halde Prisma
// "Argument `tenant` is missing" hatası yeni etkinlik/seri/kişi/kurum
// oluşturmayı imkânsız kılar (bug: Yeni Etkinlik Oluşturulamadı).
const TENANT_SCOPED = new Set(["event-series", "editions", "people", "organizations", "mail-providers", "customer-contacts"]);

export async function withTenant(entity: string, data: Record<string, unknown>): Promise<Record<string, unknown>> {
  if (!TENANT_SCOPED.has(entity)) return data;
  const v = data.tenantId;
  if (typeof v === "string" && v.trim() !== "") return data;
  const tenant = await db.tenant.findFirst({ select: { id: true } });
  if (!tenant) throw new Error("Kiracı (tenant) bulunamadı — önce demo verisini yükleyin");
  return { ...data, tenantId: tenant.id };
}
