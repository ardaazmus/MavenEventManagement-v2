// ─── P04.1: Merkezi Yetki Sözlüğü (Action & Module Registry) ─────────────────
// §7.2 / P04.1: 26 modül için eylem kümesi:
//   VIEW, CREATE, UPDATE, DELETE, EXPORT, APPROVE, MANAGE
// Registry'deki tüm entity'ler bu modüllere ve eylemlere eşlenir.
// Bilinmeyen veya kayıtsız entity'ler için DENY-BY-DEFAULT.

export const ACTIONS = [
  "VIEW",
  "CREATE",
  "UPDATE",
  "DELETE",
  "EXPORT",
  "APPROVE",
  "MANAGE",
] as const;

export type Action = (typeof ACTIONS)[number];

export const MODULE_IDS = [
  "dashboard",
  "operations",
  "archive",
  "editions",
  "settings",
  "portals",
  "compliance",
  "integrations",
  "people",
  "organizations",
  "communications",
  "registrations",
  "forms",
  "finance",
  "accounting",
  "scientific",
  "program",
  "social",
  "sponsorship",
  "b2b",
  "floors",
  "media",
  "accommodation",
  "onsite",
  "badges",
  "certificates",
] as const;

export type ModuleId = (typeof MODULE_IDS)[number];

export interface EntityPolicy {
  module: ModuleId;
  allowedActions: readonly Action[];
  scopeType: "TENANT" | "EDITION" | "GLOBAL";
}

export function actionForMethod(method: string, isExport = false): Action {
  if (isExport) return "EXPORT";
  const m = method.toUpperCase();
  switch (m) {
    case "GET":
    case "HEAD":
      return "VIEW";
    case "POST":
      return "CREATE";
    case "PUT":
    case "PATCH":
      return "UPDATE";
    case "DELETE":
      return "DELETE";
    default:
      return "VIEW";
  }
}

