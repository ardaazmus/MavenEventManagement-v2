import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createIsolatedTestDb } from "../tests/support/test-db.mjs";

test("P05.1 - Schema and migration files define role and scope models", () => {
  const schemaPath = path.resolve("prisma/schema.prisma");
  assert.ok(fs.existsSync(schemaPath), "prisma/schema.prisma must exist");
  const schemaContent = fs.readFileSync(schemaPath, "utf8");

  assert.ok(schemaContent.includes("model RoleDefinition"), "schema must define RoleDefinition");
  assert.ok(schemaContent.includes("model RolePermission"), "schema must define RolePermission");
  assert.ok(schemaContent.includes("model UserRoleAssignment"), "schema must define UserRoleAssignment");

  // Migration file check
  const migrationFile = path.resolve("prisma/migrations/20260928023500_p05_role_scope_model/migration.sql");
  assert.ok(fs.existsSync(migrationFile), "migration.sql must exist in 20260928023500_p05_role_scope_model");
  const migrationContent = fs.readFileSync(migrationFile, "utf8");

  assert.ok(migrationContent.includes('CREATE TABLE "RoleDefinition"'), "migration creates RoleDefinition");
  assert.ok(migrationContent.includes('CREATE TABLE "RolePermission"'), "migration creates RolePermission");
  assert.ok(migrationContent.includes('CREATE TABLE "UserRoleAssignment"'), "migration creates UserRoleAssignment");
  assert.ok(
    migrationContent.includes('CREATE UNIQUE INDEX "UserRoleAssignment_userId_roleId_scopeKey_key"'),
    "migration creates composite unique index on UserRoleAssignment(userId, roleId, scopeKey)"
  );
});

test("P05.1 - Database enforces RoleDefinition and RolePermission uniqueness", async () => {
  const testDb = await createIsolatedTestDb("p05-roles");
  const { prisma } = testDb;

  try {
    const tenant = await prisma.tenant.create({
      data: {
        id: "tenant-role-test-1",
        slug: "tenant-role-test-1",
        name: "Test Tenant for Roles",
      },
    });

    // 1. RoleDefinition unique constraint on (tenantId, key)
    const role1 = await prisma.roleDefinition.create({
      data: {
        tenantId: tenant.id,
        key: "CUSTOM_MANAGER",
        name: "Custom Manager",
      },
    });
    assert.ok(role1.id, "RoleDefinition created");

    await assert.rejects(
      async () => {
        await prisma.roleDefinition.create({
          data: {
            tenantId: tenant.id,
            key: "CUSTOM_MANAGER",
            name: "Duplicate Custom Manager",
          },
        });
      },
      (err) => {
        assert.ok(err.message.includes("Unique constraint failed") || err.code === "P2002");
        return true;
      },
      "Must reject duplicate RoleDefinition with same (tenantId, key)"
    );

    // 2. RolePermission unique constraint on (roleId, module, action)
    const perm1 = await prisma.rolePermission.create({
      data: {
        roleId: role1.id,
        module: "finance",
        action: "VIEW",
        scopeType: "EDITION",
      },
    });
    assert.ok(perm1.id, "RolePermission created");

    await assert.rejects(
      async () => {
        await prisma.rolePermission.create({
          data: {
            roleId: role1.id,
            module: "finance",
            action: "VIEW",
            scopeType: "TENANT", // even with different scopeType, (roleId, module, action) must be unique
          },
        });
      },
      (err) => {
        assert.ok(err.message.includes("Unique constraint failed") || err.code === "P2002");
        return true;
      },
      "Must reject duplicate RolePermission with same (roleId, module, action)"
    );

    // Different action on same module must succeed
    const perm2 = await prisma.rolePermission.create({
      data: {
        roleId: role1.id,
        module: "finance",
        action: "UPDATE",
        scopeType: "EDITION",
      },
    });
    assert.ok(perm2.id, "Different action succeeds");
  } finally {
    await testDb.cleanup();
  }
});

test("P05.1 - Database enforces UserRoleAssignment scopeKey isolation and uniqueness", async () => {
  const testDb = await createIsolatedTestDb("p05-assignment");
  const { prisma } = testDb;

  try {
    const tenant = await prisma.tenant.create({
      data: {
        id: "tenant-assign-test",
        slug: "tenant-assign-test",
        name: "Assignment Test Tenant",
      },
    });

    const user = await prisma.user.create({
      data: {
        id: "user-assign-test-1",
        email: "assignee@example.com",
        name: "Assignee User",
        tenantId: tenant.id,
        role: "MEMBER",
      },
    });

    const role = await prisma.roleDefinition.create({
      data: {
        tenantId: tenant.id,
        key: "EVENT_OPERATOR",
        name: "Event Operator",
      },
    });

    // 1. Initial assignment at TENANT scope
    const assignmentTenant = await prisma.userRoleAssignment.create({
      data: {
        userId: user.id,
        roleId: role.id,
        scopeKey: "TENANT",
      },
    });
    assert.ok(assignmentTenant.id, "UserRoleAssignment at TENANT scope created");

    // 2. Duplicate assignment with identical scopeKey must fail
    await assert.rejects(
      async () => {
        await prisma.userRoleAssignment.create({
          data: {
            userId: user.id,
            roleId: role.id,
            scopeKey: "TENANT",
          },
        });
      },
      (err) => {
        assert.ok(err.message.includes("Unique constraint failed") || err.code === "P2002");
        return true;
      },
      "Duplicate UserRoleAssignment with identical (userId, roleId, scopeKey) must be rejected"
    );

    // 3. Assignment for different edition scopes must succeed
    const assignmentEditionA = await prisma.userRoleAssignment.create({
      data: {
        userId: user.id,
        roleId: role.id,
        scopeKey: "edition_alpha_2026",
      },
    });
    assert.ok(assignmentEditionA.id, "UserRoleAssignment for edition_alpha_2026 succeeds");

    const assignmentEditionB = await prisma.userRoleAssignment.create({
      data: {
        userId: user.id,
        roleId: role.id,
        scopeKey: "edition_beta_2026",
      },
    });
    assert.ok(assignmentEditionB.id, "UserRoleAssignment for edition_beta_2026 succeeds");

    // Total assignments for user should be 3
    const count = await prisma.userRoleAssignment.count({
      where: { userId: user.id, roleId: role.id },
    });
    assert.strictEqual(count, 3, "User should have 3 distinct scoped assignments");

    // 4. Cascade delete: deleting user deletes assignments
    await prisma.user.delete({ where: { id: user.id } });
    const remainingCount = await prisma.userRoleAssignment.count({
      where: { roleId: role.id },
    });
    assert.strictEqual(remainingCount, 0, "Deleting user must cascade-delete all role assignments");
  } finally {
    await testDb.cleanup();
  }
});
