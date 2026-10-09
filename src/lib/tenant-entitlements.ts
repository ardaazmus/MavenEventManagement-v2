import { MODULE_IDS, type ModuleId } from "./api/permissions.ts";

// ─── P07: Platform Sahibi (Firma A) → Tenant (Firma B) Entitlement Sözleşmesi ───
// CONTEXT.md (§22-24, §47) & F-05 bulgusu:
//   * Platform Yetkisi: Firma A'nın Firma B'ye açtığı üst sınırdır.
//   * Deny-by-default: Tanımlanmamış veya yetkilendirilmemiş modüller kapalıdır.
//   * Edisyon yeteneği (EventCapability) ancak kiracının platform yetkisi varsa açılabilir.

export const PLAN_NAMES = ["TRIAL", "BASIC", "PRO", "ENTERPRISE"] as const;
export type PlanName = (typeof PLAN_NAMES)[number];

// Capability -> Module eşlemesi (§6 yeteneklerin ait olduğu ana modüller)
export const CAPABILITY_TO_MODULE: Record<string, ModuleId> = {
  REGISTRATION: "registrations",
  SCIENTIFIC: "scientific",
  PROGRAM: "program",
  SPONSORSHIP: "sponsorship",
  EXHIBITION: "floors",
  FLOOR_PLAN: "floors",
  ACCOMMODATION: "accommodation",
  TRAVEL: "operations",
  BADGING: "badges",
  ACCESS_CONTROL: "onsite",
  CERTIFICATES: "certificates",
  CME_CREDITS: "scientific",
  TOURS: "social",
  SOCIAL_EVENTS: "social",
  B2B_MEETINGS: "b2b",
  OPERATIONS: "operations",
  COMMUNICATIONS: "communications",
};

// Plan bazlı varsayılan modül matrisi
const CORE_MODULES: readonly ModuleId[] = [
  "dashboard",
  "operations",
  "archive",
  "editions",
  "settings",
  "portals",
  "people",
  "organizations",
  "communications",
  "registrations",
  "forms",
  "finance",
  "accounting",
  "program",
  "social",
  "media",
];

export const PLAN_DEFAULT_MODULES: Record<PlanName, readonly ModuleId[]> = {
  TRIAL: CORE_MODULES,
  BASIC: CORE_MODULES,
  PRO: [
    ...CORE_MODULES,
    "scientific",
    "sponsorship",
    "accommodation",
    "onsite",
    "badges",
    "certificates",
    "compliance",
  ],
  ENTERPRISE: [...MODULE_IDS],
};

export interface TenantEntitlementSummary {
  tenantId: string;
  plan: string;
  baseModules: ModuleId[];
  overrides: Record<string, boolean>;
  effectiveModules: ModuleId[];
}

// Node test ortamında db.ts'in statik yüklenmesini önleyen esnek çözümleyici
let cachedDb: any = null;
async function resolvePrisma(client?: unknown) {
  if (client) return client as typeof cachedDb;
  if (!cachedDb) {
    const mod = await import("./db.ts");
    cachedDb = mod.db;
  }
  return cachedDb;
}

/**
 * Kiracının platform yetkilerini (plan varsayılanları + Firma A override'ları) çözümler.
 */
