import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createIsolatedTestDb } from "../tests/support/test-db.mjs";
import { seedSystemRoles } from "../scripts/seed-roles.mjs";

const libPath = path.resolve("src/lib/sponsorship/wizard.ts");
const kanbanPath = path.resolve("src/components/maven/sponsorship/sponsorship-kanban.tsx");

test("P11 - wizard adım guard'ları: kurum zorunlu, tutar geçerli, sözleşme opsiyonel", async () => {
  const { canProceed, defaultDraft } = await import(pathToFileURL(libPath).href);

  const empty = defaultDraft();
  assert.strictEqual(empty.step, 1);
  assert.ok(canProceed(1, empty), "kurumsuz 1. adımdan geçilemez");
  assert.strictEqual(canProceed(1, { ...empty, organizationId: "org1" }), null);

  assert.ok(canProceed(2, { ...empty, amountMinor: null }), "tutarsız 2. adımdan geçilemez");
  assert.ok(canProceed(2, { ...empty, amountMinor: -5 }), "negatif tutarla geçilemez");
  assert.strictEqual(canProceed(2, { ...empty, amountMinor: 0 }), null, "0 tutar geçerli (aday)");

  assert.strictEqual(canProceed(3, empty), null, "3. adım tamamen opsiyonel");
  assert.ok(canProceed(3, { ...empty, contractDueDate: "not-a-date" }), "geçersiz tarih reddedilir");
  assert.strictEqual(canProceed(3, { ...empty, contractDueDate: "2026-12-01" }), null);
});

test("P11.2 - fiyat override yetkisi: yalnız fiyat-değiştirme rolü", async () => {
  const { hasOverridePermission, OVERRIDE_ROLE_KEYS } = await import(pathToFileURL(libPath).href);
  assert.deepStrictEqual([...OVERRIDE_ROLE_KEYS].sort(), ["FINANCE_MANAGER", "ORG_ADMIN", "ORG_OWNER"]);

  // Legacy rol yolu (saf)
  assert.strictEqual(await hasOverridePermission(null, { userId: "x", legacyRole: "FINANCE_MANAGER" }), true);
  assert.strictEqual(await hasOverridePermission(null, { userId: "x", legacyRole: "SPONSORSHIP_MANAGER" }), false);
  assert.strictEqual(await hasOverridePermission(null, { userId: "x", legacyRole: "VIEWER" }), false);

  // DB atama yolu
  const iso = await createIsolatedTestDb("p11-override");
  try {
    await seedSystemRoles(iso.prisma);
    const tenant = await iso.prisma.tenant.create({ data: { name: "T", slug: `t-p11-${Date.now()}` } });
    const user = await iso.prisma.user.create({ data: { tenantId: tenant.id, email: "u@test.local", name: "U", role: "VIEWER" } });
    assert.strictEqual(await hasOverridePermission(iso.prisma, { userId: user.id, legacyRole: "VIEWER" }), false);
    const finRole = await iso.prisma.roleDefinition.findFirst({ where: { tenantId: null, key: "FINANCE_MANAGER" } });
    await iso.prisma.userRoleAssignment.create({ data: { userId: user.id, roleId: finRole.id, scopeKey: "TENANT" } });
    assert.strictEqual(await hasOverridePermission(iso.prisma, { userId: user.id, legacyRole: "VIEWER" }), true);
  } finally {
    await iso.cleanup();
  }
});

test("P11.2 - POST sponsor override kapısı sunucuda (kablo)", async () => {
  const src = fs.readFileSync(path.resolve("src/app/api/[entity]/route.ts"), "utf8");
  assert.ok(src.includes("hasOverridePermission"), "collection POST fiyat override kapısını kullanmalı");
  assert.ok(src.includes("403"), "yetkisiz override 403 almalı");
});

test("P11 - sihirbaz UI: 4 adım + özet + çift-gönderim koruması + sözleşme teslimi", async () => {
  const src = fs.readFileSync(kanbanPath, "utf8");
  assert.ok(src.includes("wizardStep") || src.includes("step ===") || src.includes("step == "), "adım durumu olmalı");
  assert.ok(/Adım 4|Özet|Özet ve Onay/.test(src), "4. adım özet olmalı");
  assert.ok(src.includes("Geri"), "geri navigasyonu olmalı");
  assert.ok(src.includes("submitted") || src.includes("isSubmitting"), "çift-gönderim koruması olmalı");
  assert.ok(src.includes("deliverables") && src.includes("CONTRACT"), "sözleşme tarihi teslim kaydı üretmeli");
  assert.ok(src.includes("notes"), "not alanı sihirbaza taşınmalı");
});
