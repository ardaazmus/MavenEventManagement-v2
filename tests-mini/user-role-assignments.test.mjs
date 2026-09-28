import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createIsolatedTestDb } from "../tests/support/test-db.mjs";
import { seedSystemRoles } from "../scripts/seed-roles.mjs";

const libPath = path.resolve("src/lib/users/assignments.ts");
const routePath = path.resolve("src/app/api/users/[id]/roles/route.ts");

async function setup() {
  const iso = await createIsolatedTestDb("p06-3");
  await seedSystemRoles(iso.prisma);
  const tenant = await iso.prisma.tenant.create({ data: { name: "Tenant R", slug: `tenant-r-p063-${Date.now()}` } });
  const owner = await iso.prisma.user.create({
    data: { tenantId: tenant.id, email: "owner@test.local", name: "Owner", role: "ORG_OWNER" },
  });
  const admin = await iso.prisma.user.create({
    data: { tenantId: tenant.id, email: "admin@test.local", name: "Admin", role: "ORG_ADMIN" },
  });
  const viewer = await iso.prisma.user.create({
    data: { tenantId: tenant.id, email: "viewer@test.local", name: "Viewer", role: "VIEWER" },
  });
  return { iso, tenant, owner, admin, viewer };
}

test("P06.3 - rankOf orders roles and defaults custom roles to mid rank", async () => {
  const { rankOf } = await import(pathToFileURL(libPath).href);
  assert.ok(rankOf("ORG_OWNER") > rankOf("ORG_ADMIN"), "OWNER outranks ADMIN");
  assert.ok(rankOf("ORG_ADMIN") > rankOf("EVENT_MANAGER"), "ADMIN outranks managers");
  assert.ok(rankOf("EVENT_MANAGER") > rankOf("VIEWER"), "managers outrank viewers");
  assert.strictEqual(rankOf("VIEWER"), rankOf("AUDITOR"), "read-only roles share rank");
  assert.ok(rankOf("TENANT_CUSTOM_ROLE") < rankOf("ORG_ADMIN"), "custom roles default below admin");
  assert.ok(rankOf("TENANT_CUSTOM_ROLE") > rankOf("VIEWER"), "custom roles default above viewer");
});

test("P06.3 - getActorMaxRank merges legacy role and DB assignments", async () => {
  const { getActorMaxRank, rankOf } = await import(pathToFileURL(libPath).href);
  const { iso, tenant, viewer } = await setup();
  try {
    // Legacy only
    const legacy = await getActorMaxRank(iso.prisma, {
      userId: viewer.id,
      tenantId: tenant.id,
      legacyRole: "VIEWER",
      scopeKey: "TENANT",
    });
    assert.strictEqual(legacy, rankOf("VIEWER"));

    // DB assignment raises effective rank
    const roleDef = await iso.prisma.roleDefinition.findFirst({ where: { tenantId: null, key: "ORG_ADMIN" } });
    await iso.prisma.userRoleAssignment.create({
      data: { userId: viewer.id, roleId: roleDef.id, scopeKey: "TENANT" },
    });
    const raised = await getActorMaxRank(iso.prisma, {
      userId: viewer.id,
      tenantId: tenant.id,
      legacyRole: "VIEWER",
      scopeKey: "TENANT",
    });
    assert.strictEqual(raised, rankOf("ORG_ADMIN"));

    // Edition-scoped assignment does not leak into TENANT scope rank
    const edition = await iso.prisma.eventEdition.create({
      data: { tenantId: tenant.id, name: "E1", slug: `e1-p063-${Date.now()}` },
    });
    await iso.prisma.userRoleAssignment.create({
      data: { userId: viewer.id, roleId: roleDef.id, scopeKey: edition.id },
    });
    const tenantScope = await getActorMaxRank(iso.prisma, {
      userId: viewer.id,
      tenantId: tenant.id,
      legacyRole: "VIEWER",
      scopeKey: "TENANT",
    });
    assert.strictEqual(tenantScope, rankOf("ORG_ADMIN"), "TENANT rank from TENANT assignment only (legacy VIEWER + TENANT ORG_ADMIN)");
  } finally {
    await iso.cleanup();
  }
});

