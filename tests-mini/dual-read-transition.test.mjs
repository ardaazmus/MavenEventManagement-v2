import test from "node:test";
import assert from "node:assert/strict";
import { createIsolatedTestDb } from "../tests/support/test-db.mjs";
import { seedSystemRoles } from "../scripts/seed-roles.mjs";
import {
  authorizeDualRead,
  getFallbackMetrics,
  resetFallbackMetrics,
} from "../src/lib/api/permissions.ts";

test("P05.3 - DB RBAC primary path authorizes via RoleDefinition and RolePermission", async () => {
  resetFallbackMetrics();
  const testDb = await createIsolatedTestDb("p05-dualread-primary");
  const { prisma } = testDb;

  try {
    // 1. Seed system roles
    await seedSystemRoles(prisma);

    const tenant = await prisma.tenant.create({
      data: {
        id: "tenant-dual-read-1",
        slug: "tenant-dual-read-1",
        name: "Dual Read Test Tenant",
      },
    });

    const user = await prisma.user.create({
      data: {
        id: "user-event-mgr",
        email: "eventmgr@example.com",
        name: "Event Manager User",
        tenantId: tenant.id,
        role: "MEMBER", // legacy role is generic MEMBER
      },
    });

    const eventManagerRole = await prisma.roleDefinition.findFirst({
      where: { key: "EVENT_MANAGER", tenantId: null },
    });
    assert.ok(eventManagerRole, "EVENT_MANAGER role definition must exist");

    // Assign EVENT_MANAGER to user at TENANT scope
    await prisma.userRoleAssignment.create({
      data: {
        userId: user.id,
        roleId: eventManagerRole.id,
        scopeKey: "TENANT",
      },
    });

    // 2. Authorize via DB RBAC
    const actor = {
      uid: user.id,
      role: "MEMBER",
      tenantId: tenant.id,
    };

    const resView = await authorizeDualRead({
      actor,
      entity: "registrations",
      action: "VIEW",
      prisma,
    });
    assert.strictEqual(resView.authorized, true, "EVENT_MANAGER must be authorized to VIEW registrations");
    assert.strictEqual(resView.source, "db_rbac", "Source must be db_rbac");

    const resCreate = await authorizeDualRead({
      actor,
      entity: "expenses",
      action: "CREATE",
      prisma,
    });
    assert.strictEqual(resCreate.authorized, true, "EVENT_MANAGER must be authorized to CREATE expenses");
    assert.strictEqual(resCreate.source, "db_rbac", "Source must be db_rbac");

    // 3. Explicit Denial via DB RBAC (EVENT_MANAGER cannot DELETE tenants)
    const resDenied = await authorizeDualRead({
      actor,
      entity: "tenants",
      action: "DELETE",
      prisma,
    });
    assert.strictEqual(resDenied.authorized, false, "EVENT_MANAGER must be denied DELETE on tenants");
    assert.strictEqual(resDenied.source, "db_rbac", "Source must be db_rbac (explicit denial, not fallback)");

    // Verify zero fallbacks occurred
    const metrics = getFallbackMetrics();
    assert.strictEqual(metrics.totalFallbacks, 0, "No fallbacks should occur when user has DB role assignments");
  } finally {
    await testDb.cleanup();
  }
});