export const ENTITY_POLICY_MAP: Record<string, EntityPolicy> = {
  // Settings & Tenant Management
  tenants: { module: "settings", allowedActions: ACTIONS, scopeType: "TENANT" },
  "custom-field-definitions": { module: "settings", allowedActions: ACTIONS, scopeType: "TENANT" },
  "custom-field-values": { module: "settings", allowedActions: ACTIONS, scopeType: "TENANT" },

  // Organizations (CRM)
  organizations: { module: "organizations", allowedActions: ACTIONS, scopeType: "TENANT" },
  "organization-contacts": { module: "organizations", allowedActions: ACTIONS, scopeType: "TENANT" },

  // People (CRM)
  people: { module: "people", allowedActions: ACTIONS, scopeType: "TENANT" },
  "cv-entries": { module: "people", allowedActions: ACTIONS, scopeType: "TENANT" },

  // Editions & Series Setup
  "event-series": { module: "editions", allowedActions: ACTIONS, scopeType: "TENANT" },
  editions: { module: "editions", allowedActions: ACTIONS, scopeType: "TENANT" },
  capabilities: { module: "editions", allowedActions: ACTIONS, scopeType: "EDITION" },
  "org-assignments": { module: "editions", allowedActions: ACTIONS, scopeType: "EDITION" },

  // Registrations & Attendees
  participations: { module: "registrations", allowedActions: ACTIONS, scopeType: "EDITION" },
  snapshots: { module: "registrations", allowedActions: ACTIONS, scopeType: "EDITION" },
  "registration-categories": { module: "registrations", allowedActions: ACTIONS, scopeType: "EDITION" },
  registrations: { module: "registrations", allowedActions: ACTIONS, scopeType: "EDITION" },
  "role-assignments": { module: "registrations", allowedActions: ACTIONS, scopeType: "EDITION" },
  invitations: { module: "registrations", allowedActions: ACTIONS, scopeType: "EDITION" },
  entitlements: { module: "registrations", allowedActions: ACTIONS, scopeType: "EDITION" },
  claims: { module: "registrations", allowedActions: ACTIONS, scopeType: "EDITION" },
  delegations: { module: "registrations", allowedActions: ACTIONS, scopeType: "EDITION" },
  "delegation-members": { module: "registrations", allowedActions: ACTIONS, scopeType: "EDITION" },
  companions: { module: "registrations", allowedActions: ACTIONS, scopeType: "EDITION" },
  "custom-roles": { module: "registrations", allowedActions: ACTIONS, scopeType: "EDITION" },
  "agency-groups": { module: "registrations", allowedActions: ACTIONS, scopeType: "EDITION" },
  "event-person-roles": { module: "registrations", allowedActions: ACTIONS, scopeType: "EDITION" },

  // Forms
  forms: { module: "forms", allowedActions: ACTIONS, scopeType: "EDITION" },
  "form-submissions": { module: "forms", allowedActions: ACTIONS, scopeType: "EDITION" },
  "form-fields": { module: "forms", allowedActions: ACTIONS, scopeType: "EDITION" },
  "form-answers": { module: "forms", allowedActions: ACTIONS, scopeType: "EDITION" },

  // Finance & Accounting
  expenses: { module: "finance", allowedActions: ACTIONS, scopeType: "EDITION" },
  incomes: { module: "finance", allowedActions: ACTIONS, scopeType: "EDITION" },
  "catalog-items": { module: "finance", allowedActions: ACTIONS, scopeType: "EDITION" },
  orders: { module: "finance", allowedActions: ACTIONS, scopeType: "EDITION" },
  "order-lines": { module: "finance", allowedActions: ACTIONS, scopeType: "EDITION" },
  payments: { module: "finance", allowedActions: ACTIONS, scopeType: "EDITION" },
  refunds: { module: "finance", allowedActions: ACTIONS, scopeType: "EDITION" },

  // Sponsorship & Exhibitor
  "sponsor-tiers": { module: "sponsorship", allowedActions: ACTIONS, scopeType: "EDITION" },
  "sponsor-packages": { module: "sponsorship", allowedActions: ACTIONS, scopeType: "EDITION" },
  "sponsor-agreements": { module: "sponsorship", allowedActions: ACTIONS, scopeType: "EDITION" },
  deliverables: { module: "sponsorship", allowedActions: ACTIONS, scopeType: "EDITION" },
  "booth-units": { module: "sponsorship", allowedActions: ACTIONS, scopeType: "EDITION" },
  "booth-allocations": { module: "sponsorship", allowedActions: ACTIONS, scopeType: "EDITION" },

  // Floor Studio
  "floor-objects": { module: "floors", allowedActions: ACTIONS, scopeType: "EDITION" },

  // Accommodation
  hotels: { module: "accommodation", allowedActions: ACTIONS, scopeType: "EDITION" },
  "room-types": { module: "accommodation", allowedActions: ACTIONS, scopeType: "EDITION" },
  "room-blocks": { module: "accommodation", allowedActions: ACTIONS, scopeType: "EDITION" },
  "inventory-nights": { module: "accommodation", allowedActions: ACTIONS, scopeType: "EDITION" },
  reservations: { module: "accommodation", allowedActions: ACTIONS, scopeType: "EDITION" },
  "occupancy-slots": { module: "accommodation", allowedActions: ACTIONS, scopeType: "EDITION" },
  "roommate-requests": { module: "accommodation", allowedActions: ACTIONS, scopeType: "EDITION" },

  // Scientific Submissions & Reviews
  "scientific-setup": { module: "scientific", allowedActions: ACTIONS, scopeType: "EDITION" },
  tracks: { module: "scientific", allowedActions: ACTIONS, scopeType: "EDITION" },
  submissions: { module: "scientific", allowedActions: ACTIONS, scopeType: "EDITION" },
  authorships: { module: "scientific", allowedActions: ACTIONS, scopeType: "EDITION" },
  "review-assignments": { module: "scientific", allowedActions: ACTIONS, scopeType: "EDITION" },
  reviews: { module: "scientific", allowedActions: ACTIONS, scopeType: "EDITION" },
  decisions: { module: "scientific", allowedActions: ACTIONS, scopeType: "EDITION" },

  // Program & Sessions
  rooms: { module: "program", allowedActions: ACTIONS, scopeType: "EDITION" },
  sessions: { module: "program", allowedActions: ACTIONS, scopeType: "EDITION" },
  "program-assignments": { module: "program", allowedActions: ACTIONS, scopeType: "EDITION" },
  "session-materials": { module: "program", allowedActions: ACTIONS, scopeType: "EDITION" },

  // Social & Tour Plans
  "social-plans": { module: "social", allowedActions: ACTIONS, scopeType: "EDITION" },
  "social-announcements": { module: "social", allowedActions: ACTIONS, scopeType: "EDITION" },

  // B2B Meetings
  "b2b-plans": { module: "b2b", allowedActions: ACTIONS, scopeType: "EDITION" },
  "b2b-assignments": { module: "b2b", allowedActions: ACTIONS, scopeType: "EDITION" },

  // Badges
  "badge-profiles": { module: "badges", allowedActions: ACTIONS, scopeType: "EDITION" },
  "badge-instances": { module: "badges", allowedActions: ACTIONS, scopeType: "EDITION" },
  "badge-designs": { module: "badges", allowedActions: ACTIONS, scopeType: "EDITION" },

  // Onsite & Scanning
  credentials: { module: "onsite", allowedActions: ACTIONS, scopeType: "EDITION" },
  "scan-events": { module: "onsite", allowedActions: ACTIONS, scopeType: "EDITION" },

  // Certificates
  "certificate-definitions": { module: "certificates", allowedActions: ACTIONS, scopeType: "EDITION" },
  "certificate-issues": { module: "certificates", allowedActions: ACTIONS, scopeType: "EDITION" },

  // Communications & Campaigns
  campaigns: { module: "communications", allowedActions: ACTIONS, scopeType: "EDITION" },
  "customer-contacts": { module: "communications", allowedActions: ACTIONS, scopeType: "TENANT" },
  "email-templates": { module: "communications", allowedActions: ACTIONS, scopeType: "EDITION" },
  "mail-providers": { module: "communications", allowedActions: ACTIONS, scopeType: "TENANT" },

  // Media
  "media-folders": { module: "media", allowedActions: ACTIONS, scopeType: "EDITION" },
  "media-assets": { module: "media", allowedActions: ACTIONS, scopeType: "EDITION" },

  // Operations
  tasks: { module: "operations", allowedActions: ACTIONS, scopeType: "EDITION" },
  activity: { module: "operations", allowedActions: ACTIONS, scopeType: "EDITION" },

  // Integrations
  "api-integrations": { module: "integrations", allowedActions: ACTIONS, scopeType: "TENANT" },
  "integration-logs": { module: "integrations", allowedActions: ACTIONS, scopeType: "TENANT" },
};

