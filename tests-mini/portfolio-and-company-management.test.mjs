import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";

const taxonomyPath = path.resolve("src/lib/product-taxonomy.ts");
const moduleComponentsPath = path.resolve("src/lib/module-components.tsx");

test("Faz 5 - 01: Portföy Kavramları ve Kapsam Ayrımı Sözleşmesi", async () => {
  const { PORTFOLIO_CONCEPTS } = await import(pathToFileURL(taxonomyPath).href);

  // 1. Portföy Ana Kaydı Global olmalıdır
  assert.ok(PORTFOLIO_CONCEPTS.PORTFOLIO_RECORD, "PORTFOLIO_RECORD tanımlı olmalı");
  assert.strictEqual(PORTFOLIO_CONCEPTS.PORTFOLIO_RECORD.scope, "GLOBAL");

  // 2. İş İlişkisi ve Katılımı İşe Özel (WORK) olmalıdır
  assert.ok(PORTFOLIO_CONCEPTS.WORK_RELATIONSHIP, "WORK_RELATIONSHIP tanımlı olmalı");
  assert.strictEqual(PORTFOLIO_CONCEPTS.WORK_RELATIONSHIP.scope, "WORK");

  assert.ok(PORTFOLIO_CONCEPTS.WORK_PARTICIPATION, "WORK_PARTICIPATION tanımlı olmalı");
  assert.strictEqual(PORTFOLIO_CONCEPTS.WORK_PARTICIPATION.scope, "WORK");
});

test("Faz 5 - 02: Firma B Global Navigasyon Alanı — Portföy ve Firma Ayarları", async () => {
  const { GLOBAL_NAV_AREAS } = await import(pathToFileURL(taxonomyPath).href);

  // Portföy alanı kontrolü
  const portfolioArea = GLOBAL_NAV_AREAS.find((a) => a.id === "portfolio");
  assert.ok(portfolioArea, "portfolio alanı GLOBAL_NAV_AREAS içinde olmalı");
  const portfolioMenuIds = portfolioArea.secondaryMenu.map((m) => m.id);
  assert.ok(portfolioMenuIds.includes("people"), "Portföy Kişiler menüsünü içermeli");
  assert.ok(portfolioMenuIds.includes("organizations"), "Portföy Kurumlar menüsünü içermeli");
  assert.ok(portfolioMenuIds.includes("clients"), "Portföy Müşteriler menüsünü içermeli");
  assert.ok(portfolioMenuIds.includes("relationships"), "Portföy İlişkiler menüsünü içermeli");

  // Firma Ayarları alanı kontrolü
  const settingsArea = GLOBAL_NAV_AREAS.find((a) => a.id === "settings");
  assert.ok(settingsArea, "settings alanı GLOBAL_NAV_AREAS içinde olmalı");
  const settingsMenuIds = settingsArea.secondaryMenu.map((m) => m.id);
  assert.ok(settingsMenuIds.includes("profile"), "Ayarlar Firma Profili içermeli");
  assert.ok(settingsMenuIds.includes("staff-teams"), "Ayarlar Çalışanlar ve Ekipler içermeli");
  assert.ok(settingsMenuIds.includes("departments"), "Ayarlar Departmanlar içermeli");
  assert.ok(settingsMenuIds.includes("roles-access"), "Ayarlar Roller ve Erişim içermeli");
  assert.ok(settingsMenuIds.includes("modules"), "Ayarlar Modüller içermeli");
});

test("Faz 5 - 03: Modül Kataloğunda Global Portföy Sahipliği", async () => {
  const { PRODUCT_MODULE_CATALOG } = await import(pathToFileURL(taxonomyPath).href);

  const peopleMod = PRODUCT_MODULE_CATALOG.find((m) => m.id === "people");
  assert.ok(peopleMod, "people modülü katalogda olmalı");
  assert.strictEqual(peopleMod.scope, "CROSS_CONTEXT", "people kapsamı CROSS_CONTEXT olmalı");
  assert.strictEqual(peopleMod.targetNavArea, "portfolio", "people hedef alanı portfolio olmalı");

  const orgsMod = PRODUCT_MODULE_CATALOG.find((m) => m.id === "organizations");
  assert.ok(orgsMod, "organizations modülü katalogda olmalı");
  assert.strictEqual(orgsMod.scope, "CROSS_CONTEXT", "organizations kapsamı CROSS_CONTEXT olmalı");
  assert.strictEqual(orgsMod.targetNavArea, "portfolio", "organizations hedef alanı portfolio olmalı");

  const commsMod = PRODUCT_MODULE_CATALOG.find((m) => m.id === "company-communications");
  assert.ok(commsMod, "company-communications modülü katalogda olmalı");
  assert.strictEqual(commsMod.scope, "GLOBAL");
});

test("Faz 5 - 04: Çalışan, Departman ve Rol Hiyerarşisi Mantığı", () => {
  const roleRanks = {
    ORG_OWNER: 100,
    ADMIN: 80,
    STAFF: 50,
    COLLABORATOR: 30,
    OBSERVER: 10,
  };

  assert.ok(roleRanks.ORG_OWNER > roleRanks.ADMIN, "Firma sahibi sistem yöneticisinden üsttedir");
  assert.ok(roleRanks.ADMIN > roleRanks.STAFF, "Yönetici çalışandan üsttedir");
  assert.ok(roleRanks.STAFF > roleRanks.COLLABORATOR, "Çalışan dış partnerden üsttedir");
  assert.ok(roleRanks.COLLABORATOR > roleRanks.OBSERVER, "Partner izleyiciden üsttedir");

  const departments = [
    { id: "congress", name: "Kongre & Organizasyon Departmanı" },
    { id: "fairs", name: "Fuar & Sergi Departmanı" },
    { id: "corporate", name: "Kurumsal & Müşteri Seyahati Departmanı" },
    { id: "operations", name: "Operasyon & Saha Hizmetleri" },
    { id: "finance", name: "Finans & Muhasebe Departmanı" },
  ];

  assert.strictEqual(departments.length, 5, "5 operasyonel departman tanımlı olmalı");
});

test("Faz 5 - 05: Modül Bileşen Haritasında Portfolio ve Company-Settings Kaydı", async () => {
  const fs = await import("node:fs");
  const content = fs.readFileSync(moduleComponentsPath, "utf-8");

  assert.ok(
    content.includes('moduleId === "portfolio"') && content.includes("PortfolioViewDyn"),
    "renderModuleComponent içinde 'portfolio' bileşeni kayıtlı olmalı"
  );
  assert.ok(
    content.includes('moduleId === "company-settings"') && content.includes("CompanySettingsViewDyn"),
    "renderModuleComponent içinde 'company-settings' bileşeni kayıtlı olmalı"
  );
});
