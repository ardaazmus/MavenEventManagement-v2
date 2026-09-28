import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createIsolatedTestDb } from "../tests/support/test-db.mjs";
import { seedSystemRoles } from "../scripts/seed-roles.mjs";

const libPath = path.resolve("src/lib/users/lifecycle.ts");
const routePath = path.resolve("src/app/api/users/[id]/status/route.ts");

async function setup() {
  const iso = await createIsolatedTestDb("p06-4a");
  await seedSystemRoles(iso.prisma);
  const tenant = await iso.prisma.tenant.create({ data: { name: "Tenant L", slug: `tenant-l-p064a-${Date.now()}` } });
  const owner = await iso.prisma.user.create({
    data: { tenantId: tenant.id, email: "owner@test.local", name: "Owner", role: "ORG_OWNER" },
  });
  const admin = await iso.prisma.user.create({
    data: { tenantId: tenant.id, email: "admin@test.local", name: "Admin", role: "ORG_ADMIN" },
  });
  return { iso, tenant, owner, admin };
}

test("P06.4a - disableUser sets DISABLED and bumps sessionVersion exactly once", async () => {
  const { disableUser } = await import(pathToFileURL(libPath).href);
  const { iso, tenant, owner, admin } = await setup();
  try {
    const first = await disableUser(iso.prisma, {
      tenantId: tenant.id,
      actorUserId: owner.id,
      actorMaxRank: 100,
      targetUserId: admin.id,
    });
    assert.strictEqual(first.status, "DISABLED");
    assert.strictEqual(first.sessionVersion, 1);

    const row = await iso.prisma.user.findUnique({ where: { id: admin.id } });
    assert.strictEqual(row.status, "DISABLED");
    assert.strictEqual(row.sessionVersion, 1);

    // Idempotent re-disable: no further version bump
    const second = await disableUser(iso.prisma, {
      tenantId: tenant.id,
      actorUserId: owner.id,
      actorMaxRank: 100,
      targetUserId: admin.id,
    });
    assert.strictEqual(second.status, "DISABLED");
    assert.strictEqual(second.sessionVersion, 1, "re-disable must not bump version again");
  } finally {
    await iso.cleanup();
  }
});

test("P06.4a - enableUser reactivates without restoring old session version", async () => {
  const { disableUser, enableUser } = await import(pathToFileURL(libPath).href);
  const { iso, tenant, owner, admin } = await setup();
  try {
    await disableUser(iso.prisma, { tenantId: tenant.id, actorUserId: owner.id, actorMaxRank: 100, targetUserId: admin.id });
    const enabled = await enableUser(iso.prisma, {
      tenantId: tenant.id,
      actorUserId: owner.id,
      actorMaxRank: 100,
      targetUserId: admin.id,
    });
    assert.strictEqual(enabled.status, "ACTIVE");
    assert.strictEqual(enabled.sessionVersion, 1, "pre-disable cookies must stay dead after re-enable");
  } finally {
    await iso.cleanup();
  }
});

test("P06.4a - last-owner disable blocked; second owner unlocks; self-disable allowed otherwise", async () => {
  const { disableUser, LifecycleError } = await import(pathToFileURL(libPath).href);
  const { iso, tenant, owner, admin } = await setup();
  try {
    // Sole owner cannot be disabled (even by self)
    await assert.rejects(
      () => disableUser(iso.prisma, { tenantId: tenant.id, actorUserId: owner.id, actorMaxRank: 100, targetUserId: owner.id }),
      (e) => e instanceof LifecycleError && e.code === "LAST_OWNER",
    );

    // Promote admin to second owner via DB assignment, then owner self-disable allowed
    const ownerRole = await iso.prisma.roleDefinition.findFirst({ where: { tenantId: null, key: "ORG_OWNER" } });
    await iso.prisma.userRoleAssignment.create({
      data: { userId: admin.id, roleId: ownerRole.id, scopeKey: "TENANT" },
    });
    const selfDisabled = await disableUser(iso.prisma, {
      tenantId: tenant.id,
      actorUserId: owner.id,
      actorMaxRank: 100,
      targetUserId: owner.id,
    });
    assert.strictEqual(selfDisabled.status, "DISABLED");

    // Now admin is the last ownership path — disabling them is blocked
    await assert.rejects(
      () => disableUser(iso.prisma, { tenantId: tenant.id, actorUserId: admin.id, actorMaxRank: 100, targetUserId: admin.id }),
      (e) => e instanceof LifecycleError && e.code === "LAST_OWNER",
    );
  } finally {
    await iso.cleanup();
  }
});

test("P06.4a - rank rule: only owners disable owners; cross-tenant invisible", async () => {
  const { disableUser, LifecycleError } = await import(pathToFileURL(libPath).href);
  const { iso, tenant, owner, admin } = await setup();
  try {
    await assert.rejects(
      () => disableUser(iso.prisma, { tenantId: tenant.id, actorUserId: admin.id, actorMaxRank: 90, targetUserId: owner.id }),
      (e) => e instanceof LifecycleError && e.code === "ESCALATION",
      "ORG_ADMIN cannot disable an ORG_OWNER",
    );

    const tenantB = await iso.prisma.tenant.create({ data: { name: "TB", slug: `tb-p064a-${Date.now()}` } });
    const outsider = await iso.prisma.user.create({
      data: { tenantId: tenantB.id, email: "out@test.local", name: "Out", role: "VIEWER" },
    });
    await assert.rejects(
      () => disableUser(iso.prisma, { tenantId: tenant.id, actorUserId: owner.id, actorMaxRank: 100, targetUserId: outsider.id }),
      (e) => e instanceof LifecycleError && e.code === "NOT_FOUND",
    );
  } finally {
    await iso.cleanup();
  }
});

test("P06.4a - route: PATCH status, admin-gated, server-tenant-scoped", async () => {
  assert.ok(fs.existsSync(routePath), "status route must exist");
  const src = fs.readFileSync(routePath, "utf8");
  assert.ok(src.includes("export async function PATCH"), "PATCH handler must exist");
  assert.ok(!src.includes("export async function POST"), "no POST on status route");
  assert.ok(src.includes("requireAdmin"), "route must use requireAdmin()");
  assert.ok(src.includes("resolveContext"), "route must scope to server tenant");
  assert.ok(!src.includes('get("tenantId")'), "route must never read tenantId from request");
});

test("P06.4a - route-policy classifies status route as ADMIN", async () => {
  const { ROUTE_POLICY_DEFINITIONS } = await import(pathToFileURL(path.resolve("scripts/route-policy.mjs")).href);
  const policy = ROUTE_POLICY_DEFINITIONS["src/app/api/users/[id]/status/route.ts"];
  assert.ok(policy, "status route must be classified");
  assert.strictEqual(policy.category, "ADMIN");
});