// ─── P04.2: Rol Kümeleri & Modül Yetkileri ────────────────────────────────────
export const ADMIN_ROLES = new Set(["ORG_OWNER", "ORG_ADMIN"]);

export const STAFF_ROLES = new Set([
  "ORG_OWNER",
  "ORG_ADMIN",
  "EVENT_MANAGER",
  "FINANCE_MANAGER",
  "REGISTRATION_MANAGER",
  "SPONSORSHIP_MANAGER",
  "SCIENTIFIC_MANAGER",
  "PROGRAM_MANAGER",
  "ONSITE_MANAGER",
]);

export const READONLY_ROLES = new Set(["VIEWER", "OBSERVER", "AUDITOR"]);

export const PARTICIPANT_ROLES = new Set([
  "ATTENDEE",
  "PARTICIPANT",
  "AUTHOR",
  "REVIEWER",
  "SPEAKER",
  "MODERATOR",
  "SESSION_CHAIR",
  "PANELIST",
  "COMMITTEE_MEMBER",
  "VIP",
  "PRESS",
  "DELEGATE",
  "EXHIBITOR_STAFF",
]);

export const MODULE_ALLOWED_ROLES: Record<ModuleId, readonly string[] | "*"> = {
  dashboard: "*",
  operations: "*",
  archive: "*",
  editions: "*",
  settings: "*",
  portals: "*",
  compliance: ["ORG_OWNER", "ORG_ADMIN", "EVENT_MANAGER"],
  integrations: ["ORG_OWNER", "ORG_ADMIN"],
  people: "*",
  organizations: "*",
  communications: [
    "ORG_OWNER",
    "ORG_ADMIN",
    "EVENT_MANAGER",
    "REGISTRATION_MANAGER",
    "SPONSORSHIP_MANAGER",
    "SCIENTIFIC_MANAGER",
    "PROGRAM_MANAGER",
  ],
  registrations: [
    "ORG_OWNER",
    "ORG_ADMIN",
    "EVENT_MANAGER",
    "FINANCE_MANAGER",
    "REGISTRATION_MANAGER",
    "ONSITE_MANAGER",
  ],
  forms: "*",
  finance: [
    "ORG_OWNER",
    "ORG_ADMIN",
    "EVENT_MANAGER",
    "FINANCE_MANAGER",
    "REGISTRATION_MANAGER",
  ],
  accounting: [
    "ORG_OWNER",
    "ORG_ADMIN",
    "EVENT_MANAGER",
    "FINANCE_MANAGER",
  ],
  scientific: [
    "ORG_OWNER",
    "ORG_ADMIN",
    "EVENT_MANAGER",
    "SCIENTIFIC_MANAGER",
    "PROGRAM_MANAGER",
  ],
  program: [
    "ORG_OWNER",
    "ORG_ADMIN",
    "EVENT_MANAGER",
    "SCIENTIFIC_MANAGER",
    "PROGRAM_MANAGER",
  ],
  social: [
    "ORG_OWNER",
    "ORG_ADMIN",
    "EVENT_MANAGER",
    "PROGRAM_MANAGER",
  ],
  sponsorship: [
    "ORG_OWNER",
    "ORG_ADMIN",
    "EVENT_MANAGER",
    "SPONSORSHIP_MANAGER",
    "FINANCE_MANAGER",
  ],
  b2b: [
    "ORG_OWNER",
    "ORG_ADMIN",
    "EVENT_MANAGER",
    "SPONSORSHIP_MANAGER",
  ],
  floors: [
    "ORG_OWNER",
    "ORG_ADMIN",
    "EVENT_MANAGER",
    "SPONSORSHIP_MANAGER",
    "PROGRAM_MANAGER",
    "ONSITE_MANAGER",
  ],
  media: "*",
  accommodation: [
    "ORG_OWNER",
    "ORG_ADMIN",
    "EVENT_MANAGER",
    "ONSITE_MANAGER",
    "REGISTRATION_MANAGER",
  ],
  onsite: [
    "ORG_OWNER",
    "ORG_ADMIN",
    "EVENT_MANAGER",
    "ONSITE_MANAGER",
  ],
  badges: [
    "ORG_OWNER",
    "ORG_ADMIN",
    "EVENT_MANAGER",
    "ONSITE_MANAGER",
    "REGISTRATION_MANAGER",
  ],
  certificates: [
    "ORG_OWNER",
    "ORG_ADMIN",
    "EVENT_MANAGER",
    "ONSITE_MANAGER",
    "SCIENTIFIC_MANAGER",
  ],
};

