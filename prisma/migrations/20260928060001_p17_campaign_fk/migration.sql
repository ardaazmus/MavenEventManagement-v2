-- RedefineTables (SQLite FK sonradan eklenemez — veri korumalı rebuild)
PRAGMA foreign_keys=off;

CREATE TABLE "Campaign_new" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "editionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "segmentRule" TEXT NOT NULL,
    "audienceCount" INTEGER NOT NULL DEFAULT 0,
    "channel" TEXT NOT NULL DEFAULT 'EMAIL',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "phase" TEXT NOT NULL DEFAULT 'PRE_EVENT',
    "audienceMode" TEXT NOT NULL DEFAULT 'SEGMENT',
    "customRecipients" TEXT,
    "templateId" TEXT,
    "libraryTemplateId" TEXT,
    "purpose" TEXT NOT NULL DEFAULT 'COMMERCIAL',
    "providerId" TEXT,
    "formId" TEXT,
    "isSegmentFixed" BOOLEAN NOT NULL DEFAULT true,
    "subject" TEXT,
    "body" TEXT,
    "testSentTo" TEXT,
    "scheduledAt" DATETIME,
    "sentAt" DATETIME,
    "sentCount" INTEGER NOT NULL DEFAULT 0,
    "deliveredCount" INTEGER NOT NULL DEFAULT 0,
    "openCount" INTEGER NOT NULL DEFAULT 0,
    "clickCount" INTEGER NOT NULL DEFAULT 0,
    "failCount" INTEGER NOT NULL DEFAULT 0,
    "channels" TEXT,
    "audienceJson" TEXT,
    "lastSendReport" TEXT,
    CONSTRAINT "Campaign_editionId_fkey" FOREIGN KEY ("editionId") REFERENCES "EventEdition" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Campaign_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "EmailTemplate" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Campaign_libraryTemplateId_fkey" FOREIGN KEY ("libraryTemplateId") REFERENCES "TenantMailTemplate" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Campaign_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "MailProviderConfig" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "Campaign_formId_fkey" FOREIGN KEY ("formId") REFERENCES "FormDefinition" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

INSERT INTO "Campaign_new" ("id", "editionId", "name", "segmentRule", "audienceCount", "channel", "status", "phase", "audienceMode", "customRecipients", "templateId", "libraryTemplateId", "purpose", "providerId", "formId", "isSegmentFixed", "subject", "body", "testSentTo", "scheduledAt", "sentAt", "sentCount", "deliveredCount", "openCount", "clickCount", "failCount", "channels", "audienceJson", "lastSendReport")
    SELECT "id", "editionId", "name", "segmentRule", "audienceCount", "channel", "status", "phase", "audienceMode", "customRecipients", "templateId", "libraryTemplateId", "purpose", "providerId", "formId", "isSegmentFixed", "subject", "body", "testSentTo", "scheduledAt", "sentAt", "sentCount", "deliveredCount", "openCount", "clickCount", "failCount", "channels", "audienceJson", "lastSendReport" FROM "Campaign";

DROP TABLE "Campaign";
ALTER TABLE "Campaign_new" RENAME TO "Campaign";
CREATE INDEX "Campaign_editionId_idx" ON "Campaign"("editionId");

PRAGMA foreign_keys=on;
