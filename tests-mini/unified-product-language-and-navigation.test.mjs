import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  PRODUCT_CONTEXT_SCOPES,
  getProductContextScope,
  WORK_CONTEXT_BRIDGES,
} from "../src/lib/product-taxonomy.ts";

const read = (p) => fs.readFileSync(path.resolve(p), "utf8");

test("Faz 12 - 01: Ürün Bağlam Kapsamları ve getProductContextScope Doğrulaması", () => {
  // 4 Temel Bağlam Kapsamı
  assert.equal(PRODUCT_CONTEXT_SCOPES.length, 4);
  const scopeIds = PRODUCT_CONTEXT_SCOPES.map((s) => s.id);
  assert.deepEqual(scopeIds, [
    "GLOBAL_COMPANY",
    "WORK_WORKSPACE",
    "PLATFORM_OPERATOR",
    "EXTERNAL_EXPERIENCE",
  ]);

  // Global Firma Modülleri
  assert.equal(getProductContextScope("portfolio"), "GLOBAL_COMPANY");
  assert.equal(getProductContextScope("company-communications"), "GLOBAL_COMPANY");
  assert.equal(getProductContextScope("company-reports"), "GLOBAL_COMPANY");
  assert.equal(getProductContextScope("company-settings"), "GLOBAL_COMPANY");

  // Dış Deneyim Modülü
  assert.equal(getProductContextScope("portals"), "EXTERNAL_EXPERIENCE");

  // Platform Operatör Modülleri
  assert.equal(getProductContextScope("saas-entitlements"), "PLATFORM_OPERATOR");
  assert.equal(getProductContextScope("platform-admin"), "PLATFORM_OPERATOR");

  // İşe Özel Çalışma Alanı Modülleri
  const workModules = [
    "dashboard",
    "registrations",
    "forms",
    "scientific",
    "program",
    "social",
    "sponsorship",
    "b2b",
    "floors",
    "media",
    "accommodation",
    "onsite",
    "badges",
    "certificates",
    "communications",
    "finance",
    "accounting",
    "settings",
    "operations",
  ];

  for (const m of workModules) {
    assert.equal(
      getProductContextScope(m),
      "WORK_WORKSPACE",
      `${m} modülü WORK_WORKSPACE kapsamında olmalıdır`
    );
  }
});

test("Faz 12 - 02: Çapraz Modül Köprüsü (WORK_CONTEXT_BRIDGES) Doğrulaması", () => {
  assert.equal(WORK_CONTEXT_BRIDGES.length, 5);
  const bridgeIds = WORK_CONTEXT_BRIDGES.map((b) => b.id);
  assert.deepEqual(bridgeIds, ["summary", "setup", "comms", "portals", "reports"]);

  const bridgeMap = Object.fromEntries(WORK_CONTEXT_BRIDGES.map((b) => [b.id, b]));

  // İş Özeti Cockpit
  assert.equal(bridgeMap.summary.targetModuleId, "dashboard");

  // Kurulum Kontrol Listesi
  assert.equal(bridgeMap.setup.targetModuleId, "editions");
  assert.equal(bridgeMap.setup.subView, "setup-checklist");

  // İş İletişimi
  assert.equal(bridgeMap.comms.targetModuleId, "communications");

  // Dış Deneyimler
  assert.equal(bridgeMap.portals.targetModuleId, "portals");

  // İş Raporları & Muhasebe
  assert.equal(bridgeMap.reports.targetModuleId, "accounting");
  assert.equal(bridgeMap.reports.subView, "defter");
});

test("Faz 12 - 03: ModuleContextBridge ve Shell Entegrasyon Sözleşmesi", () => {
  // ModuleContextBridge bileşeni kaynak doğrulaması
  const bridgeSrc = read("src/components/maven/navigation/module-context-bridge.tsx");
  assert.match(bridgeSrc, /role="navigation"/);
  assert.match(bridgeSrc, /WORK_CONTEXT_BRIDGES/);
  assert.match(bridgeSrc, /t\("contextBridge\.ariaLabel"\)/);
  assert.match(bridgeSrc, /currentWork/);

  // Shell.tsx entegrasyon doğrulaması
  const shellSrc = read("src/components/maven/shell.tsx");
  assert.match(shellSrc, /ModuleContextBridge/);
  assert.match(shellSrc, /getProductContextScope\(module\) === "GLOBAL_COMPANY"/);
  assert.match(shellSrc, /getProductContextScope\(module\) === "WORK_WORKSPACE"/);
});

