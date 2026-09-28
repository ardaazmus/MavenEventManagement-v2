-- CreateTable
CREATE TABLE "LeadCapture" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "editionId" TEXT NOT NULL,
    "agreementId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "capturedByPersonId" TEXT,
    "channel" TEXT NOT NULL DEFAULT 'BADGE_SCAN',
    "note" TEXT,
    "rating" TEXT,
    "capturedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LeadCapture_editionId_fkey" FOREIGN KEY ("editionId") REFERENCES "EventEdition" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "LeadCapture_agreementId_fkey" FOREIGN KEY ("agreementId") REFERENCES "SponsorAgreement" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "LeadCapture_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "LeadCapture_capturedByPersonId_fkey" FOREIGN KEY ("capturedByPersonId") REFERENCES "Person" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MeetingRequest" (
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
    "decidedAt" DATETIME,
    "decidedBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MeetingRequest_editionId_fkey" FOREIGN KEY ("editionId") REFERENCES "EventEdition" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "MeetingRequest_agreementId_fkey" FOREIGN KEY ("agreementId") REFERENCES "SponsorAgreement" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "MeetingRequest_requesterPersonId_fkey" FOREIGN KEY ("requesterPersonId") REFERENCES "Person" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_PortalToken" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tokenHash" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "editionId" TEXT NOT NULL,
    "personId" TEXT,
    "organizationId" TEXT,
    "agreementId" TEXT,
    "issuedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "issuedBy" TEXT,
    "expiresAt" DATETIME NOT NULL,
    "revokedAt" DATETIME,
    "lastUsedAt" DATETIME,
    CONSTRAINT "PortalToken_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PortalToken_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PortalToken_editionId_fkey" FOREIGN KEY ("editionId") REFERENCES "EventEdition" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "PortalToken_agreementId_fkey" FOREIGN KEY ("agreementId") REFERENCES "SponsorAgreement" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_PortalToken" ("editionId", "expiresAt", "id", "issuedAt", "issuedBy", "lastUsedAt", "organizationId", "personId", "revokedAt", "scope", "tokenHash") SELECT "editionId", "expiresAt", "id", "issuedAt", "issuedBy", "lastUsedAt", "organizationId", "personId", "revokedAt", "scope", "tokenHash" FROM "PortalToken";
DROP TABLE "PortalToken";
ALTER TABLE "new_PortalToken" RENAME TO "PortalToken";
CREATE UNIQUE INDEX "PortalToken_tokenHash_key" ON "PortalToken"("tokenHash");
CREATE INDEX "PortalToken_personId_idx" ON "PortalToken"("personId");
CREATE INDEX "PortalToken_organizationId_idx" ON "PortalToken"("organizationId");
CREATE INDEX "PortalToken_editionId_idx" ON "PortalToken"("editionId");
CREATE INDEX "PortalToken_agreementId_idx" ON "PortalToken"("agreementId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "LeadCapture_editionId_agreementId_idx" ON "LeadCapture"("editionId", "agreementId");

-- CreateIndex
CREATE INDEX "LeadCapture_capturedAt_idx" ON "LeadCapture"("capturedAt");

-- CreateIndex
CREATE UNIQUE INDEX "LeadCapture_agreementId_personId_key" ON "LeadCapture"("agreementId", "personId");

-- CreateIndex
CREATE INDEX "MeetingRequest_agreementId_slotStart_idx" ON "MeetingRequest"("agreementId", "slotStart");

-- CreateIndex
CREATE INDEX "MeetingRequest_editionId_status_idx" ON "MeetingRequest"("editionId", "status");