export function getEntityPolicy(entity: string): EntityPolicy | null {
  return ENTITY_POLICY_MAP[entity] ?? null;
}

export function authorizeEntity({
  entity,
  action,
  role,
}: {
  entity: string;
  action: Action;
  role?: string | null;
}): boolean {
  const policy = getEntityPolicy(entity);
  // Deny-by-default for unknown entity
  if (!policy) {
    return false;
  }

  // If action is not allowed on this entity
  if (!policy.allowedActions.includes(action)) {
    return false;
  }

  // If role is omitted (e.g. auth-off demo mode) -> preserve demo access
  if (!role) {
    return true;
  }

  // Super-admin / org-owner bypasses
  if (role === "ORG_OWNER" || role === "ORG_ADMIN") {
    return true;
  }

  // Read-only / viewer role: only VIEW action allowed (mutations strictly 403)
  if (READONLY_ROLES.has(role)) {
    if (action !== "VIEW") return false;
    // Sensitive administrative modules (e.g. integrations with secrets) forbidden even to viewer
    if (policy.module === "integrations") return false;
    return true;
  }

  // Participant roles: never allowed on management generic collection routes
  if (PARTICIPANT_ROLES.has(role)) {
    return false;
  }

  // Staff roles: check module-level permissions
  if (STAFF_ROLES.has(role)) {
    const allowed = MODULE_ALLOWED_ROLES[policy.module];
    if (allowed === "*") return true;
    if (Array.isArray(allowed) && allowed.includes(role)) return true;
    return false;
  }

  // Unrecognized/unregistered role -> deny-by-default
  return false;
}

