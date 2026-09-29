import test from "node:test";
import assert from "node:assert/strict";
import { createIsolatedTestDb } from "../tests/support/test-db.mjs";
import { seedSystemRoles } from "../scripts/seed-roles.mjs";
import {
  authorizeDualRead,
  authorizeEntity,
  getFallbackMetrics,
  resetFallbackMetrics,
  STAFF_ROLES,
  PARTICIPANT_ROLES,
  READONLY_ROLES,
} from "../src/lib/api/permissions.ts";
import { MODULES, roleCanSee } from "../src/lib/constants.ts";

// F1-a — "İKİ KATMAN" YETKİ SÖZLEŞMESİ (M-01)
// Sözleşme: (1) KO kararı — UserRoleAssignment (scopeKey: "TENANT" | edisyon) BİRİNCİL;
// DB ataması VARSA yalnız izin tablosu konuşur (yetki yoksa kesin ret; legacy'ye
// düşülmez). (2) Taban rol — legacy User.role; DB ataması YOKKEN fallback + telemetri
// (reason: NO_DB_ASSIGNMENTS). (3) Menü (roleCanSee) ve kapılar (STAFF_ROLES /
// authorizeEntity) AYNI satırdan (User.role) okur → rol değişince ikisi birlikte değişir.
// Bu testler sözleşmeyi kilitler; kırılırsa davranış bilinçli değişmiş demektir.

function mod(id) {
  const m = MODULES.find((x) => x.id === id);
  assert.ok(m, `modül bulunamadı: ${id}`);
  return m;
}

async function fixture(name) {
  const testDb = await createIsolatedTestDb(name);
  const { prisma } = testDb;
  await seedSystemRoles(prisma);
  const tenant = await prisma.tenant.create({
    data: { id: `tenant-${name}`, slug: `tenant-${name}`, name: `KC ${name}` },
  });
  return { testDb, prisma, tenant };
}

test("KC-1 — DB ataması birincildir: legacy sözlükte yoksa bile atama yetki verir", async () => {
  resetFallbackMetrics();
  const { testDb, prisma, tenant } = await fixture("kc1");
  try {
    const user = await prisma.user.create({
      data: { id: "kc1-user", email: "kc1@example.com", name: "KC1", tenantId: tenant.id, role: "MEMBER" },
    });
    const role = await prisma.roleDefinition.findFirst({ where: { key: "EVENT_MANAGER", tenantId: null } });
    assert.ok(role, "EVENT_MANAGER rol tanımı seed'de olmalı");
    await prisma.userRoleAssignment.create({ data: { userId: user.id, roleId: role.id, scopeKey: "TENANT" } });

    // Legacy katman (MEMBER sözlükte yok) tek başına RED verir...
    assert.strictEqual(authorizeEntity({ entity: "registrations", action: "VIEW", role: "MEMBER" }), false);
    // ...ama DB ataması birincil olduğu için akış YETKİLİ olur.
    const res = await authorizeDualRead({
      actor: { uid: user.id, role: "MEMBER", tenantId: tenant.id },
      entity: "registrations",
      action: "VIEW",
      prisma,
    });
    assert.strictEqual(res.authorized, true);
    assert.strictEqual(res.source, "db_rbac");
    assert.strictEqual(getFallbackMetrics().totalFallbacks, 0);
  } finally {
    await testDb.cleanup();
  }
});

test("KC-2 — Atama varken ret de db_rbac'tan gelir (legacy fallback'e düşülmez)", async () => {
  resetFallbackMetrics();
  const { testDb, prisma, tenant } = await fixture("kc2");
  try {
    const user = await prisma.user.create({
      data: { id: "kc2-user", email: "kc2@example.com", name: "KC2", tenantId: tenant.id, role: "ORG_ADMIN" },
    });
    const role = await prisma.roleDefinition.findFirst({ where: { key: "EVENT_MANAGER", tenantId: null } });
    assert.ok(role, "EVENT_MANAGER rol tanımı seed'de olmalı");
    await prisma.userRoleAssignment.create({ data: { userId: user.id, roleId: role.id, scopeKey: "TENANT" } });

    const res = await authorizeDualRead({
      actor: { uid: user.id, role: "ORG_ADMIN", tenantId: tenant.id },
      entity: "tenants",
      action: "DELETE",
      prisma,
    });
    assert.strictEqual(res.authorized, false);
    assert.strictEqual(res.source, "db_rbac");
    assert.strictEqual(res.reason, "ROLE_PERMISSION_DENIED");
    assert.strictEqual(getFallbackMetrics().totalFallbacks, 0, "Atama varken legacy fallback çalışmamalı");
  } finally {
    await testDb.cleanup();
  }
});

