-- CreateTable
CREATE TABLE "ExportJob" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "editionId" TEXT,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'READY',
    "paramsJson" TEXT NOT NULL DEFAULT '{}',
    "rowCount" INTEGER,
    "fileTokenHash" TEXT,
    "tokenExpiresAt" DATETIME,
    "createdBy" TEXT,
    "decidedBy" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" DATETIME,
    CONSTRAINT "ExportJob_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ExportDownload" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "jobId" TEXT NOT NULL,
    "actorName" TEXT,
    "downloadedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ExportDownload_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "ExportJob" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "ExportJob_fileTokenHash_key" ON "ExportJob"("fileTokenHash");

-- CreateIndex
CREATE INDEX "ExportJob_tenantId_status_idx" ON "ExportJob"("tenantId", "status");

-- CreateIndex
CREATE INDEX "ExportDownload_jobId_idx" ON "ExportDownload"("jobId");