// ─── P05.3: Çift Okuma / Geçiş ve Telemetri (Dual-Read & Migration) ───────────

export interface FallbackEvent {
  timestamp: string;
  userId: string;
  role: string;
  entity: string;
  action: Action;
  granted: boolean;
  reason: string;
}

export interface FallbackMetrics {
  totalFallbacks: number;
  grantedCount: number;
  deniedCount: number;
  byRole: Record<string, number>;
  byEntity: Record<string, number>;
  events: FallbackEvent[];
}

let fallbackMetrics: FallbackMetrics = {
  totalFallbacks: 0,
  grantedCount: 0,
  deniedCount: 0,
  byRole: {},
  byEntity: {},
  events: [],
};

export function recordFallbackUsage(event: Omit<FallbackEvent, "timestamp">): void {
  const fullEvent: FallbackEvent = {
    ...event,
    timestamp: new Date().toISOString(),
  };
  fallbackMetrics.totalFallbacks++;
  if (event.granted) {
    fallbackMetrics.grantedCount++;
  } else {
    fallbackMetrics.deniedCount++;
  }
  fallbackMetrics.byRole[event.role] = (fallbackMetrics.byRole[event.role] || 0) + 1;
  fallbackMetrics.byEntity[event.entity] = (fallbackMetrics.byEntity[event.entity] || 0) + 1;
  fallbackMetrics.events.push(fullEvent);
  if (fallbackMetrics.events.length > 100) {
    fallbackMetrics.events.shift();
  }
}

export function getFallbackMetrics(): FallbackMetrics {
  return {
    ...fallbackMetrics,
    byRole: { ...fallbackMetrics.byRole },
    byEntity: { ...fallbackMetrics.byEntity },
    events: [...fallbackMetrics.events],
  };
}

export function resetFallbackMetrics(): void {
  fallbackMetrics = {
    totalFallbacks: 0,
    grantedCount: 0,
    deniedCount: 0,
    byRole: {},
    byEntity: {},
    events: [],
  };
}

export interface DualReadPrisma {
  userRoleAssignment: {
    findMany: (args: Record<string, unknown>) => Promise<
      Array<{
        role?: {
          key: string;
          permissions?: Array<{ module: string; action: string }>;
        } | null;
      }>
    >;
  };
}

export interface DualReadOptions {
  actor?: { uid?: string; role?: string | null; tenantId?: string } | null;
  entity: string;
  action: Action;
  scopeKey?: string | null;
  prisma?: unknown;
}

export interface DualReadResult {
  authorized: boolean;
  source: "db_rbac" | "legacy_fallback" | "demo_bypass";
  reason: string;
}

/**
 * P05.3: Çift okuma ile yetkilendirme.
 * 1. Aktörün DB kalıcı rol ve izinlerini kontrol eder (db_rbac).
 * 2. DB ataması bulunamazsa legacy session role fallback'ine geçer ve telemetri kaydeder.
 * 3. Auth-off demo modunda geriye uyumlu açık erişim sağlar.
 */
