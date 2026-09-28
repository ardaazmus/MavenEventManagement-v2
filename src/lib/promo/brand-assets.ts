// ─── P19.1/P19.2: Kurumsal varlık kütüphanesi + edisyon referansı ──────────────
// Sözleşme: varlık kiracı-kütüphanesinde sürümlü + hash'li + lisanslı yaşar;
// edisyon KOPYALAMAZ, referans verir; gerekirse ad/dosya override eder.
// Çözünürlük: override ?? kütüphane. Her bağlama/override kullanımı işlenir.
// NOT: `@/` takma adı YOK — node --test (tip-sıyırma) uyumu için bağımsız.
import crypto from "node:crypto";

export class BrandAssetError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = "BrandAssetError";
    this.status = status;
  }
}

export const BRAND_ASSET_KINDS = ["LOGO", "BANNER", "DOC", "GUIDELINE", "OTHER"] as const;
export const BRAND_DATAURL_MAX_BYTES = 400 * 1024;

export function sha256OfContent(content: string): string {
  return crypto.createHash("sha256").update(content, "utf8").digest("hex");
}

export function sanitizeAssetKind(raw: unknown): string {
  const v = typeof raw === "string" ? raw.trim().toUpperCase() : "";
  return (BRAND_ASSET_KINDS as readonly string[]).includes(v) ? v : "OTHER";
}

export interface BrandAssetPrisma {
  brandAsset: {
    create: (args: { data: Record<string, unknown> }) => Promise<Record<string, unknown>>;
    findUnique: (args: { where: Record<string, unknown> }) => Promise<Record<string, unknown> | null>;
    findMany: (args: { where: Record<string, unknown>; orderBy?: unknown; take?: number }) => Promise<Array<Record<string, unknown>>>;
    update: (args: { where: Record<string, unknown>; data: Record<string, unknown> }) => Promise<Record<string, unknown>>;
  };
  editionBrandRef: {
    upsert: (args: { where: Record<string, unknown>; create: Record<string, unknown>; update: Record<string, unknown> }) => Promise<Record<string, unknown>>;
    findMany: (args: { where: Record<string, unknown>; include?: unknown; orderBy?: unknown }) => Promise<Array<Record<string, unknown>>>;
    delete: (args: { where: Record<string, unknown> }) => Promise<Record<string, unknown>>;
  };
  eventEdition: {
    findUnique: (args: { where: Record<string, unknown> }) => Promise<{ id: string; tenantId: string } | null>;
  };
  promoUsage: {
    create: (args: { data: Record<string, unknown> }) => Promise<Record<string, unknown>>;
  };
}

export interface CreateAssetInput {
  tenantId: string;
  name: string;
  kind?: string;
  mimeType?: string | null;
  dataUrl?: string | null;
  externalUrl?: string | null;
  license?: string | null;
  usageNotes?: string | null;
}

function validatePayload(dataUrl: string | null, externalUrl: string | null): { sizeKb: number | null; sha256: string | null } {
  if (dataUrl && externalUrl) {
    throw new BrandAssetError("dataUrl ve externalUrl aynı anda verilemez", 422);
  }
  if (dataUrl) {
    if (!dataUrl.startsWith("data:")) throw new BrandAssetError("dataUrl data: ile başlamalı", 422);
    const bytes = Buffer.byteLength(dataUrl, "utf8");
    if (bytes > BRAND_DATAURL_MAX_BYTES) {
      throw new BrandAssetError(`Satır-içi dosya ${BRAND_DATAURL_MAX_BYTES} baytı aşıyor — externalUrl kullanın`, 422);
    }
    return { sizeKb: Math.max(1, Math.round(bytes / 1024)), sha256: sha256OfContent(dataUrl) };
  }
  if (externalUrl) {
    let u: URL;
    try {
      u = new URL(externalUrl);
    } catch {
      throw new BrandAssetError("externalUrl geçersiz", 422);
    }
    if (u.protocol !== "http:" && u.protocol !== "https:") {
      throw new BrandAssetError("externalUrl http(s) olmalı", 422);
    }
    return { sizeKb: null, sha256: sha256OfContent(externalUrl) };
  }
  return { sizeKb: null, sha256: null };
}

