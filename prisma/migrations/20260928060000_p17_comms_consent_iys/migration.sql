-- AlterTable
ALTER TABLE "Campaign" ADD COLUMN "libraryTemplateId" TEXT;
ALTER TABLE "Campaign" ADD COLUMN "purpose" TEXT NOT NULL DEFAULT 'COMMERCIAL';

-- CreateTable
CREATE TABLE "TenantMailTemplate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "channel" TEXT NOT NULL DEFAULT 'EMAIL',
    "subject" TEXT,
    "htmlBody" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TenantMailTemplate_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ContactConsent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'GRANTED',
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "proof" TEXT,
    "grantedAt" DATETIME,
    "withdrawnAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ContactConsent_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SendDecision" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "campaignId" TEXT,
    "channel" TEXT NOT NULL,
    "recipient" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "decision" TEXT NOT NULL,
    "reasons" TEXT NOT NULL DEFAULT '[]',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SendDecision_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "IysOutbox" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "purpose" TEXT NOT NULL DEFAULT 'COMMERCIAL',
    "action" TEXT NOT NULL,
    "payload" TEXT NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 5,
    "nextRetryAt" DATETIME,
    "lastError" TEXT,
    "externalId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "IysOutbox_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "ContactConsent_tenantId_channel_address_purpose_key" ON "ContactConsent"("tenantId", "channel", "address", "purpose");

-- CreateIndex
CREATE INDEX "TenantMailTemplate_tenantId_channel_idx" ON "TenantMailTemplate"("tenantId", "channel");

-- CreateIndex
CREATE INDEX "ContactConsent_tenantId_channel_address_idx" ON "ContactConsent"("tenantId", "channel", "address");

-- CreateIndex
CREATE INDEX "SendDecision_tenantId_campaignId_idx" ON "SendDecision"("tenantId", "campaignId");

-- CreateIndex
CREATE INDEX "SendDecision_tenantId_channel_recipient_idx" ON "SendDecision"("tenantId", "channel", "recipient");

-- CreateIndex
CREATE INDEX "IysOutbox_status_nextRetryAt_idx" ON "IysOutbox"("status", "nextRetryAt");

-- CreateIndex
CREATE INDEX "IysOutbox_tenantId_channel_address_idx" ON "IysOutbox"("tenantId", "channel", "address");
