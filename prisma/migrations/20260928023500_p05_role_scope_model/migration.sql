-- CreateTable
CREATE TABLE "RoleDefinition" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "RoleDefinition_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RolePermission" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "roleId" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "scopeType" TEXT NOT NULL DEFAULT 'EDITION',
    "conditionJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RolePermission_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "RoleDefinition" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "UserRoleAssignment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "scopeKey" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "UserRoleAssignment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "UserRoleAssignment_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "RoleDefinition" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "RoleDefinition_tenantId_idx" ON "RoleDefinition"("tenantId");

-- CreateIndex
CREATE INDEX "RoleDefinition_key_idx" ON "RoleDefinition"("key");

-- CreateIndex
CREATE UNIQUE INDEX "RoleDefinition_tenantId_key_key" ON "RoleDefinition"("tenantId", "key");

-- CreateIndex
CREATE INDEX "RolePermission_roleId_idx" ON "RolePermission"("roleId");

-- CreateIndex
CREATE INDEX "RolePermission_module_action_idx" ON "RolePermission"("module", "action");

-- CreateIndex
CREATE UNIQUE INDEX "RolePermission_roleId_module_action_key" ON "RolePermission"("roleId", "module", "action");

-- CreateIndex
CREATE INDEX "UserRoleAssignment_userId_idx" ON "UserRoleAssignment"("userId");

-- CreateIndex
CREATE INDEX "UserRoleAssignment_roleId_idx" ON "UserRoleAssignment"("roleId");

-- CreateIndex
CREATE INDEX "UserRoleAssignment_scopeKey_idx" ON "UserRoleAssignment"("scopeKey");

-- CreateIndex
CREATE UNIQUE INDEX "UserRoleAssignment_userId_roleId_scopeKey_key" ON "UserRoleAssignment"("userId", "roleId", "scopeKey");
