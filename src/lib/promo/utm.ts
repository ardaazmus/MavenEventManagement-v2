// ─── P19.4: UTM sözlüğü + bağlantı kurucu + kullanım analitiği ─────────────────
// Sözleşme: terimler normalize slug olarak sözlükte yaşar; katı kipte sözlük
// dışı terim reddedilir (422), esnek kipte uyarıyla geçilir. Her kurulum
// PromoUsage'a düşer; istatistikler sözlük + kampanya + varlık kırılımlıdır.
// NOT: `@/` takma adı YOK — node --test (tip-sıyırma) uyumu için bağımsız.

export class UtmError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = "UtmError";
    this.status = status;
  }
}

export const UTM_KINDS = ["SOURCE", "MEDIUM", "CAMPAIGN"] as const;

const TR_MAP: Record<string, string> = {
  ç: "c", ğ: "g", ı: "i", ö: "o", ş: "s", ü: "u",
  Ç: "c", Ğ: "g", İ: "i", Ö: "o", Ş: "s", Ü: "u",
};

export function normalizeUtmTerm(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const slug = raw
    .trim()
    .replace(/[çğıöşüÇĞİÖŞÜ]/g, (c) => TR_MAP[c] ?? c)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || null;
}

export function sanitizeUtmKind(raw: unknown): string | null {
  const v = typeof raw === "string" ? raw.trim().toUpperCase() : "";
  return (UTM_KINDS as readonly string[]).includes(v) ? v : null;
}

export interface UtmPrisma {
  utmTerm: {
    create: (args: { data: Record<string, unknown> }) => Promise<Record<string, unknown>>;
    findMany: (args: { where: Record<string, unknown>; orderBy?: unknown; take?: number }) => Promise<Array<Record<string, unknown>>>;
    findUnique: (args: { where: Record<string, unknown> }) => Promise<Record<string, unknown> | null>;
    update: (args: { where: Record<string, unknown>; data: Record<string, unknown> }) => Promise<Record<string, unknown>>;
  };
  promoUsage: {
    create: (args: { data: Record<string, unknown> }) => Promise<Record<string, unknown>>;
    findMany: (args: { where: Record<string, unknown>; take?: number; orderBy?: unknown }) => Promise<Array<Record<string, unknown>>>;
    count: (args: { where: Record<string, unknown> }) => Promise<number>;
  };
}

export async function upsertUtmTerm(
  prisma: UtmPrisma,
  input: { tenantId: string; kind: string; value: string; label?: string | null },
): Promise<Record<string, unknown>> {
  if (!input.tenantId) throw new UtmError("tenantId zorunludur", 422);
  const kind = sanitizeUtmKind(input.kind);
  if (!kind) throw new UtmError("kind SOURCE|MEDIUM|CAMPAIGN olmalı", 422);
  const value = normalizeUtmTerm(input.value);
  if (!value) throw new UtmError("value boş slug üretiyor", 422);
  const existing = (await prisma.utmTerm.findUnique({
    where: { tenantId_kind_value: { tenantId: input.tenantId, kind, value } },
  })) as unknown as { id: string } | null;
  if (existing) {
    return prisma.utmTerm.update({
      where: { id: existing.id },
      data: { label: input.label?.trim() || null, isActive: true },
    });
  }
  return prisma.utmTerm.create({
    data: { tenantId: input.tenantId, kind, value, label: input.label?.trim() || null },
  });
}

export interface BuildUtmInput {
  tenantId: string;
  baseUrl: string;
  source: string;
  medium: string;
  campaign: string;
  content?: string | null;
  term?: string | null;
  strict?: boolean;
  campaignId?: string | null;
  editionId?: string | null;
}

export interface BuiltUtm {
  url: string;
  terms: { source: string; medium: string; campaign: string; content: string | null; term: string | null };
  warnings: string[];
}

