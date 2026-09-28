-- AlterTable
ALTER TABLE "Campaign" ADD COLUMN "approvalStatus" TEXT NOT NULL DEFAULT 'NONE';
ALTER TABLE "Campaign" ADD COLUMN "approvedBy" TEXT;
ALTER TABLE "Campaign" ADD COLUMN "approvedAt" DATETIME;
ALTER TABLE "Campaign" ADD COLUMN "approvalNote" TEXT;
ALTER TABLE "Campaign" ADD COLUMN "approvalRequestedBy" TEXT;

-- CreateTable
CREATE TABLE "BrandAsset" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'LOGO',
    "mimeType" TEXT,
    "sizeKb" INTEGER,
    "dataUrl" TEXT,
    "externalUrl" TEXT,
    "sha256" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "license" TEXT,
    "usageNotes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "BrandAsset_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EditionBrandRef" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "editionId" TEXT NOT NULL,
    "brandAssetId" TEXT NOT NULL,
    "overrideName" TEXT,
    "overrideDataUrl" TEXT,
    "overrideExternalUrl" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EditionBrandRef_brandAssetId_fkey" FOREIGN KEY ("brandAssetId") REFERENCES "BrandAsset" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "UtmTerm" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "label" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UtmTerm_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PromoUsage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "assetId" TEXT,
    "campaignId" TEXT,
    "editionId" TEXT,
    "channel" TEXT,
    "detail" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PromoUsage_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "EditionBrandRef_editionId_brandAssetId_key" ON "EditionBrandRef"("editionId", "brandAssetId");

-- CreateIndex
CREATE UNIQUE INDEX "UtmTerm_tenantId_kind_value_key" ON "UtmTerm"("tenantId", "kind", "value");

-- CreateIndex
CREATE INDEX "BrandAsset_tenantId_kind_idx" ON "BrandAsset"("tenantId", "kind");

-- CreateIndex
CREATE INDEX "EditionBrandRef_editionId_idx" ON "EditionBrandRef"("editionId");

-- CreateIndex
CREATE INDEX "UtmTerm_tenantId_kind_idx" ON "UtmTerm"("tenantId", "kind");

-- CreateIndex
CREATE INDEX "PromoUsage_tenantId_kind_idx" ON "PromoUsage"("tenantId", "kind");

-- CreateIndex
CREATE INDEX "PromoUsage_tenantId_assetId_idx" ON "PromoUsage"("tenantId", "assetId");

-- CreateIndex
CREATE INDEX "PromoUsage_tenantId_campaignId_idx" ON "PromoUsage"("tenantId", "campaignId");
