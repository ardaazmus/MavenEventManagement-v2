import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { canManageTeam } from "../src/lib/constants.ts";
import { STAFF_ROLES, READONLY_ROLES } from "../src/lib/api/permissions.ts";

// F2-a — EKİP ≠ VERİ ayrımı: "ekip yönetimi" kartı görünürlük sözleşmesi.
// Kural: yalnız üst firma sahibi/yöneticisi (ORG_OWNER/ORG_ADMIN) ekip yönetir;
// diğer tüm roller (read-only dahil) kilitli-bilgi görür. Rol yoksa (auth-off/demo)
// mevcut davranış korunur → kart açık. Sunucu kapıları (requireAdmin) ayrıca zorlar;
// bu katman yalnız ARAYÜZ görünürlüğüdür.

test("TV-1 — ORG_OWNER ve ORG_ADMIN ekip yönetir (true)", () => {
  assert.strictEqual(canManageTeam("ORG_OWNER"), true);
  assert.strictEqual(canManageTeam("ORG_ADMIN"), true);
});

test("TV-2 — read-only roller (VIEWER/AUDITOR/OBSERVER) yönetemez (false)", () => {
  for (const r of READONLY_ROLES) {
    assert.strictEqual(canManageTeam(r), false, `read-only rol yönetememeli: ${r}`);
  }
});

test("TV-3 — operasyon rolleri (admin olmayan kadro) yönetemez (false)", () => {
  const nonAdminStaff = [...STAFF_ROLES].filter((r) => r !== "ORG_OWNER" && r !== "ORG_ADMIN");
  assert.ok(nonAdminStaff.length >= 7, "kadro taksonomisi beklenen büyüklükte olmalı");
  for (const r of nonAdminStaff) {
    assert.strictEqual(canManageTeam(r), false, `admin olmayan kadro yönetememeli: ${r}`);
  }
});

test("TV-4 — rol yok (auth-off/demo) → mevcut davranış korunur (true)", () => {
  assert.strictEqual(canManageTeam(null), true);
  assert.strictEqual(canManageTeam(undefined), true);
  assert.strictEqual(canManageTeam(""), true);
});

test("TV-5 — auth/me haritası read-only rolleri menü katmanına taşır (kaynak sözleşmesi)", () => {
  const src = fs.readFileSync(path.resolve("src/app/api/auth/me/route.ts"), "utf8");
  assert.ok(
    src.includes("READONLY_ROLES"),
    "auth/me read-only rolleri de döndürmeli (menü rol-uyarlı süzme — F2-a)",
  );
  const map = (r) => (STAFF_ROLES.has(r) || READONLY_ROLES.has(r) ? r : null);
  assert.strictEqual(map("VIEWER"), "VIEWER");
  assert.strictEqual(map("AUDITOR"), "AUDITOR");
  assert.strictEqual(map("OBSERVER"), "OBSERVER");
  assert.strictEqual(map("EVENT_MANAGER"), "EVENT_MANAGER");
  assert.strictEqual(map("ATTENDEE"), null);
  assert.strictEqual(map("MEMBER"), null);
});
