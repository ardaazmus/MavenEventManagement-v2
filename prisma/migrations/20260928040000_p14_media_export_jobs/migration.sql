-- CreateTable
CREATE TABLE "MediaExportJob" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "editionId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "idempotencyKey" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "leaseUntil" DATETIME,
    "progressJson" TEXT NOT NULL DEFAULT '{}',
    "resultJson" TEXT,
    "error" TEXT,
    "artifactDir" TEXT,
    "fileTokenHash" TEXT,
    "tokenExpiresAt" DATETIME,
    "expiresAt" DATETIME,
    "createdBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "MediaExportJob_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MediaExportDownload" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "jobId" TEXT NOT NULL,
    "actorName" TEXT,
    "downloadedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MediaExportDownload_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "MediaExportJob" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "MediaExportJob_fileTokenHash_key" ON "MediaExportJob"("fileTokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "MediaExportJob_tenantId_idempotencyKey_key" ON "MediaExportJob"("tenantId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "MediaExportJob_tenantId_status_idx" ON "MediaExportJob"("tenantId", "status");

-- CreateIndex
CREATE INDEX "MediaExportJob_status_leaseUntil_idx" ON "MediaExportJob"("status", "leaseUntil");

-- CreateIndex
CREATE INDEX "MediaExportDownload_jobId_idx" ON "MediaExportDownload"("jobId");