export async function authorizeDualRead({
  actor,
  entity,
  action,
  scopeKey,
  prisma,
}: DualReadOptions): Promise<DualReadResult> {
  const policy = getEntityPolicy(entity);
  // Deny-by-default for unregistered entities
  if (!policy) {
    return { authorized: false, source: "db_rbac", reason: "UNKNOWN_ENTITY" };
  }
  if (!policy.allowedActions.includes(action)) {
    return { authorized: false, source: "db_rbac", reason: "ACTION_NOT_ALLOWED_ON_ENTITY" };
  }

  // Auth-off demo mode or missing actor -> preserve open demo access
  if (!actor || !actor.role) {
    return { authorized: true, source: "demo_bypass", reason: "AUTH_OFF_DEMO_MODE" };
  }

  // 1. Birincil Yol: DB Kalıcı Rol ve İzin Modeli
  const dbClient = prisma as DualReadPrisma | undefined;
  if (dbClient && actor.uid) {
    try {
      const activeScope = scopeKey && scopeKey !== "TENANT" ? scopeKey : "TENANT";
      const assignments = await dbClient.userRoleAssignment.findMany({
        where: {
          userId: actor.uid,
          scopeKey: { in: [activeScope, "TENANT"] },
        },
        include: {
          role: {
            include: {
              permissions: true,
            },
          },
        },
      });

      if (assignments && assignments.length > 0) {
        for (const assignment of assignments) {
          const roleDef = assignment.role;
          if (!roleDef) continue;

          // Süper idari roller doğrudan tam yetkilidir
          if (roleDef.key === "ORG_OWNER" || roleDef.key === "ORG_ADMIN") {
            return { authorized: true, source: "db_rbac", reason: "SUPER_ADMIN" };
          }

          // İzin tablosunu modül ve eylem (veya MANAGE) için kontrol et
          const hasPerm = roleDef.permissions?.some(
            (p: { module: string; action: string }) =>
              p.module === policy.module && (p.action === action || p.action === "MANAGE")
          );

          if (hasPerm) {
            return { authorized: true, source: "db_rbac", reason: "ROLE_PERMISSION_GRANTED" };
          }
        }

        // DB ataması mevcut fakat hiçbiri bu modül/eyleme izin vermiyor -> Kesin RED
        return { authorized: false, source: "db_rbac", reason: "ROLE_PERMISSION_DENIED" };
      }
    } catch {
      // QA: DB kararı beklenirken hata → FAIL-CLOSED (kesin RED). Eski davranış
      // legacy fallback'e düşüyordu — kesinti anında rol-dizesiyle yetki AÇILABİLİRDİ.
      // Atamasız kullanıcıların normal fallback yolu (boş liste) korunur.
      return { authorized: false, source: "db_rbac", reason: "DB_ERROR_FAIL_CLOSED" };
    }
  }

  // 2. İkincil Yol: Geçici Legacy Fallback & Telemetri
  const legacyGranted = authorizeEntity({
    entity,
    action,
    role: actor.role,
  });

  recordFallbackUsage({
    userId: actor.uid || "anonymous",
    role: actor.role,
    entity,
    action,
    granted: legacyGranted,
    reason: prisma && actor.uid ? "NO_DB_ASSIGNMENTS" : "NO_PRISMA_CLIENT",
  });

  return {
    authorized: legacyGranted,
    source: "legacy_fallback",
    reason: prisma && actor.uid ? "NO_DB_ASSIGNMENTS" : "NO_PRISMA_CLIENT",
  };
}

// ─── N-01: /api/flows aksiyon → yetki eşlemesi ─────────────────────────────────
// Her flows aksiyonu ENTITY_POLICY_MAP'teki bir varlığa ve eyleme bağlanır; karar
// merkezi generic CRUD ile AYNI (authorizeDualRead): DB RBAC birincil, DB ataması
// yoksa legacy session-role fallback, auth-off'ta demo bypass. Eşleme
// seed-kapsayıcı seçildi: tohum rollerin sahip olmadığı (module, action) çifti
// YOK (flows-authorization testi kilitler).

export interface FlowActionPolicy {
  entity: string;
  action: Action;
}