export async function buildUtmUrl(prisma: UtmPrisma, input: BuildUtmInput): Promise<BuiltUtm> {
  if (!input.tenantId) throw new UtmError("tenantId zorunludur", 422);
  let base: URL;
  try {
    base = new URL(input.baseUrl);
  } catch {
    throw new UtmError("baseUrl geçersiz", 422);
  }
  if (base.protocol !== "http:" && base.protocol !== "https:") {
    throw new UtmError("baseUrl http(s) olmalı", 422);
  }
  const source = normalizeUtmTerm(input.source);
  const medium = normalizeUtmTerm(input.medium);
  const campaign = normalizeUtmTerm(input.campaign);
  const content = input.content ? normalizeUtmTerm(input.content) : null;
  const term = input.term ? normalizeUtmTerm(input.term) : null;
  if (!source || !medium || !campaign) {
    throw new UtmError("source, medium ve campaign zorunludur", 422);
  }
  const warnings: string[] = [];
  const known = (await prisma.utmTerm.findMany({
    where: { tenantId: input.tenantId, isActive: true },
    take: 1000,
  })) as unknown as Array<{ kind: string; value: string }>;
  const has = (kind: string, value: string): boolean => known.some((t) => t.kind === kind && t.value === value);
  for (const [kind, value] of [["SOURCE", source], ["MEDIUM", medium], ["CAMPAIGN", campaign]] as const) {
    if (!has(kind, value)) {
      if (input.strict !== false) {
        throw new UtmError(`Sözlük dışı ${kind.toLowerCase()} terimi: ${value}`, 422);
      }
      warnings.push(`sözlük-dışı:${kind.toLowerCase()}:${value}`);
    }
  }
  const params = new URLSearchParams(base.search);
  params.set("utm_source", source);
  params.set("utm_medium", medium);
  params.set("utm_campaign", campaign);
  if (content) params.set("utm_content", content);
  if (term) params.set("utm_term", term);
  base.search = params.toString();
  await prisma.promoUsage.create({
    data: {
      tenantId: input.tenantId,
      kind: "UTM_BUILD",
      campaignId: input.campaignId ?? null,
      editionId: input.editionId ?? null,
      detail: JSON.stringify({ source, medium, campaign, content, term, strict: input.strict !== false }),
    },
  });
  return { url: base.toString(), terms: { source, medium, campaign, content, term }, warnings };
}

export interface UsageStats {
  total: number;
  byKind: Record<string, number>;
  byCampaign: Array<{ campaignId: string; count: number }>;
  byAsset: Array<{ assetId: string; count: number }>;
}

export async function usageStats(
  prisma: UtmPrisma,
  input: { tenantId: string; kind?: string; campaignId?: string; assetId?: string; take?: number },
): Promise<UsageStats> {
  if (!input.tenantId) throw new UtmError("tenantId zorunludur", 422);
  const where: Record<string, unknown> = { tenantId: input.tenantId };
  if (input.kind) where.kind = input.kind;
  if (input.campaignId) where.campaignId = input.campaignId;
  if (input.assetId) where.assetId = input.assetId;
  const take = Math.min(Math.max(input.take ?? 500, 1), 2000);
  const rows = (await prisma.promoUsage.findMany({ where, take, orderBy: { createdAt: "desc" } })) as unknown as Array<{
    kind: string; campaignId: string | null; assetId: string | null;
  }>;
  const total = await prisma.promoUsage.count({ where });
  const byKind: Record<string, number> = {};
  const camp = new Map<string, number>();
  const asset = new Map<string, number>();
  for (const r of rows) {
    byKind[r.kind] = (byKind[r.kind] ?? 0) + 1;
    if (r.campaignId) camp.set(r.campaignId, (camp.get(r.campaignId) ?? 0) + 1);
    if (r.assetId) asset.set(r.assetId, (asset.get(r.assetId) ?? 0) + 1);
  }
  return {
    total,
    byKind,
    byCampaign: [...camp.entries()].map(([campaignId, count]) => ({ campaignId, count })),
    byAsset: [...asset.entries()].map(([assetId, count]) => ({ assetId, count })),
  };
}
