import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createIsolatedTestDb } from "../tests/support/test-db.mjs";
import { detectStaffEmailMatch } from "../src/lib/users/staff-overlap.ts";

// F2-d — Person ↔ ekip (User) e-posta çakışma tespiti: yalnız BİLGİ etiketi;
// iki dünya eşleştirilmez (FK yok), kayıt ayrımı korunur.

test("SO-1 — aynı kiracıda eşleşen ekip e-postası → true", async () => {
  const testDb = await createIsolatedTestDb("so1");
  try {
    const { prisma } = testDb;
    const tenant = await prisma.tenant.create({ data: { id: "so1-t", slug: "so1-t", name: "SO1" } });
    await prisma.user.create({ data: { id: "so1-u", tenantId: tenant.id, email: "ortak@example.com", name: "SO1 U" } });
    assert.strictEqual(await detectStaffEmailMatch(prisma, tenant.id, "ortak@example.com"), true);
  } finally {
    await testDb.cleanup();
  }
});

test("SO-2 — eşleşme yoksa → false", async () => {
  const testDb = await createIsolatedTestDb("so2");
  try {
    const { prisma } = testDb;
    const tenant = await prisma.tenant.create({ data: { id: "so2-t", slug: "so2-t", name: "SO2" } });
    await prisma.user.create({ data: { id: "so2-u", tenantId: tenant.id, email: "bir@example.com", name: "SO2 U" } });
    assert.strictEqual(await detectStaffEmailMatch(prisma, tenant.id, "yok@example.com"), false);
  } finally {
    await testDb.cleanup();
  }
});

test("SO-3 — boş/geçersiz e-posta → false (sorgu atılmaz)", async () => {
  assert.strictEqual(await detectStaffEmailMatch(undefined, "t1", null), false);
  assert.strictEqual(await detectStaffEmailMatch(undefined, "t1", ""), false);
  assert.strictEqual(await detectStaffEmailMatch(undefined, "t1", "   "), false);
});

test("SO-4 — kiracı izolasyonu: başka kiracının eşleşmesi sayılmaz", async () => {
  const testDb = await createIsolatedTestDb("so4");
  try {
    const { prisma } = testDb;
    const tenantA = await prisma.tenant.create({ data: { id: "so4-a", slug: "so4-a", name: "SO4A" } });
    const tenantB = await prisma.tenant.create({ data: { id: "so4-b", slug: "so4-b", name: "SO4B" } });
    await prisma.user.create({ data: { id: "so4-u", tenantId: tenantA.id, email: "kesisim@example.com", name: "SO4 U" } });
    assert.strictEqual(await detectStaffEmailMatch(prisma, tenantA.id, "kesisim@example.com"), true);
    assert.strictEqual(await detectStaffEmailMatch(prisma, tenantB.id, "kesisim@example.com"), false);
  } finally {
    await testDb.cleanup();
  }
});

test("SO-5 — kaynak sözleşmesi: uç + arayüz + envanter", () => {
  const route = fs.readFileSync(path.resolve("src/app/api/people/[id]/route.ts"), "utf8");
  assert.ok(route.includes("detectStaffEmailMatch"), "uç yardımcıyı kullanmalı");
  assert.ok(route.includes("staffEmailMatch"), "yanıt alan adı sabit");
  assert.ok(route.includes("requireStaff"), "kadro kapısı korunur");
  const view = fs.readFileSync(path.resolve("src/components/maven/views/people.tsx"), "utf8");
  assert.ok(view.includes('t("people.p360.staffEmailMatch")'), "arayüz bilgi etiketini i18n ile gösterir");
  const policy = fs.readFileSync(path.resolve("scripts/route-policy.mjs"), "utf8");
  assert.ok(policy.includes("people/[id]/route.ts"), "uç envanterde kayıtlı");
});