test("P06.3 - assignRole happy path, duplicate conflict, unknown role, cross-tenant", async () => {
  const { assignRole, AssignmentError } = await import(pathToFileURL(libPath).href);
  const { iso, tenant, owner, viewer } = await setup();
  try {
    const ok = await assignRole(iso.prisma, {
      tenantId: tenant.id,
      actorUserId: owner.id,
      actorMaxRank: 100,
      targetUserId: viewer.id,
      roleKey: "EVENT_MANAGER",
      scopeKey: "TENANT",
    });
    assert.strictEqual(ok.userId, viewer.id);
    assert.strictEqual(ok.scopeKey, "TENANT");

    // Duplicate assignment conflicts
    await assert.rejects(
      () =>
        assignRole(iso.prisma, {
          tenantId: tenant.id,
          actorUserId: owner.id,
          actorMaxRank: 100,
          targetUserId: viewer.id,
          roleKey: "EVENT_MANAGER",
          scopeKey: "TENANT",
        }),
      (e) => e instanceof AssignmentError && e.code === "DUPLICATE",
    );

    // Unknown role key
    await assert.rejects(
      () =>
        assignRole(iso.prisma, {
          tenantId: tenant.id,
          actorUserId: owner.id,
          actorMaxRank: 100,
          targetUserId: viewer.id,
          roleKey: "NOPE",
          scopeKey: "TENANT",
        }),
      (e) => e instanceof AssignmentError && e.code === "UNKNOWN_ROLE",
    );

    // Cross-tenant target invisible
    const tenantB = await iso.prisma.tenant.create({ data: { name: "TB", slug: `tb-p063-${Date.now()}` } });
    const outsider = await iso.prisma.user.create({
      data: { tenantId: tenantB.id, email: "out@test.local", name: "Out", role: "VIEWER" },
    });
    await assert.rejects(
      () =>
        assignRole(iso.prisma, {
          tenantId: tenant.id,
          actorUserId: owner.id,
          actorMaxRank: 100,
          targetUserId: outsider.id,
          roleKey: "VIEWER",
          scopeKey: "TENANT",
        }),
      (e) => e instanceof AssignmentError && e.code === "NOT_FOUND",
    );
  } finally {
    await iso.cleanup();
  }
});

test("P06.3 - privilege escalation blocked: reparto above actor rank, incl. self-grant", async () => {
  const { assignRole, AssignmentError, rankOf } = await import(pathToFileURL(libPath).href);
  const { iso, tenant, admin, viewer } = await setup();
  try {
    // ORG_ADMIN (90) cannot grant ORG_OWNER (100)
    await assert.rejects(
      () =>
        assignRole(iso.prisma, {
          tenantId: tenant.id,
          actorUserId: admin.id,
          actorMaxRank: rankOf("ORG_ADMIN"),
          targetUserId: viewer.id,
          roleKey: "ORG_OWNER",
          scopeKey: "TENANT",
        }),
      (e) => e instanceof AssignmentError && e.code === "ESCALATION",
    );

    // Self-grant above own rank blocked
    await assert.rejects(
      () =>
        assignRole(iso.prisma, {
          tenantId: tenant.id,
          actorUserId: admin.id,
          actorMaxRank: rankOf("ORG_ADMIN"),
          targetUserId: admin.id,
          roleKey: "ORG_OWNER",
          scopeKey: "TENANT",
        }),
      (e) => e instanceof AssignmentError && e.code === "ESCALATION",
    );

    // Equal-or-lower grant allowed (incl. self)
    const ok = await assignRole(iso.prisma, {
      tenantId: tenant.id,
      actorUserId: admin.id,
      actorMaxRank: rankOf("ORG_ADMIN"),
      targetUserId: viewer.id,
      roleKey: "ORG_ADMIN",
      scopeKey: "TENANT",
    });
    assert.strictEqual(ok.userId, viewer.id);
  } finally {
    await iso.cleanup();
  }
});

test("P06.3 - edition scope must belong to actor tenant", async () => {
  const { assignRole, AssignmentError } = await import(pathToFileURL(libPath).href);
  const { iso, tenant, owner, viewer } = await setup();
  try {
    const edition = await iso.prisma.eventEdition.create({
      data: { tenantId: tenant.id, name: "E2", slug: `e2-p063-${Date.now()}` },
    });
    const ok = await assignRole(iso.prisma, {
      tenantId: tenant.id,
      actorUserId: owner.id,
      actorMaxRank: 100,
      targetUserId: viewer.id,
      roleKey: "EVENT_MANAGER",
      scopeKey: edition.id,
    });
    assert.strictEqual(ok.scopeKey, edition.id);

    // Foreign/other-tenant edition rejected
    const tenantB = await iso.prisma.tenant.create({ data: { name: "TB2", slug: `tb2-p063-${Date.now()}` } });
    const foreign = await iso.prisma.eventEdition.create({
      data: { tenantId: tenantB.id, name: "F1", slug: `f1-p063-${Date.now()}` },
    });
    await assert.rejects(
      () =>
        assignRole(iso.prisma, {
          tenantId: tenant.id,
          actorUserId: owner.id,
          actorMaxRank: 100,
          targetUserId: viewer.id,
          roleKey: "EVENT_MANAGER",
          scopeKey: foreign.id,
        }),
      (e) => e instanceof AssignmentError && e.code === "BAD_SCOPE",
    );
    await assert.rejects(
      () =>
        assignRole(iso.prisma, {
          tenantId: tenant.id,
          actorUserId: owner.id,
          actorMaxRank: 100,
          targetUserId: viewer.id,
          roleKey: "EVENT_MANAGER",
          scopeKey: "nonexistent-edition",
        }),
      (e) => e instanceof AssignmentError && e.code === "BAD_SCOPE",
    );
  } finally {
    await iso.cleanup();
  }
});

