import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";

const taxonomyPath = path.resolve("src/lib/product-taxonomy.ts");
const constantsPath = path.resolve("src/lib/constants.ts");

test("Faz 1 - 01: Temel aktör ve ürün kavramları (Firma A vs Firma B)", async () => {
  const { PRODUCT_ACTORS, PORTFOLIO_CONCEPTS } = await import(pathToFileURL(taxonomyPath).href);

  assert.ok(PRODUCT_ACTORS.FIRMA_A);
  assert.strictEqual(PRODUCT_ACTORS.FIRMA_A.isCustomerFacing, false);
  assert.ok(PRODUCT_ACTORS.FIRMA_B);
  assert.strictEqual(PRODUCT_ACTORS.FIRMA_B.isCustomerFacing, true);

  // Portföy kaydı global, katılım ve ilişki iş kapsamındadır
  assert.strictEqual(PORTFOLIO_CONCEPTS.PORTFOLIO_RECORD.scope, "GLOBAL");
  assert.strictEqual(PORTFOLIO_CONCEPTS.WORK_RELATIONSHIP.scope, "WORK");
  assert.strictEqual(PORTFOLIO_CONCEPTS.WORK_PARTICIPATION.scope, "WORK");
});

test("Faz 1 - 02: İş grupları, türleri ve profilleri", async () => {
  const { WORK_GROUPS, WORK_TYPES, WORK_PROFILES, WORK_LIFECYCLE_STAGES } = await import(
    pathToFileURL(taxonomyPath).href
  );

  // 3 ana iş grubu
  assert.strictEqual(WORK_GROUPS.length, 3);
  const groupIds = WORK_GROUPS.map((g) => g.id);
  assert.ok(groupIds.includes("EVENT_ORGANIZATION"));
  assert.ok(groupIds.includes("TRAVEL_CLIENT"));
  assert.ok(groupIds.includes("CUSTOM"));

  // En az 6 temel iş türü
  assert.ok(WORK_TYPES.length >= 6);
  const typeIds = WORK_TYPES.map((t) => t.id);
  assert.ok(typeIds.includes("CONGRESS"));
  assert.ok(typeIds.includes("FAIR"));
  assert.ok(typeIds.includes("CORPORATE"));
  assert.ok(typeIds.includes("WEDDING"));
  assert.ok(typeIds.includes("TRAVEL"));
  assert.ok(typeIds.includes("CUSTOM"));

  // 4 profil boyutu
  assert.ok(WORK_PROFILES.scope);
  assert.ok(WORK_PROFILES.segment);
  assert.ok(WORK_PROFILES.privacy);
  assert.ok(WORK_PROFILES.ownership);

  // Yaşam döngüsü aşamaları
  assert.ok(WORK_LIFECYCLE_STAGES.length >= 10);
  assert.ok(WORK_LIFECYCLE_STAGES.some((s) => s.id === "ARCHIVED"));
});

test("Faz 1 - 03: Firma B Global Navigasyon Hiyerarşisi (5 Alan)", async () => {
  const { GLOBAL_NAV_AREAS } = await import(pathToFileURL(taxonomyPath).href);

  assert.strictEqual(GLOBAL_NAV_AREAS.length, 5);
  const areaIds = GLOBAL_NAV_AREAS.map((a) => a.id);
  assert.deepStrictEqual(areaIds, ["jobs", "portfolio", "comms", "reports", "settings"]);

  // 12. yol haritasına göre ikincil menü maddeleri
  const jobsArea = GLOBAL_NAV_AREAS.find((a) => a.id === "jobs");
  assert.ok(jobsArea);
  const jobsSubmenu = jobsArea.secondaryMenu.map((m) => m.id);
  assert.ok(jobsSubmenu.includes("active"));
  assert.ok(jobsSubmenu.includes("planning"));
  assert.ok(jobsSubmenu.includes("attention"));
  assert.ok(jobsSubmenu.includes("archive"));

  const portfolioArea = GLOBAL_NAV_AREAS.find((a) => a.id === "portfolio");
  assert.ok(portfolioArea);
  const portfolioSubmenu = portfolioArea.secondaryMenu.map((m) => m.id);
  assert.ok(portfolioSubmenu.includes("people"));
  assert.ok(portfolioSubmenu.includes("organizations"));
  assert.ok(portfolioSubmenu.includes("clients"));
});