test("KC-3 — Atama yoksa legacy fallback + telemetri (NO_DB_ASSIGNMENTS)", async () => {
  resetFallbackMetrics();
  const { testDb, prisma, tenant } = await fixture("kc3");
  try {
    const user = await prisma.user.create({
      data: { id: "kc3-user", email: "kc3@example.com", name: "KC3", tenantId: tenant.id, role: "FINANCE_MANAGER" },
    });
    const actor = { uid: user.id, role: "FINANCE_MANAGER", tenantId: tenant.id };

    const ok = await authorizeDualRead({ actor, entity: "expenses", action: "VIEW", prisma });
    assert.strictEqual(ok.authorized, true);
    assert.strictEqual(ok.source, "legacy_fallback");
    assert.strictEqual(ok.reason, "NO_DB_ASSIGNMENTS");

    const no = await authorizeDualRead({ actor, entity: "submissions", action: "CREATE", prisma });
    assert.strictEqual(no.authorized, false);
    assert.strictEqual(no.source, "legacy_fallback");

    const metrics = getFallbackMetrics();
    assert.strictEqual(metrics.totalFallbacks, 2);
    assert.strictEqual(metrics.grantedCount, 1);
  } finally {
    await testDb.cleanup();
  }
});

test("KC-4 — Kapsam yönü: TENANT ataması edisyon isteğini kapsar; edisyon ataması TENANT isteğini KAPSAMAZ", async () => {
  resetFallbackMetrics();
  const { testDb, prisma, tenant } = await fixture("kc4");
  try {
    const role = await prisma.roleDefinition.findFirst({ where: { key: "EVENT_MANAGER", tenantId: null } });
    assert.ok(role, "EVENT_MANAGER rol tanımı seed'de olmalı");

    const userA = await prisma.user.create({
      data: { id: "kc4-a", email: "kc4a@example.com", name: "KC4A", tenantId: tenant.id, role: "MEMBER" },
    });
    await prisma.userRoleAssignment.create({ data: { userId: userA.id, roleId: role.id, scopeKey: "TENANT" } });
    const a = await authorizeDualRead({
      actor: { uid: userA.id, role: "MEMBER", tenantId: tenant.id },
      entity: "registrations",
      action: "VIEW",
      scopeKey: "edition-zzz",
      prisma,
    });
    assert.strictEqual(a.authorized, true, "TENANT ataması edisyon kapsamlı isteği yetkilendirmeli");
    assert.strictEqual(a.source, "db_rbac");

    const userB = await prisma.user.create({
      data: { id: "kc4-b", email: "kc4b@example.com", name: "KC4B", tenantId: tenant.id, role: "MEMBER" },
    });
    await prisma.userRoleAssignment.create({ data: { userId: userB.id, roleId: role.id, scopeKey: "edition-zzz" } });
    const b = await authorizeDualRead({
      actor: { uid: userB.id, role: "MEMBER", tenantId: tenant.id },
      entity: "registrations",
      action: "VIEW",
      scopeKey: "TENANT",
      prisma,
    });
    assert.strictEqual(b.authorized, false, "Ediseyona özel atama TENANT isteğini yetkilendirmemeli (en az yetki)");
    assert.strictEqual(b.source, "legacy_fallback");
    assert.strictEqual(b.reason, "NO_DB_ASSIGNMENTS");
  } finally {
    await testDb.cleanup();
  }
});