export async function resolveTenantEntitlements(
  tenantId: string,
  prismaClient?: unknown,
): Promise<TenantEntitlementSummary> {
  if (!tenantId) {
    return {
      tenantId: "",
      plan: "TRIAL",
      baseModules: [],
      overrides: {},
      effectiveModules: [],
    };
  }

  const client = await resolvePrisma(prismaClient);
  const tenant = await client.tenant.findUnique({
    where: { id: tenantId },
    select: {
      id: true,
      plan: true,
      subscription: {
        select: {
          plan: true,
          notes: true,
        },
      },
    },
  });

  if (!tenant) {
    return {
      tenantId,
      plan: "TRIAL",
      baseModules: [],
      overrides: {},
      effectiveModules: [],
    };
  }

  const rawPlan = (tenant.subscription?.plan || tenant.plan || "").toUpperCase() as PlanName;
  const isKnownPlan = rawPlan in PLAN_DEFAULT_MODULES;
  const planKey: PlanName = isKnownPlan ? rawPlan : "TRIAL";
  const baseList: readonly ModuleId[] = isKnownPlan ? (PLAN_DEFAULT_MODULES[planKey] || []) : [];

  const overrides: Record<string, boolean> = {};
  if (tenant.subscription?.notes) {
    try {
      const parsed = JSON.parse(tenant.subscription.notes);
      if (parsed && typeof parsed === "object" && parsed.entitlementOverrides) {
        Object.assign(overrides, parsed.entitlementOverrides);
      }
    } catch {
      // JSON değilse ham not olarak kalır, override yok sayılır
    }
  }

  const effectiveSet = new Set<ModuleId>(baseList);
  for (const [mod, enabled] of Object.entries(overrides)) {
    if (MODULE_IDS.includes(mod as ModuleId)) {
      if (enabled) {
        effectiveSet.add(mod as ModuleId);
      } else {
        effectiveSet.delete(mod as ModuleId);
      }
    }
  }

  return {
    tenantId,
    plan: planKey,
    baseModules: Array.from(baseList),
    overrides,
    effectiveModules: Array.from(effectiveSet),
  };
}

/**
 * Belirli bir modülün kiracı için yetkili olup olmadığını denetler.
 */
export async function isTenantModuleEntitled(
  tenantId: string,
  module: string,
  prismaClient?: unknown,
): Promise<boolean> {
  const summary = await resolveTenantEntitlements(tenantId, prismaClient);
  return summary.effectiveModules.includes(module as ModuleId);
}

/**
 * Belirli bir edisyon yeteneğinin (EventCapability) kiracı için yetkili olup olmadığını denetler.
 */
export async function isTenantCapabilityEntitled(
  tenantId: string,
  capabilityKey: string,
  prismaClient?: unknown,
): Promise<boolean> {
  const mappedModule = CAPABILITY_TO_MODULE[capabilityKey] || (capabilityKey.toLowerCase() as ModuleId);
  return isTenantModuleEntitled(tenantId, mappedModule, prismaClient);
}

/**
 * Platform Sahibi (Firma A) tarafından kiracı modül override'ı kaydeder.
 */
export async function setTenantEntitlementOverride(
  tenantId: string,
  module: ModuleId,
  enabled: boolean,
  grantedBy = "Platform Yöneticisi",
  prismaClient?: unknown,
): Promise<TenantEntitlementSummary> {
  if (!MODULE_IDS.includes(module)) {
    throw new Error(`Geçersiz modül kimliği: ${module}`);
  }

  const client = await resolvePrisma(prismaClient);
  const tenant = await client.tenant.findUnique({
    where: { id: tenantId },
    select: {
      id: true,
      plan: true,
      subscription: {
        select: { id: true, plan: true, notes: true },
      },
    },
  });

  if (!tenant) {
    throw new Error(`Kiracı bulunamadı: ${tenantId}`);
  }

  let parsed: Record<string, unknown> = {};
  if (tenant.subscription?.notes) {
    try {
      parsed = JSON.parse(tenant.subscription.notes);
      if (typeof parsed !== "object" || parsed === null) parsed = {};
    } catch {
      parsed = { legacyNotes: tenant.subscription.notes };
    }
  }

  const existingOverrides = (parsed.entitlementOverrides as Record<string, boolean>) || {};
  existingOverrides[module] = enabled;
  parsed.entitlementOverrides = existingOverrides;
  parsed.updatedBy = grantedBy;
  parsed.updatedAt = new Date().toISOString();

  const notesJson = JSON.stringify(parsed);

  if (tenant.subscription) {
    await client.tenantSubscription.update({
      where: { id: tenant.subscription.id },
      data: { notes: notesJson },
    });
  } else {
    await client.tenantSubscription.create({
      data: {
        tenantId,
        plan: tenant.plan || "PRO",
        notes: notesJson,
      },
    });
  }

  await client.activityLog.create({
    data: {
      tenantId,
      type: "TENANT_ENTITLEMENT_UPDATED",
      message: `Platform modül yetkisi güncellendi: ${module} -> ${enabled ? "AÇIK" : "KAPALI"} (${grantedBy})`,
      entityType: "Tenant",
      entityId: tenantId,
      actorName: grantedBy,
    },
  }).catch(() => undefined);

  return resolveTenantEntitlements(tenantId, client);
}