export const FLOW_ACTION_POLICY: Record<string, FlowActionPolicy> = {
  // Kayıt kararları — UPDATE (seed'de FINANCE/ONSITE APPROVE'a sahip değil).
  "registration.decide": { entity: "registrations", action: "UPDATE" },
  "registration.cancel": { entity: "registrations", action: "UPDATE" },
  // Sponsor misafiri havuzdan hak tüketir + kayıt üretir.
  "sponsor.guest": { entity: "sponsor-agreements", action: "CREATE" },
  // Finansal hareketler.
  "finance.manualPayment": { entity: "payments", action: "CREATE" },
  "finance.approvePayment": { entity: "payments", action: "APPROVE" },
  "finance.refund": { entity: "refunds", action: "CREATE" },
  // Stant tahsisi.
  "booth.allocate": { entity: "booth-allocations", action: "CREATE" },
  // Konaklama durum geçişleri.
  "reservation.confirm": { entity: "reservations", action: "UPDATE" },
  "reservation.cancel": { entity: "reservations", action: "UPDATE" },
  // Sertifika üretimi belge ıssı yaratır.
  "certificate.generate": { entity: "certificate-issues", action: "CREATE" },
  // Yayın + yetenek: edisyon yönetimi.
  "edition.publish": { entity: "editions", action: "UPDATE" },
  "capability.toggle": { entity: "capabilities", action: "UPDATE" },
  // Kişi birleştirme kiracı-özel yıkıcı işlem (kapsam: TENANT).
  "person.merge": { entity: "people", action: "UPDATE" },
  // LCV yanıtı.
  "invitation.respond": { entity: "invitations", action: "UPDATE" },
  // B2B karşılıklı onay.
  "b2b.respond": { entity: "b2b-assignments", action: "UPDATE" },
  "b2b.approve": { entity: "b2b-assignments", action: "APPROVE" },
};

export const FLOW_ACTIONS = Object.freeze(Object.keys(FLOW_ACTION_POLICY));

export function policyForFlowAction(action: unknown): FlowActionPolicy | null {
  if (typeof action !== "string") return null;
  return FLOW_ACTION_POLICY[action] ?? null;
}

// Eşleme bütünlüğü: her hedef entity POLICY'de kayıtlı, her eylem izinli olmalı.
// Kayıt-dışı eşleme fail-closed 403 üretir (UNKNOWN_ENTITY).
export function assertFlowPolicyIntegrity(): string[] {
  const problems: string[] = [];
  for (const [flowAction, policy] of Object.entries(FLOW_ACTION_POLICY)) {
    const entityPolicy = getEntityPolicy(policy.entity);
    if (!entityPolicy) {
      problems.push(`${flowAction}: entity "${policy.entity}" POLICY'de yok`);
      continue;
    }
    if (!entityPolicy.allowedActions.includes(policy.action)) {
      problems.push(`${flowAction}: "${policy.action}" entity'de izinli değil`);
    }
  }
  return problems;
}

// ─── Flows kapsam çözümleme ─────────────────────────────────────────────────
// DB RBAC edition-kapsamlı atamaları (scopeKey=editionId) değerlendirebilmek için
// aksiyonun hedef edisyonu bulunur. Çözülemezse "TENANT" döner — o durumda yalnız
// TENANT atamaları + legacy fallback devreye girer (asla açık-geçiş yok).
export interface FlowScopePrisma {
  registration: { findUnique(args: unknown): Promise<{ editionId: string | null } | null> };
  invitation: { findUnique(args: unknown): Promise<{ editionId: string | null } | null> };
  entitlement: { findUnique(args: unknown): Promise<{ editionId: string | null } | null> };
  order: { findUnique(args: unknown): Promise<{ editionId: string | null } | null> };
  reservation: { findUnique(args: unknown): Promise<{ editionId: string | null } | null> };
  boothUnit: { findUnique(args: unknown): Promise<{ editionId: string | null } | null> };
  certificateDefinition: { findUnique(args: unknown): Promise<{ editionId: string | null } | null> };
  eventCapability: { findUnique(args: unknown): Promise<{ editionId: string | null } | null> };
  payment: { findUnique(args: unknown): Promise<{ order: { editionId: string | null } | null } | null> };
  b2bAssignment: {
    findUnique(args: unknown): Promise<{ plan: { editionId: string } } | null>;
  };
}

type FlowBody = Record<string, unknown>;

const flowIdOf = (body: FlowBody, key: string): string | null => {
  const v = body[key];
  return typeof v === "string" && v.length > 0 ? v : null;
};

