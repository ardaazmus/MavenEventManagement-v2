import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createIsolatedTestDb } from "../tests/support/test-db.mjs";
import { seedSystemRoles } from "../scripts/seed-roles.mjs";
import { buildPermissionTrace } from "../src/lib/users/permission-trace.ts";

// F1-b — Yetki izi sözleşmesi: `source` ZORUNLU; demo_bypass yalnız oturumsuz;
// atama varsa db_rbac, yoksa legacy_fallback; atama özeti scope'larıyla listelenir.

test("PT-1 — oturum yok → demo_bypass (yalnız auth-off/serbest mod)", async () => {
  const trace = await buildPermissionTrace(undefined, null);
  assert.strictEqual(trace.authenticated, false);
  assert.strictEqual(trace.role, null);
  assert.strictEqual(trace.source, "demo_bypass");
  assert.deepStrictEqual(trace.assignments, []);
});

test("PT-2 — atama YOK → legacy_fallback (taban rol katmanı)", async () => {
  const testDb = await createIsolatedTestDb("pt2");
  try {
    const { prisma } = testDb;
    await seedSystemRoles(prisma);
    const tenant = await prisma.tenant.create({
      data: { id: "pt2-tenant", slug: "pt2-tenant", name: "PT2" },
    });
    const user = await prisma.user.create({
      data: { id: "pt2-user", email: "pt2@example.com", name: "PT2", tenantId: tenant.id, role: "EVENT_MANAGER" },
    });
    const trace = await buildPermissionTrace(prisma, { uid: user.id, role: "EVENT_MANAGER" });
    assert.strictEqual(trace.authenticated, true);
    assert.strictEqual(trace.role, "EVENT_MANAGER");
    assert.strictEqual(trace.source, "legacy_fallback");
    assert.deepStrictEqual(trace.assignments, []);
  } finally {
    await testDb.cleanup();
  }
});

test("PT-3 — atama VAR → db_rbac + atama özeti (roleKey@scope)", async () => {
  const testDb = await createIsolatedTestDb("pt3");
  try {
    const { prisma } = testDb;
    await seedSystemRoles(prisma);
    const tenant = await prisma.tenant.create({
      data: { id: "pt3-tenant", slug: "pt3-tenant", name: "PT3" },
    });
    const user = await prisma.user.create({
      data: { id: "pt3-user", email: "pt3@example.com", name: "PT3", tenantId: tenant.id, role: "MEMBER" },
    });
    const role = await prisma.roleDefinition.findFirst({ where: { key: "EVENT_MANAGER", tenantId: null } });
    assert.ok(role, "EVENT_MANAGER rol tanımı seed'de olmalı");
    await prisma.userRoleAssignment.create({ data: { userId: user.id, roleId: role.id, scopeKey: "TENANT" } });
    await prisma.userRoleAssignment.create({ data: { userId: user.id, roleId: role.id, scopeKey: "edition-pt3" } });

    const trace = await buildPermissionTrace(prisma, { uid: user.id, role: "MEMBER" });
    assert.strictEqual(trace.source, "db_rbac");
    assert.strictEqual(trace.role, "MEMBER");
    assert.strictEqual(trace.assignments.length, 2);
    assert.deepStrictEqual(
      trace.assignments.map((a) => `${a.roleKey}@${a.scopeKey}`).sort(),
      ["EVENT_MANAGER@TENANT", "EVENT_MANAGER@edition-pt3"],
    );
  } finally {
    await testDb.cleanup();
  }
});

test("PT-4 — kaynak sözleşmesi: rota kapısı + envanter girdisi (girişe bağlı)", () => {
  const routeSrc = fs.readFileSync(path.resolve("src/app/api/users/me/permissions/route.ts"), "utf8");
  assert.ok(routeSrc.includes("requireStaff()"), "rota requireStaff() kapısı taşımalı");
  assert.ok(routeSrc.includes("buildPermissionTrace"), "rota yetki izi yardımcısını kullanmalı");
  assert.ok(routeSrc.includes("AUTH_ENABLED"), "rota yarış koruması için AUTH_ENABLED taşımalı");
  const policySrc = fs.readFileSync(path.resolve("scripts/route-policy.mjs"), "utf8");
  const marker = '"src/app/api/users/me/permissions/route.ts": {';
  const at = policySrc.indexOf(marker);
  assert.ok(at >= 0, "rota envanterde kayıtlı olmalı");
  const block = policySrc.slice(at, policySrc.indexOf("},", at) + 2);
  assert.ok(block.includes('category: "STAFF"'), "envanter kategorisi STAFF olmalı");
  assert.ok(block.includes("requireStaff()"), "envanter kapı iddiası girişe bağlı olmalı");
  assert.ok(block.includes("db_rbac"), "envanter kaynak sözcüklerini taşımalı");
});

test("PT-5 — yanıt şekli: { authenticated, role, source, assignments }", async () => {
  const trace = await buildPermissionTrace(undefined, null);
  assert.deepStrictEqual(Object.keys(trace).sort(), ["assignments", "authenticated", "role", "source"]);
  assert.ok(["db_rbac", "legacy_fallback", "demo_bypass"].includes(trace.source));
});