test("P05.3 - Legacy fallback path activates and tracks telemetry when user has no DB assignments", async () => {
  resetFallbackMetrics();
  const testDb = await createIsolatedTestDb("p05-dualread-fallback");
  const { prisma } = testDb;

  try {
    const tenant = await prisma.tenant.create({
      data: {
        id: "tenant-legacy-1",
        slug: "tenant-legacy-1",
        name: "Legacy Tenant",
      },
    });

    // User with legacy session role "FINANCE_MANAGER" and NO assignments in UserRoleAssignment table
    const legacyUser = await prisma.user.create({
      data: {
        id: "user-legacy-fin",
        email: "legacyfin@example.com",
        name: "Legacy Finance User",
        tenantId: tenant.id,
        role: "FINANCE_MANAGER",
      },
    });

    const actor = {
      uid: legacyUser.id,
      role: "FINANCE_MANAGER",
      tenantId: tenant.id,
    };

    // 1. Permitted action in legacy dictionary -> fallback granted
    const res1 = await authorizeDualRead({
      actor,
      entity: "expenses",
      action: "VIEW",
      prisma,
    });
    assert.strictEqual(res1.authorized, true, "FINANCE_MANAGER must be authorized to VIEW expenses");
    assert.strictEqual(res1.source, "legacy_fallback", "Source must be legacy_fallback");
    assert.strictEqual(res1.reason, "NO_DB_ASSIGNMENTS", "Reason must be NO_DB_ASSIGNMENTS");

    // 2. Forbidden action in legacy dictionary -> fallback denied
    const res2 = await authorizeDualRead({
      actor,
      entity: "submissions",
      action: "CREATE",
      prisma,
    });
    assert.strictEqual(res2.authorized, false, "FINANCE_MANAGER must be denied CREATE on submissions");
    assert.strictEqual(res2.source, "legacy_fallback", "Source must be legacy_fallback");

    // 3. Telemetry metrics validation
    const metrics = getFallbackMetrics();
    assert.strictEqual(metrics.totalFallbacks, 2, "Must record exactly 2 fallback events");
    assert.strictEqual(metrics.grantedCount, 1, "Must record 1 granted fallback");
    assert.strictEqual(metrics.deniedCount, 1, "Must record 1 denied fallback");
    assert.strictEqual(metrics.byRole["FINANCE_MANAGER"], 2, "byRole must count FINANCE_MANAGER");
    assert.strictEqual(metrics.byEntity["expenses"], 1, "byEntity must track expenses");
    assert.strictEqual(metrics.byEntity["submissions"], 1, "byEntity must track submissions");
    assert.strictEqual(metrics.events.length, 2, "Must log 2 event entries");
  } finally {
    await testDb.cleanup();
  }
});

test("P05.3 - ScopeKey isolation and demo mode bypass in dual read", async () => {
  resetFallbackMetrics();
  const testDb = await createIsolatedTestDb("p05-dualread-scope");
  const { prisma } = testDb;

  try {
    await seedSystemRoles(prisma);

    const tenant = await prisma.tenant.create({
      data: {
        id: "tenant-scope-test",
        slug: "tenant-scope-test",
        name: "Scope Test Tenant",
      },
    });

    const user = await prisma.user.create({
      data: {
        id: "user-sponsorship-scoped",
        email: "sponsor-mgr@example.com",
        name: "Scoped Sponsor Manager",
        tenantId: tenant.id,
        role: "MEMBER",
      },
    });

    const sponsorRole = await prisma.roleDefinition.findFirst({
      where: { key: "SPONSORSHIP_MANAGER", tenantId: null },
    });
    assert.ok(sponsorRole, "SPONSORSHIP_MANAGER role definition must exist");

    // Assign role ONLY for edition "edition_2026_alpha"
    await prisma.userRoleAssignment.create({
      data: {
        userId: user.id,
        roleId: sponsorRole.id,
        scopeKey: "edition_2026_alpha",
      },
    });

    const actor = {
      uid: user.id,
      role: "MEMBER",
      tenantId: tenant.id,
    };

    // Request in assigned edition scope -> GRANTED via DB RBAC
    const resAlpha = await authorizeDualRead({
      actor,
      entity: "sponsor-packages",
      action: "VIEW",
      scopeKey: "edition_2026_alpha",
      prisma,
    });
    assert.strictEqual(resAlpha.authorized, true, "Must be authorized in assigned edition scope");
    assert.strictEqual(resAlpha.source, "db_rbac");

    // Request in different edition scope -> No assignments for edition_2026_beta or TENANT -> falls back to MEMBER (denied)
    const resBeta = await authorizeDualRead({
      actor,
      entity: "sponsor-packages",
      action: "VIEW",
      scopeKey: "edition_2026_beta",
      prisma,
    });
    assert.strictEqual(resBeta.authorized, false, "Must be denied in unassigned edition scope");

    // 4. Demo mode bypass (auth-off or null actor)
    const resDemo = await authorizeDualRead({
      actor: null,
      entity: "registrations",
      action: "CREATE",
      prisma,
    });
    assert.strictEqual(resDemo.authorized, true, "Demo mode must allow open access");
    assert.strictEqual(resDemo.source, "demo_bypass");
  } finally {
    await testDb.cleanup();
  }
});
