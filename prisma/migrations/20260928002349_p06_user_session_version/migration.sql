-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tenantId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'ORG_ADMIN',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "passwordHash" TEXT,
    "mfaSecretCipher" TEXT,
    "mfaEnabled" BOOLEAN NOT NULL DEFAULT false,
    "recoveryCodes" TEXT,
    "failedLoginCount" INTEGER NOT NULL DEFAULT 0,
    "sessionVersion" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" DATETIME,
    "lastLoginAt" DATETIME,
    "consentVersion" TEXT,
    "consentAcceptedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "User_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_User" ("consentAcceptedAt", "consentVersion", "createdAt", "email", "failedLoginCount", "id", "lastLoginAt", "lockedUntil", "mfaEnabled", "mfaSecretCipher", "name", "passwordHash", "recoveryCodes", "role", "status", "tenantId") SELECT "consentAcceptedAt", "consentVersion", "createdAt", "email", "failedLoginCount", "id", "lastLoginAt", "lockedUntil", "mfaEnabled", "mfaSecretCipher", "name", "passwordHash", "recoveryCodes", "role", "status", "tenantId" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
