// ─── H-10: Şirket snapshot derleyici (JSON, taşınabilir arşiv) ─────────────────
// YALNIZ güvenli alanlar seçilir: parola/MFA/recovery/token/sır İÇERMEZ.
// Bölüm tavanları devasa kiracılarda yanıtı sınırlar; üzeri counts ile özetlenir.
export const SNAPSHOT_FORMAT_VERSION = 1;
export const SNAPSHOT_MAX_SERIES = 200;
export const SNAPSHOT_MAX_EDITIONS = 500;
export const SNAPSHOT_MAX_ROLES = 100;

export interface SnapshotPrisma {
  tenant: {
    findUnique(args: unknown): Promise<{
      id: string;
      slug: string;
      name: string;
      plan: string;
      status: string;
      country: string | null;
      timezone: string;
      createdAt: Date;
    } | null>;
  };
  eventSeries: {
    findMany(args: unknown): Promise<{ id: string; slug: string; name: string }[]>;
    count(args: unknown): Promise<number>;
  };
  eventEdition: {
    findMany(args: unknown): Promise<
      {
        id: string;
        slug: string;
        name: string;
        startsAt: Date | null;
        endsAt: Date | null;
        status: string;
        isPublished: boolean;
        seriesId: string | null;
      }[]
    >;
    count(args: unknown): Promise<number>;
  };
  roleDefinition: {
    findMany(args: unknown): Promise<{ key: string; name: string; isSystem: boolean }[]>;
  };
  user: { count(args: unknown): Promise<number> };
  person: { count(args: unknown): Promise<number> };
  organization: { count(args: unknown): Promise<number> };
  customerContact: { count(args: unknown): Promise<number> };
  registration: { count(args: unknown): Promise<number> };
  order: { count(args: unknown): Promise<number> };
  sponsorAgreement: { count(args: unknown): Promise<number> };
  campaign: { count(args: unknown): Promise<number> };
  mediaAsset: { count(args: unknown): Promise<number> };
  task: { count(args: unknown): Promise<number> };
}

export interface CompanySnapshot {
  meta: {
    formatVersion: number;
    generatedAt: string;
    tenantSlug: string;
    tenantName: string;
  };
  tenant: {
    id: string;
    slug: string;
    name: string;
    plan: string;
    status: string;
    country: string | null;
    timezone: string;
    createdAt: string;
  };
  series: { id: string; slug: string; name: string }[];
  seriesTotal: number;
  editions: {
    id: string;
    slug: string;
    name: string;
    startsAt: string | null;
    endsAt: string | null;
    status: string;
    isPublished: boolean;
    seriesId: string | null;
  }[];
  editionsTotal: number;
  roles: { key: string; name: string; isSystem: boolean }[];
  counts: Record<string, number>;
}

const iso = (d: Date | null | undefined): string | null => (d ? new Date(d).toISOString() : null);

export async function buildCompanySnapshot(
  prisma: SnapshotPrisma,
  tenantId: string,
): Promise<CompanySnapshot> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { id: true, slug: true, name: true, plan: true, status: true, country: true, timezone: true, createdAt: true },
  });
  if (!tenant) throw new Error("TENANT_NOT_FOUND");

  const [series, seriesTotal, editions, editionsTotal, roles] = await Promise.all([
    prisma.eventSeries.findMany({
      where: { tenantId },
      select: { id: true, slug: true, name: true },
      orderBy: { name: "asc" },
      take: SNAPSHOT_MAX_SERIES,
    }),
    prisma.eventSeries.count({ where: { tenantId } }),
    prisma.eventEdition.findMany({
      where: { tenantId },
      select: { id: true, slug: true, name: true, startsAt: true, endsAt: true, status: true, isPublished: true, seriesId: true },
      orderBy: { startsAt: "asc" },
      take: SNAPSHOT_MAX_EDITIONS,
    }),
    prisma.eventEdition.count({ where: { tenantId } }),
    prisma.roleDefinition.findMany({
      where: { OR: [{ tenantId: null }, { tenantId }] },
      select: { key: true, name: true, isSystem: true },
      orderBy: { key: "asc" },
      take: SNAPSHOT_MAX_ROLES,
    }),
  ]);

  const [users, people, organizations, customerContacts, registrations, orders, sponsorAgreements, campaigns, mediaAssets, tasks] =
    await Promise.all([
      prisma.user.count({ where: { tenantId } }),
      prisma.person.count({ where: { tenantId } }),
      prisma.organization.count({ where: { tenantId } }),
      prisma.customerContact.count({ where: { tenantId } }),
      prisma.registration.count({ where: { edition: { tenantId } } }),
      prisma.order.count({ where: { edition: { tenantId } } }),
      prisma.sponsorAgreement.count({ where: { edition: { tenantId } } }),
      prisma.campaign.count({ where: { edition: { tenantId } } }),
      prisma.mediaAsset.count({ where: { edition: { tenantId } } }),
      prisma.task.count({ where: { edition: { tenantId } } }),
    ]);

  return {
    meta: {
      formatVersion: SNAPSHOT_FORMAT_VERSION,
      generatedAt: new Date().toISOString(),
      tenantSlug: tenant.slug,
      tenantName: tenant.name,
    },
    tenant: { ...tenant, createdAt: new Date(tenant.createdAt).toISOString() },
    series,
    seriesTotal,
    editions: editions.map((e) => ({ ...e, startsAt: iso(e.startsAt), endsAt: iso(e.endsAt) })),
    editionsTotal,
    roles,
    counts: {
      users,
      people,
      organizations,
      customerContacts,
      eventSeries: seriesTotal,
      eventEditions: editionsTotal,
      registrations,
      orders,
      sponsorAgreements,
      campaigns,
      mediaAssets,
      tasks,
    },
  };
}

export function snapshotFilename(slug: string, at: Date = new Date()): string {
  const day = at.toISOString().slice(0, 10);
  const safe = slug.replace(/[^a-z0-9-_]+/gi, "-").toLowerCase().replace(/^-+|-+$/g, "") || "tenant";
  return `company-snapshot-${safe}-${day}.json`;
}
