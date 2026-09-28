-- CreateTable
CREATE TABLE "EditionArchive" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "editionId" TEXT NOT NULL,
    "snapshotJson" TEXT NOT NULL,
    "createdBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EditionArchive_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "EditionArchive_editionId_key" ON "EditionArchive"("editionId");

-- CreateIndex
CREATE INDEX "EditionArchive_tenantId_idx" ON "EditionArchive"("tenantId");