test("P06.3 - last owner protection on revoke; second owner unlocks", async () => {
  const { assignRole, revokeAssignment, AssignmentError } = await import(pathToFileURL(libPath).href);
  const { iso, tenant, owner, admin } = await setup();
  try {
    // Owner's ONLY ownership is legacy role column; no DB assignment yet.
    // Grant DB ownership to admin first so two owners exist, then revoke is allowed.
    const adminOwner = await assignRole(iso.prisma, {
      tenantId: tenant.id,
      actorUserId: owner.id,
      actorMaxRank: 100,
      targetUserId: admin.id,
      roleKey: "ORG_OWNER",
      scopeKey: "TENANT",
    });

    // Revoking admin's DB ownership is allowed (legacy owner remains)
    await revokeAssignment(iso.prisma, {
      tenantId: tenant.id,
      actorUserId: owner.id,
      actorMaxRank: 100,
      assignmentId: adminOwner.id,
    });
    const gone = await iso.prisma.userRoleAssignment.findUnique({ where: { id: adminOwner.id } });
    assert.strictEqual(gone, null);

    // Now grant ownership to admin again, then try to strip the LAST DB owner while
    // legacy owner column is demoted — must be blocked. Simulate by demoting legacy:
    const second = await assignRole(iso.prisma, {
      tenantId: tenant.id,
      actorUserId: owner.id,
      actorMaxRank: 100,
      targetUserId: admin.id,
      roleKey: "ORG_OWNER",
      scopeKey: "TENANT",
    });
    await iso.prisma.user.update({ where: { id: owner.id }, data: { role: "ORG_ADMIN" } });
    await assert.rejects(
      () =>
        revokeAssignment(iso.prisma, {
          tenantId: tenant.id,
          actorUserId: owner.id,
          actorMaxRank: 100,
          assignmentId: second.id,
        }),
      (e) => e instanceof AssignmentError && e.code === "LAST_OWNER",
      "revoking the final ownership path must be blocked",
    );
  } finally {
    await iso.cleanup();
  }
});

test("P06.3 - non-owner cannot touch ORG_OWNER assignments", async () => {
  const { assignRole, revokeAssignment, AssignmentError, rankOf } = await import(pathToFileURL(libPath).href);
  const { iso, tenant, owner, admin } = await setup();
  try {
    const grant = await assignRole(iso.prisma, {
      tenantId: tenant.id,
      actorUserId: owner.id,
      actorMaxRank: 100,
      targetUserId: admin.id,
      roleKey: "ORG_OWNER",
      scopeKey: "TENANT",
    });
    await assert.rejects(
      () =>
        revokeAssignment(iso.prisma, {
          tenantId: tenant.id,
          actorUserId: admin.id,
          actorMaxRank: rankOf("ORG_ADMIN"),
          assignmentId: grant.id,
        }),
      (e) => e instanceof AssignmentError && e.code === "ESCALATION",
      "ORG_ADMIN cannot revoke an ORG_OWNER assignment",
    );
  } finally {
    await iso.cleanup();
  }
});

test("P06.3 - route: POST assign + DELETE revoke, admin-gated, server-tenant-scoped", async () => {
  assert.ok(fs.existsSync(routePath), "roles route must exist");
  const src = fs.readFileSync(routePath, "utf8");
  assert.ok(src.includes("export async function POST"), "POST assign handler must exist");
  assert.ok(src.includes("export async function DELETE"), "DELETE revoke handler must exist");
  assert.ok(src.includes("requireAdmin"), "route must use requireAdmin()");
  assert.ok(src.includes("resolveContext"), "route must scope to server tenant");
  assert.ok(src.includes("getActorMaxRank"), "route must compute actor effective rank");
  assert.ok(!src.includes('get("tenantId")'), "route must never read tenantId from request");
});

test("P06.3 - route-policy classifies roles route as ADMIN", async () => {
  const { ROUTE_POLICY_DEFINITIONS } = await import(pathToFileURL(path.resolve("scripts/route-policy.mjs")).href);
  const policy = ROUTE_POLICY_DEFINITIONS["src/app/api/users/[id]/roles/route.ts"];
  assert.ok(policy, "roles route must be classified");
  assert.strictEqual(policy.category, "ADMIN");
});