test("Faz 1 - 04: İşe Özel Navigasyon Hiyerarşisi (9 Sabit Grup)", async () => {
  const { WORK_NAV_GROUPS } = await import(pathToFileURL(taxonomyPath).href);

  assert.strictEqual(WORK_NAV_GROUPS.length, 9);
  const expectedGroups = [
    "work_management",
    "people_registration",
    "program_content",
    "sponsor_exhibition",
    "venue_onsite",
    "accommodation_services",
    "communication_experience",
    "work_reports",
    "work_settings",
  ];

  const groupIds = WORK_NAV_GROUPS.map((g) => g.id);
  assert.deepStrictEqual(groupIds, expectedGroups);

  // İş Yönetimi grubu kontrolü
  const mgmtGroup = WORK_NAV_GROUPS.find((g) => g.id === "work_management");
  assert.ok(mgmtGroup);
  const mgmtItems = mgmtGroup.items.map((i) => i.id);
  assert.ok(mgmtItems.includes("summary"));
  assert.ok(mgmtItems.includes("setup-checklist"));
  assert.ok(mgmtItems.includes("work-info"));
  assert.ok(mgmtItems.includes("client-organizer"));
  assert.ok(mgmtItems.includes("team-permissions"));
  assert.ok(mgmtItems.includes("tasks-approvals"));
});

test("Faz 1 - 05: 26 Modülün Kayıpsızlık Garantisi (Catalog Parity)", async () => {
  const { PRODUCT_MODULE_CATALOG, validateCatalogParity } = await import(pathToFileURL(taxonomyPath).href);
  const { MODULES } = await import(pathToFileURL(constantsPath).href);

  const legacyModuleIds = MODULES.map((m) => m.id);
  const parity = validateCatalogParity(legacyModuleIds);

  // Hiçbir modül kaybolmamalıdır
  assert.strictEqual(parity.isComplete, true, `Eksik modüller bulundu: ${parity.missingInCatalog.join(", ")}`);
  assert.strictEqual(parity.missingInCatalog.length, 0);

  // Her katalog girdisinin geçerli bir bağlamı (scope) olmalı
  for (const entry of PRODUCT_MODULE_CATALOG) {
    assert.ok(entry.id);
    assert.ok(entry.title);
    assert.ok(entry.responsibility);
    assert.ok(["GLOBAL", "WORK", "CROSS_CONTEXT"].includes(entry.scope));
    assert.ok(entry.targetGroupTitle);
    assert.ok(entry.workflowRole);
  }
});

test("Faz 1 - 06: Ayrı menüsü olmayan yeteneklerin eşlemesi", async () => {
  const { AUXILIARY_CAPABILITY_MAPPINGS } = await import(pathToFileURL(taxonomyPath).href);

  assert.ok(AUXILIARY_CAPABILITY_MAPPINGS.length >= 8);
  const capabilities = AUXILIARY_CAPABILITY_MAPPINGS.map((c) => c.capability);

  assert.ok(capabilities.some((c) => c.includes("Çalışan")));
  assert.ok(capabilities.some((c) => c.includes("Portföy Segmenti")));
  assert.ok(capabilities.some((c) => c.includes("Onay")));
  assert.ok(capabilities.some((c) => c.includes("Bildirim")));
  assert.ok(capabilities.some((c) => c.includes("Aktarma")));
  assert.ok(capabilities.some((c) => c.includes("Entegrasyon")));
});
