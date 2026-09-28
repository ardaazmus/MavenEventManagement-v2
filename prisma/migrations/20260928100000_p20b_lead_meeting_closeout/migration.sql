-- CreateTable
CREATE TABLE "SponsorAvailability" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "editionId" TEXT NOT NULL,
    "agreementId" TEXT NOT NULL,
    "slotStart" DATETIME NOT NULL,
    "slotEnd" DATETIME NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'Europe/Istanbul',
    "label" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SponsorAvailability_editionId_fkey" FOREIGN KEY ("editionId") REFERENCES "EventEdition" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SponsorAvailability_agreementId_fkey" FOREIGN KEY ("agreementId") REFERENCES "SponsorAgreement" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SponsorFavorite" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "editionId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SponsorFavorite_editionId_fkey" FOREIGN KEY ("editionId") REFERENCES "EventEdition" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SponsorFavorite_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SponsorFavorite_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_LeadCapture" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "editionId" TEXT NOT NULL,
    "agreementId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "capturedByPersonId" TEXT,
    "channel" TEXT NOT NULL DEFAULT 'BADGE_SCAN',
    "note" TEXT,
    "rating" TEXT,
    "capturedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clientKey" TEXT,
    "consentPurpose" TEXT NOT NULL DEFAULT 'SPONSOR_FOLLOWUP',
    "consentAtCapture" TEXT,
    "expiresAt" DATETIME,
    CONSTRAINT "LeadCapture_editionId_fkey" FOREIGN KEY ("editionId") REFERENCES "EventEdition" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "LeadCapture_agreementId_fkey" FOREIGN KEY ("agreementId") REFERENCES "SponsorAgreement" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "LeadCapture_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "LeadCapture_capturedByPersonId_fkey" FOREIGN KEY ("capturedByPersonId") REFERENCES "Person" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_LeadCapture" ("agreementId", "capturedAt", "capturedByPersonId", "channel", "editionId", "id", "note", "personId", "rating") SELECT "agreementId", "capturedAt", "capturedByPersonId", "channel", "editionId", "id", "note", "personId", "rating" FROM "LeadCapture";
DROP TABLE "LeadCapture";
ALTER TABLE "new_LeadCapture" RENAME TO "LeadCapture";
CREATE INDEX "LeadCapture_editionId_agreementId_idx" ON "LeadCapture"("editionId", "agreementId");
CREATE INDEX "LeadCapture_capturedAt_idx" ON "LeadCapture"("capturedAt");
CREATE INDEX "LeadCapture_expiresAt_idx" ON "LeadCapture"("expiresAt");
CREATE UNIQUE INDEX "LeadCapture_agreementId_personId_key" ON "LeadCapture"("agreementId", "personId");
CREATE UNIQUE INDEX "LeadCapture_agreementId_clientKey_key" ON "LeadCapture"("agreementId", "clientKey");
CREATE TABLE "new_MeetingRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "editionId" TEXT NOT NULL,
    "agreementId" TEXT NOT NULL,
    "requesterPersonId" TEXT NOT NULL,
    "title" TEXT,
    "slotStart" DATETIME NOT NULL,
    "slotEnd" DATETIME NOT NULL,
    "location" TEXT,
    "note" TEXT,
    "status" TEXT NOT NULL DEFAULT 'REQUESTED',
    "timezone" TEXT NOT NULL DEFAULT 'Europe/Istanbul',
    "decidedAt" DATETIME,
    "decidedBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MeetingRequest_editionId_fkey" FOREIGN KEY ("editionId") REFERENCES "EventEdition" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "MeetingRequest_agreementId_fkey" FOREIGN KEY ("agreementId") REFERENCES "SponsorAgreement" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "MeetingRequest_requesterPersonId_fkey" FOREIGN KEY ("requesterPersonId") REFERENCES "Person" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_MeetingRequest" ("agreementId", "createdAt", "decidedAt", "decidedBy", "editionId", "id", "location", "note", "requesterPersonId", "slotEnd", "slotStart", "status", "title") SELECT "agreementId", "createdAt", "decidedAt", "decidedBy", "editionId", "id", "location", "note", "requesterPersonId", "slotEnd", "slotStart", "status", "title" FROM "MeetingRequest";
DROP TABLE "MeetingRequest";
ALTER TABLE "new_MeetingRequest" RENAME TO "MeetingRequest";
CREATE INDEX "MeetingRequest_agreementId_slotStart_idx" ON "MeetingRequest"("agreementId", "slotStart");
CREATE INDEX "MeetingRequest_editionId_status_idx" ON "MeetingRequest"("editionId", "status");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "SponsorAvailability_agreementId_slotStart_idx" ON "SponsorAvailability"("agreementId", "slotStart");

-- CreateIndex
CREATE INDEX "SponsorAvailability_editionId_idx" ON "SponsorAvailability"("editionId");

-- CreateIndex
CREATE INDEX "SponsorFavorite_editionId_organizationId_idx" ON "SponsorFavorite"("editionId", "organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "SponsorFavorite_editionId_organizationId_personId_key" ON "SponsorFavorite"("editionId", "organizationId", "personId");

