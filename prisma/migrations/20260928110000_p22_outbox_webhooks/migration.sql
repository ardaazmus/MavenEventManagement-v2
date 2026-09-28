-- CreateTable
CREATE TABLE "WebhookDelivery" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "integrationId" TEXT NOT NULL,
    "deliveryKey" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RECEIVED',
    "statusCode" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WebhookDelivery_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "ApiIntegration" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_OutboxEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT,
    "editionId" TEXT,
    "aggregateType" TEXT NOT NULL,
    "aggregateId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "error" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 5,
    "idempotencyKey" TEXT,
    "lockedAt" DATETIME,
    "lockedBy" TEXT,
    "nextRunAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deadAt" DATETIME,
    "deadReason" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" DATETIME
);
INSERT INTO "new_OutboxEvent" ("aggregateId", "aggregateType", "createdAt", "error", "eventType", "id", "payload", "processedAt", "retryCount", "status") SELECT "aggregateId", "aggregateType", "createdAt", "error", "eventType", "id", "payload", "processedAt", "retryCount", "status" FROM "OutboxEvent";
DROP TABLE "OutboxEvent";
ALTER TABLE "new_OutboxEvent" RENAME TO "OutboxEvent";
CREATE UNIQUE INDEX "OutboxEvent_idempotencyKey_key" ON "OutboxEvent"("idempotencyKey");
CREATE INDEX "OutboxEvent_status_createdAt_idx" ON "OutboxEvent"("status", "createdAt");
CREATE INDEX "OutboxEvent_status_nextRunAt_idx" ON "OutboxEvent"("status", "nextRunAt");
CREATE INDEX "OutboxEvent_tenantId_status_idx" ON "OutboxEvent"("tenantId", "status");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "WebhookDelivery_createdAt_idx" ON "WebhookDelivery"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "WebhookDelivery_integrationId_deliveryKey_key" ON "WebhookDelivery"("integrationId", "deliveryKey");