export async function resolveFlowEdition(
  action: string,
  body: FlowBody,
  prisma: FlowScopePrisma
): Promise<string> {
  // Açık edisyon (edition.publish, capability.toggle-b) — en güvenilir kaynak.
  const direct = flowIdOf(body, "editionId");
  if (direct) return direct;

  try {
    switch (action) {
      case "registration.decide":
      case "registration.cancel": {
        const id = flowIdOf(body, "registrationId");
        if (!id) return "TENANT";
        const row = await prisma.registration.findUnique({ where: { id }, select: { editionId: true } });
        return row?.editionId ?? "TENANT";
      }
      case "invitation.respond": {
        const id = flowIdOf(body, "invitationId");
        if (!id) return "TENANT";
        const row = await prisma.invitation.findUnique({ where: { id }, select: { editionId: true } });
        return row?.editionId ?? "TENANT";
      }
      case "sponsor.guest": {
        const id = flowIdOf(body, "entitlementId");
        if (!id) return "TENANT";
        const row = await prisma.entitlement.findUnique({ where: { id }, select: { editionId: true } });
        return row?.editionId ?? "TENANT";
      }
      case "finance.manualPayment":
      case "finance.refund": {
        const id = flowIdOf(body, "orderId");
        if (!id) return "TENANT";
        const row = await prisma.order.findUnique({ where: { id }, select: { editionId: true } });
        return row?.editionId ?? "TENANT";
      }
      case "finance.approvePayment": {
        const id = flowIdOf(body, "paymentId");
        if (!id) return "TENANT";
        const row = await prisma.payment.findUnique({ where: { id }, select: { order: { select: { editionId: true } } } });
        return row?.order?.editionId ?? "TENANT";
      }
      case "booth.allocate": {
        const id = flowIdOf(body, "boothUnitId");
        if (!id) return "TENANT";
        const row = await prisma.boothUnit.findUnique({ where: { id }, select: { editionId: true } });
        return row?.editionId ?? "TENANT";
      }
      case "reservation.confirm":
      case "reservation.cancel": {
        const id = flowIdOf(body, "reservationId");
        if (!id) return "TENANT";
        const row = await prisma.reservation.findUnique({ where: { id }, select: { editionId: true } });
        return row?.editionId ?? "TENANT";
      }
      case "certificate.generate": {
        const id = flowIdOf(body, "definitionId");
        if (!id) return "TENANT";
        const row = await prisma.certificateDefinition.findUnique({ where: { id }, select: { editionId: true } });
        return row?.editionId ?? "TENANT";
      }
      case "capability.toggle": {
        const id = flowIdOf(body, "capabilityId");
        if (!id) return "TENANT";
        const row = await prisma.eventCapability.findUnique({ where: { id }, select: { editionId: true } });
        return row?.editionId ?? "TENANT";
      }
      case "b2b.respond":
      case "b2b.approve": {
        const id = flowIdOf(body, "assignmentId");
        if (!id) return "TENANT";
        const row = await prisma.b2bAssignment.findUnique({
          where: { id },
          select: { plan: { select: { editionId: true } } },
        });
        return row?.plan?.editionId ?? "TENANT";
      }
      case "edition.publish":
      case "person.merge":
      default:
        return "TENANT";
    }
  } catch {
    // Kapsam çözümleme hatası yetkiyi AÇMAZ — TENANT dar kapsamına düşer.
    return "TENANT";
  }
}

export interface FlowAuthOptions {
  actor: { uid?: string; role?: string | null; tenantId?: string } | null;
  action: unknown;
  body: FlowBody;
  prisma: unknown;
}

export interface FlowAuthResult extends DualReadResult {
  unknownAction: boolean;
}

export async function authorizeFlowAction({
  actor,
  action,
  body,
  prisma,
}: FlowAuthOptions): Promise<FlowAuthResult> {
  const policy = policyForFlowAction(action);
  if (!policy) {
    return { authorized: false, source: "db_rbac", reason: "UNKNOWN_FLOW_ACTION", unknownAction: true };
  }
  const scopeKey = await resolveFlowEdition(action as string, body, prisma as FlowScopePrisma);
  const result = await authorizeDualRead({
    actor,
    entity: policy.entity,
    action: policy.action,
    scopeKey,
    prisma,
  });
  return { ...result, unknownAction: false };
}