export async function createBrandAsset(prisma: BrandAssetPrisma, input: CreateAssetInput): Promise<Record<string, unknown>> {
  if (!input.tenantId) throw new BrandAssetError("tenantId zorunludur", 422);
  const name = (input.name ?? "").trim();
  if (!name) throw new BrandAssetError("name zorunludur", 422);
  const dataUrl = input.dataUrl?.trim() || null;
  const externalUrl = input.externalUrl?.trim() || null;
  const { sizeKb, sha256 } = validatePayload(dataUrl, externalUrl);
  return prisma.brandAsset.create({
    data: {
      tenantId: input.tenantId,
      name,
      kind: sanitizeAssetKind(input.kind),
      mimeType: input.mimeType?.trim() || null,
      dataUrl,
      externalUrl,
      sizeKb,
      sha256,
      license: input.license?.trim() || null,
      usageNotes: input.usageNotes?.trim() || null,
    },
  });
}

export interface UpdateAssetInput {
  tenantId: string;
  assetId: string;
  name?: string;
  kind?: string;
  mimeType?: string | null;
  dataUrl?: string | null;
  externalUrl?: string | null;
  clearFile?: boolean;
  license?: string | null;
  usageNotes?: string | null;
  isActive?: boolean;
}

export async function updateBrandAsset(prisma: BrandAssetPrisma, input: UpdateAssetInput): Promise<Record<string, unknown>> {
  const existing = (await prisma.brandAsset.findUnique({ where: { id: input.assetId } })) as unknown as {
    tenantId: string; version: number; dataUrl: string | null; externalUrl: string | null;
  } | null;
  if (!existing || existing.tenantId !== input.tenantId) {
    throw new BrandAssetError("Varlık bulunamadı", 404);
  }
  const data: Record<string, unknown> = { version: existing.version + 1 };
  if (input.name !== undefined) {
    const name = input.name.trim();
    if (!name) throw new BrandAssetError("name boş olamaz", 422);
    data.name = name;
  }
  if (input.kind !== undefined) data.kind = sanitizeAssetKind(input.kind);
  if (input.mimeType !== undefined) data.mimeType = input.mimeType?.trim() || null;
  if (input.license !== undefined) data.license = input.license?.trim() || null;
  if (input.usageNotes !== undefined) data.usageNotes = input.usageNotes?.trim() || null;
  if (input.isActive !== undefined) data.isActive = input.isActive;
  if (input.clearFile) {
    data.dataUrl = null;
    data.externalUrl = null;
    data.sizeKb = null;
    data.sha256 = null;
  } else if (input.dataUrl !== undefined || input.externalUrl !== undefined) {
    const dataUrl = input.dataUrl?.trim() || null;
    const externalUrl = input.externalUrl?.trim() || null;
    const { sizeKb, sha256 } = validatePayload(dataUrl, externalUrl);
    data.dataUrl = dataUrl;
    data.externalUrl = externalUrl;
    data.sizeKb = sizeKb;
    data.sha256 = sha256;
  }
  return prisma.brandAsset.update({ where: { id: input.assetId }, data });
}

export interface AttachRefInput {
  tenantId: string;
  editionId: string;
  assetId: string;
  overrideName?: string | null;
  overrideDataUrl?: string | null;
  overrideExternalUrl?: string | null;
}