test("Faz 12 - 04: DualSidebar Mobil ve Bağlam Geçiş Sözleşmesi", () => {
  const sidebarSrc = read("src/components/maven/navigation/dual-sidebar.tsx");
  assert.match(sidebarSrc, /getProductContextScope/);
  assert.match(sidebarSrc, /role="tablist"/);
  assert.match(sidebarSrc, /dualSidebar\.ariaContextToggle/);
  assert.match(sidebarSrc, /dualSidebar\.tabWork/);
  assert.match(sidebarSrc, /dualSidebar\.tabCompany/);
  assert.match(sidebarSrc, /contextTab === "company"/);
});

test("Faz 12 - 05: i18n Sözlük Paritesi (TR & EN)", () => {
  const tr = JSON.parse(read("src/i18n/tr.json"));
  const en = JSON.parse(read("src/i18n/en.json"));

  // contextBridge
  assert.ok(tr.contextBridge && typeof tr.contextBridge === "object");
  assert.ok(en.contextBridge && typeof en.contextBridge === "object");
  const bridgeKeys = ["ariaLabel", "title", "summary", "setup", "comms", "portals", "reports"];
  for (const k of bridgeKeys) {
    assert.ok(typeof tr.contextBridge[k] === "string", `tr.contextBridge.${k} eksik`);
    assert.ok(typeof en.contextBridge[k] === "string", `en.contextBridge.${k} eksik`);
  }

  // scopes
  assert.ok(tr.scopes && typeof tr.scopes === "object");
  assert.ok(en.scopes && typeof en.scopes === "object");
  const scopeKeys = ["globalCompany", "workWorkspace", "platformOperator", "externalExperience"];
  for (const k of scopeKeys) {
    assert.ok(typeof tr.scopes[k] === "string", `tr.scopes.${k} eksik`);
    assert.ok(typeof en.scopes[k] === "string", `en.scopes.${k} eksik`);
  }

  // dualSidebar
  assert.ok(tr.dualSidebar && typeof tr.dualSidebar === "object");
  assert.ok(en.dualSidebar && typeof en.dualSidebar === "object");
  const sidebarKeys = ["tabWork", "tabCompany", "ariaContextToggle", "searchPlaceholder", "viewModeHub", "viewModeAll"];
  for (const k of sidebarKeys) {
    assert.ok(typeof tr.dualSidebar[k] === "string", `tr.dualSidebar.${k} eksik`);
    assert.ok(typeof en.dualSidebar[k] === "string", `en.dualSidebar.${k} eksik`);
  }
});

test("Faz 12 - 06: 6-Hub + Tab Sektörel Navigasyon ve İnteraktif UI/UX Doğrulaması", async () => {
  const { pathToFileURL } = await import("node:url");
  const { WORK_OPERATIONAL_HUBS, WORK_UTILITY_HUBS, WORK_NAV_GROUPS } = await import(
    pathToFileURL(path.resolve("src/lib/product-taxonomy.ts")).href
  );

  // 1. 6 Operasyonel Hub tanımlı olmalı
  assert.strictEqual(WORK_OPERATIONAL_HUBS.length, 6, "6 Operasyonel Hub bulunmalı");
  const expectedHubIds = ["hub_cockpit", "hub_registration", "hub_program", "hub_sponsor", "hub_logistics", "hub_comms"];
  assert.deepStrictEqual(WORK_OPERATIONAL_HUBS.map((h) => h.id), expectedHubIds);

  // 2. 2 Yardımcı Hub (Raporlar ve Ayarlar) tanımlı olmalı
  assert.strictEqual(WORK_UTILITY_HUBS.length, 2, "2 Yardımcı Hub bulunmalı");

  // 3. Sıfır kayıp kontrolü: 9 gruptaki tüm 33 öğe 6 hub + 2 yardımcı hub içinde temsil edilmeli
  const allHubItemIds = new Set([
    ...WORK_OPERATIONAL_HUBS.flatMap((h) => h.items.map((i) => i.id)),
    ...WORK_UTILITY_HUBS.flatMap((h) => h.items.map((i) => i.id)),
  ]);
  const canonicalItemIds = WORK_NAV_GROUPS.flatMap((g) => g.items.map((i) => i.id));
  for (const itemId of canonicalItemIds) {
    assert.ok(allHubItemIds.has(itemId), `Öğe ${itemId} hub yapısında eksiksiz bulunmalıdır`);
  }

  // 4. DualSidebar interaktif UI kontrolleri
  const sidebarSrc = read("src/components/maven/navigation/dual-sidebar.tsx");
  assert.match(sidebarSrc, /searchQuery/);
  assert.match(sidebarSrc, /viewMode === "hub"/);
  assert.match(sidebarSrc, /WORK_OPERATIONAL_HUBS/);
  assert.match(sidebarSrc, /WORK_UTILITY_HUBS/);
  assert.match(sidebarSrc, /badgeSetup/);
  assert.match(sidebarSrc, /badgeApproval/);
  assert.match(sidebarSrc, /badgeOnsite/);
});

