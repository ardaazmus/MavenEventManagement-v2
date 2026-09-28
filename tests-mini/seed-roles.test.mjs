import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createIsolatedTestDb } from "../tests/support/test-db.mjs";
import {
  SYSTEM_ROLE_DEFINITIONS,
  seedSystemRoles,
} from "../scripts/seed-roles.mjs";
import { MODULE_IDS, ACTIONS } from "../src/lib/api/permissions.ts";

test("P05.2 - scripts/seed-roles.mjs exists and defines 11 system roles with valid modules and actions", () => {
  const scriptPath = path.resolve("scripts/seed-roles.mjs");
  assert.ok(fs.existsSync(scriptPath), "scripts/seed-roles.mjs must exist");

  assert.strictEqual(
    SYSTEM_ROLE_DEFINITIONS.length,
    11,
    "Must define exactly 11 standard system roles"
  );

  const keys = SYSTEM_ROLE_DEFINITIONS.map((r) => r.key);
  const expectedKeys = [
    "ORG_OWNER",
    "ORG_ADMIN",
    "EVENT_MANAGER",
    "FINANCE_MANAGER",
    "REGISTRATION_MANAGER",
    "SPONSORSHIP_MANAGER",
    "SCIENTIFIC_MANAGER",
    "PROGRAM_MANAGER",
    "ONSITE_MANAGER",
    "VIEWER",
    "AUDITOR",
  ];
  assert.deepStrictEqual(keys.sort(), expectedKeys.sort(), "All 11 standard role keys must be defined");

  const validModules = new Set(MODULE_IDS);
  const validActions = new Set(ACTIONS);

  for (const role of SYSTEM_ROLE_DEFINITIONS) {
    assert.ok(role.name, `Role ${role.key} must have name`);
    assert.ok(role.permissions.length > 0, `Role ${role.key} must have permissions`);

    for (const p of role.permissions) {
      assert.ok(
        validModules.has(p.module),
        `Role ${role.key} permission module ${p.module} must be in MODULE_IDS`
      );
      assert.ok(
        validActions.has(p.action),
        `Role ${role.key} permission action ${p.action} must be in ACTIONS`
      );
      assert.ok(
        ["GLOBAL", "TENANT", "EDITION"].includes(p.scopeType),
        `Permission scopeType ${p.scopeType} must be GLOBAL, TENANT, or EDITION`
      );
    }
  }
});

test("P05.2 - seedSystemRoles is idempotent and deterministic across repeated runs", async () => {
  const testDb = await createIsolatedTestDb("p05-seed-idempotency");
  const { prisma } = testDb;

  try {
    // ── Run 1: First seed on clean migrated DB ──
    const run1 = await seedSystemRoles(prisma);
    assert.strictEqual(run1.totalRolesInDb, 11, "Run 1 must create 11 system roles");
    assert.strictEqual(run1.totalPermissionsInDb, 716, "Run 1 must create 716 system role permissions");
    assert.ok(run1.digest, "Run 1 must emit a deterministic digest");

    // Verify all roles in DB have isSystem: true and tenantId: null
    const rolesInDb = await prisma.roleDefinition.findMany({
      where: { isSystem: true },
    });
    assert.strictEqual(rolesInDb.length, 11, "Must have 11 system roles in DB");
    for (const r of rolesInDb) {
      assert.strictEqual(r.tenantId, null, "System role tenantId must be null");
      assert.strictEqual(r.isSystem, true, "isSystem must be true");
    }

    // ── Run 2: Second consecutive seed on the same DB ──
    const run2 = await seedSystemRoles(prisma);
    assert.strictEqual(
      run2.totalRolesInDb,
      11,
      "Run 2 must NOT duplicate roles (must remain 11)"
    );
    assert.strictEqual(
      run2.totalPermissionsInDb,
      716,
      "Run 2 must NOT duplicate permissions (must remain 716)"
    );
    assert.strictEqual(
      run2.digest,
      run1.digest,
      "Deterministic digest must be identical across consecutive runs"
    );

    // ── Run 3: Adding a tenant-custom role must not conflict with system seed ──
    const tenant = await prisma.tenant.create({
      data: {
        id: "tenant-custom-roles-test",
        slug: "tenant-custom-roles-test",
        name: "Tenant with Custom Role",
      },
    });

    await prisma.roleDefinition.create({
      data: {
        tenantId: tenant.id,
        key: "CUSTOM_COORDINATOR",
        name: "Custom Coordinator",
        isSystem: false,
      },
    });

    const run3 = await seedSystemRoles(prisma);
    assert.strictEqual(
      run3.totalRolesInDb,
      11,
      "Run 3 must only track 11 system roles"
    );
    assert.strictEqual(
      run3.totalPermissionsInDb,
      716,
      "Run 3 permissions must remain 716"
    );
    assert.strictEqual(
      run3.digest,
      run1.digest,
      "Digest of system roles must remain identical"
    );

    // Total roles including custom role in DB should now be 12
    const totalAllRoles = await prisma.roleDefinition.count();
    assert.strictEqual(totalAllRoles, 12, "Total roles in DB must be 12 (11 system + 1 custom)");
  } finally {
    await testDb.cleanup();
  }
});