export async function attachBrandRef(prisma: BrandAssetPrisma, input: AttachRefInput): Promise<Record<string, unknown>> {
  if (!input.tenantId || !input.editionId || !input.assetId) {
    throw new BrandAssetError("tenantId, editionId ve assetId zorunludur", 422);
  }
  const edition = await prisma.eventEdition.findUnique({ where: { id: input.editionId } });
  if (!edition || edition.tenantId !== input.tenantId) {
    throw new BrandAssetError("Etkinlik bulunamadı", 404);
  }
  const asset = (await prisma.brandAsset.findUnique({ where: { id: input.assetId } })) as unknown as {
    tenantId: string;
  } | null;
  if (!asset || asset.tenantId !== input.tenantId) {
    throw new BrandAssetError("Varlık bulunamadı", 404);
  }
  const overrideDataUrl = input.overrideDataUrl?.trim() || null;
  const overrideExternalUrl = input.overrideExternalUrl?.trim() || null;
  if (overrideDataUrl || overrideExternalUrl) validatePayload(overrideDataUrl, overrideExternalUrl);
  const ref = await prisma.editionBrandRef.upsert({
    where: { editionId_brandAssetId: { editionId: input.editionId, brandAssetId: input.assetId } },
    create: {
      editionId: input.editionId,
      brandAssetId: input.assetId,
      overrideName: input.overrideName?.trim() || null,
      overrideDataUrl,
      overrideExternalUrl,
    },
    update: {
      overrideName: input.overrideName?.trim() || null,
      overrideDataUrl,
      overrideExternalUrl,
      isActive: true,
    },
  });
  await prisma.promoUsage.create({
    data: {
      tenantId: input.tenantId,
      kind: overrideDataUrl || overrideExternalUrl || input.overrideName ? "REF_OVERRIDE" : "ASSET_ATTACH",
      assetId: input.assetId,
      editionId: input.editionId,
    },
  });
  return ref;
}

export async function detachBrandRef(prisma: BrandAssetPrisma, input: { tenantId: string; editionId: string; assetId: string }): Promise<{ detached: boolean }> {
  const edition = await prisma.eventEdition.findUnique({ where: { id: input.editionId } });
  if (!edition || edition.tenantId !== input.tenantId) {
    throw new BrandAssetError("Etkinlik bulunamadı", 404);
  }
  const refs = await prisma.editionBrandRef.findMany({ where: { editionId: input.editionId, brandAssetId: input.assetId } });
  if (refs.length === 0) return { detached: false };
  await prisma.editionBrandRef.delete({ where: { editionId_brandAssetId: { editionId: input.editionId, brandAssetId: input.assetId } } });
  return { detached: true };
}

export interface ResolvedBrandAsset {
  refId: string;
  assetId: string;
  name: string;
  kind: string;
  mimeType: string | null;
  dataUrl: string | null;
  externalUrl: string | null;
  version: number;
  overridden: boolean;
}

export async function listEditionBrandAssets(
  prisma: BrandAssetPrisma,
  input: { tenantId: string; editionId: string },
): Promise<ResolvedBrandAsset[]> {
  const edition = await prisma.eventEdition.findUnique({ where: { id: input.editionId } });
  if (!edition || edition.tenantId !== input.tenantId) {
    throw new BrandAssetError("Etkinlik bulunamadı", 404);
  }
  const refs = (await prisma.editionBrandRef.findMany({
    where: { editionId: input.editionId, isActive: true },
    include: { asset: true },
    orderBy: { createdAt: "asc" },
  })) as unknown as Array<{
    id: string; brandAssetId: string; overrideName: string | null; overrideDataUrl: string | null; overrideExternalUrl: string | null;
    asset: { name: string; kind: string; mimeType: string | null; dataUrl: string | null; externalUrl: string | null; version: number; isActive: boolean } | null;
  }>;
  const out: ResolvedBrandAsset[] = [];
  for (const r of refs) {
    if (!r.asset || !r.asset.isActive) continue;
    const overridden = Boolean(r.overrideName || r.overrideDataUrl || r.overrideExternalUrl);
    out.push({
      refId: r.id,
      assetId: r.brandAssetId,
      name: r.overrideName || r.asset.name,
      kind: r.asset.kind,
      mimeType: r.asset.mimeType,
      dataUrl: r.overrideDataUrl || (r.overrideExternalUrl ? null : r.asset.dataUrl),
      externalUrl: r.overrideExternalUrl || (r.overrideDataUrl ? null : r.asset.externalUrl),
      version: r.asset.version,
      overridden,
    });
  }
  return out;
}
