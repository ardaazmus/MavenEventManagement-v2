import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createIsolatedTestDb } from "../tests/support/test-db.mjs";
import { SYSTEM_ROLE_DEFINITIONS, seedSystemRoles } from "../scripts/seed-roles.mjs";

const rolesPath = path.resolve("src/lib/users/roles.ts");

// H-05: davet/atama rol listeleri tek kaynaktan beslenir.

test("H-05 - invitable roller ORG_OWNER içermez, tohum ∪ OBSERVER içindedir", async () => {
  const { listInvitableRoles } = await import(pathToFileURL(rolesPath).href);
  const seedKeys = new Set(SYSTEM_ROLE_DEFINITIONS.map((r) => r.key));
  const invitable = listInvitableRoles();
  assert.ok(invitable.length >= 10, "en az 10 davet rolü beklenir");
  assert.ok(!invitable.includes("ORG_OWNER"), "ORG_OWNER davetle verilemez");
  for (const key of invitable) {
    assert.ok(seedKeys.has(key) || key === "OBSERVER", `${key} tohumda ya da OBSERVER olmalı`);
  }
});

test("H-05 - getAssignableRoles sistem + kiracı rollerini döner", async () => {
  const { getAssignableRoles } = await import(pathToFileURL(rolesPath).href);
  const testDb = await createIsolatedTestDb("p06-roles-list");
  const { prisma } = testDb;
  try {
    await seedSystemRoles(prisma);
    const tenant = await prisma.tenant.create({
      data: { id: "tenant-roles-test", slug: "tenant-roles-test", name: "Roles Test" },
    });
    await prisma.roleDefinition.create({
      data: { tenantId: tenant.id, key: "FIELD_COORD", name: "Saha Koordinatörü", isSystem: false },
    });

    const rows = await getAssignableRoles(prisma, tenant.id);
    const keys = rows.map((r) => r.key);
    assert.strictEqual(rows.length, 12, "11 sistem + 1 kiracı rolü beklenir");
    assert.ok(keys.includes("ORG_ADMIN") && keys.includes("VIEWER"), "sistem rolleri listede olmalı");
    const custom = rows.find((r) => r.key === "FIELD_COORD");
    assert.ok(custom && custom.isSystem === false, "kiracı rolü isSystem=false ile dönmeli");
    const sys = rows.find((r) => r.key === "ORG_ADMIN");
    assert.ok(sys && sys.isSystem === true, "sistem rolü isSystem=true ile dönmeli");
  } finally {
    await testDb.cleanup();
  }
});