test("KC-5 — Legacy rol değişince menü ve kapı AYNI satırdan okur (tek doğruluk)", async () => {
  resetFallbackMetrics();
  const { testDb, prisma, tenant } = await fixture("kc5");
  try {
    const user = await prisma.user.create({
      data: { id: "kc5-user", email: "kc5@example.com", name: "KC5", tenantId: tenant.id, role: "EVENT_MANAGER" },
    });

    const readRole = async () =>
      (await prisma.user.findUnique({ where: { id: user.id }, select: { role: true } }))?.role;
    const meRole = (role) => (STAFF_ROLES.has(role) || READONLY_ROLES.has(role) ? role : null); // auth/me eşlemesi (F2-a)

    const r1 = await readRole();
    assert.strictEqual(r1, "EVENT_MANAGER");
    assert.strictEqual(meRole(r1), "EVENT_MANAGER");
    assert.strictEqual(roleCanSee(mod("scientific"), r1), true, "menü: EVENT_MANAGER bilimsel modülü görür");
    assert.strictEqual(roleCanSee(mod("finance"), r1), true, "menü: EVENT_MANAGER finans modülünü görür");
    assert.strictEqual(authorizeEntity({ entity: "expenses", action: "VIEW", role: r1 }), true, "kapı: EVENT_MANAGER expenses VIEW");

    await prisma.user.update({ where: { id: user.id }, data: { role: "VIEWER" } });
    const r2 = await readRole();
    assert.strictEqual(r2, "VIEWER");
    assert.strictEqual(meRole(r2), "VIEWER", "menü tarafı: read-only roller de menü katmanına taşınır (F2-a)");
    assert.strictEqual(roleCanSee(mod("finance"), r2), false, "menü: VIEWER finans modülünü görmez");
    assert.strictEqual(roleCanSee(mod("compliance"), r2), false, "menü: VIEWER uyumluluk modülünü görmez");
    assert.strictEqual(authorizeEntity({ entity: "api-integrations", action: "VIEW", role: r2 }), false, "kapı: READONLY + integrations yasak");
    assert.strictEqual(authorizeEntity({ entity: "expenses", action: "VIEW", role: r2 }), true, "kapı: READONLY yalnız VIEW (expenses)");
  } finally {
    await testDb.cleanup();
  }
});

test("KC-6 — Rol sınıfı sözleşmesi (saf sözlük): kadro / katılımcı / salt-okunur kümeleri", () => {
  const expectedStaff = [
    "ORG_OWNER",
    "ORG_ADMIN",
    "EVENT_MANAGER",
    "FINANCE_MANAGER",
    "REGISTRATION_MANAGER",
    "SPONSORSHIP_MANAGER",
    "SCIENTIFIC_MANAGER",
    "PROGRAM_MANAGER",
    "ONSITE_MANAGER",
  ];
  assert.deepStrictEqual([...STAFF_ROLES].sort(), [...expectedStaff].sort(), "STAFF_ROLES taksonomisi (§48) sabit");
  assert.deepStrictEqual([...READONLY_ROLES].sort(), ["AUDITOR", "OBSERVER", "VIEWER"], "READONLY_ROLES sabit");

  for (const p of PARTICIPANT_ROLES) {
    assert.strictEqual(
      authorizeEntity({ entity: "registrations", action: "VIEW", role: p }),
      false,
      `participant ${p} yönetimde daima RED`,
    );
  }
  for (const r of READONLY_ROLES) {
    assert.strictEqual(authorizeEntity({ entity: "expenses", action: "CREATE", role: r }), false, `${r} mutasyon yapamaz`);
    assert.strictEqual(authorizeEntity({ entity: "expenses", action: "VIEW", role: r }), true, `${r} yalnız VIEW`);
    assert.strictEqual(
      authorizeEntity({ entity: "api-integrations", action: "VIEW", role: r }),
      false,
      `${r} integrations göremez`,
    );
  }
  assert.strictEqual(STAFF_ROLES.has("MEMBER"), false);
  assert.strictEqual(STAFF_ROLES.has("VIEWER"), false);
});
