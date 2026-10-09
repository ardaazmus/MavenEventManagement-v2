import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const root = path.resolve(__dirname, "..");

const taxonomyPath = path.join(root, "src/lib/product-taxonomy.ts");
const moduleComponentsPath = path.join(root, "src/lib/module-components.tsx");
const companyReportsViewPath = path.join(root, "src/components/maven/views/company-reports-view.tsx");
const financeViewPath = path.join(root, "src/components/maven/views/finance.tsx");
const accountingViewPath = path.join(root, "src/components/maven/views/accounting.tsx");
const dualSidebarPath = path.join(root, "src/components/maven/navigation/dual-sidebar.tsx");
const trJsonPath = path.join(root, "src/i18n/tr.json");
const enJsonPath = path.join(root, "src/i18n/en.json");

test("Faz 11 - 01: 5 Aşamalı Makro Yaşam Döngüsü ve getMacroLifecycleStage Doğrulaması", async () => {
  const { MACRO_LIFECYCLE_STAGES, getMacroLifecycleStage } = await import(pathToFileURL(taxonomyPath).href);

  // 1. 5 makro aşamanın tamamı mevcut olmalı
  const stageIds = MACRO_LIFECYCLE_STAGES.map((s) => s.id);
  assert.deepStrictEqual(stageIds, ["DRAFT", "PLANNING", "ACTIVE", "COMPLETED", "ARCHIVED"]);

  // 2. Durum eşleme kuralları
  assert.strictEqual(getMacroLifecycleStage({ status: "ARCHIVED", isPublished: true }), "ARCHIVED");
  assert.strictEqual(getMacroLifecycleStage({ status: "POST_EVENT", isPublished: true }), "COMPLETED");
  assert.strictEqual(getMacroLifecycleStage({ status: "RECONCILIATION", isPublished: true }), "COMPLETED");
  assert.strictEqual(getMacroLifecycleStage({ status: "PLANNING", isPublished: false }), "DRAFT");
  assert.strictEqual(getMacroLifecycleStage({ status: "DRAFT", isPublished: true }), "DRAFT");
  assert.strictEqual(getMacroLifecycleStage({ status: "OPPORTUNITY", isPublished: true }), "PLANNING");
  assert.strictEqual(getMacroLifecycleStage({ status: "BID", isPublished: true }), "PLANNING");
  assert.strictEqual(getMacroLifecycleStage({ status: "AWARDED", isPublished: true }), "PLANNING");
  assert.strictEqual(getMacroLifecycleStage({ status: "PLANNING", isPublished: true }), "PLANNING");
  assert.strictEqual(getMacroLifecycleStage({ status: "CONFIGURATION", isPublished: true }), "ACTIVE");
  assert.strictEqual(getMacroLifecycleStage({ status: "REGISTRATION", isPublished: true }), "ACTIVE");
  assert.strictEqual(getMacroLifecycleStage({ status: "ONSITE", isPublished: true }), "ACTIVE");
});

test("Faz 11 - 02: Firma Raporları Panosu ve Modül Kaydı Doğrulaması", () => {
  assert.ok(fs.existsSync(companyReportsViewPath), "company-reports-view.tsx dosyası mevcut olmalıdır");
  const reportsViewContent = fs.readFileSync(companyReportsViewPath, "utf-8");

  // 6 Sekmeli yapının varlığı
  assert.ok(reportsViewContent.includes('value="works-report"'), "İş Portföyü sekmesi bulunmalıdır");
  assert.ok(reportsViewContent.includes('value="portfolio-report"'), "Portföy sekmesi bulunmalıdır");
  assert.ok(reportsViewContent.includes('value="finance-report"'), "Finans sekmesi bulunmalıdır");
  assert.ok(reportsViewContent.includes('value="operations-report"'), "Operasyon sekmesi bulunmalıdır");
  assert.ok(reportsViewContent.includes('value="comms-report"'), "İletişim sekmesi bulunmalıdır");
  assert.ok(reportsViewContent.includes('value="exports-report"'), "Dışa aktarımlar sekmesi bulunmalıdır");

  // Rapordan kaynak işe doğrudan geçiş eylemleri
  assert.ok(reportsViewContent.includes("handleOpenWorkSummary"), "İş Özetine geçiş eylemi bulunmalıdır");
  assert.ok(reportsViewContent.includes("handleOpenWorkFinance"), "İş Finansına geçiş eylemi bulunmalıdır");
  assert.ok(reportsViewContent.includes("handleOpenWorkAccounting"), "İş Muhasebesine geçiş eylemi bulunmalıdır");
  assert.ok(reportsViewContent.includes("handleOpenWorkRegistrations"), "Katılımcılara geçiş eylemi bulunmalıdır");

  // module-components.tsx kaydı
  const modCompContent = fs.readFileSync(moduleComponentsPath, "utf-8");
  assert.ok(modCompContent.includes("CompanyReportsView"), "CompanyReportsView module-components'e import edilmelidir");
  assert.ok(modCompContent.includes('"company-reports"'), "company-reports modül haritasına kaydedilmelidir");
});

test("Faz 11 - 03: Operasyonel Finans ve Muhasebe Görünümlerinin Ayrılması", () => {
  const financeContent = fs.readFileSync(financeViewPath, "utf-8");
  const accountingContent = fs.readFileSync(accountingViewPath, "utf-8");

  // 1. FinanceView operasyonel kapsam ve SoD bildirimi
  assert.ok(financeContent.includes("financeView.scopeNotice"), "FinanceView operasyonel kapsam uyarısı içermelidir");
  assert.ok(financeContent.includes("financeView.btnGoToAccounting"), "FinanceView muhasebeye geçiş butonu içermelidir");
  assert.ok(financeContent.includes("financeView.sodNotice"), "FinanceView SoD çift onay uyarısı içermelidir");

  // 2. AccountingView kurumsal kapsam ve operasyonel finansa/iş özetine dönüş butonları
  assert.ok(accountingContent.includes("accountingView.scopeNotice"), "AccountingView kurumsal defter uyarısı içermelidir");
  assert.ok(accountingContent.includes("accountingView.btnGoToFinance"), "AccountingView operasyonel finansa dönüş butonu içermelidir");
  assert.ok(accountingContent.includes("accountingView.btnGoToSummary"), "AccountingView iş özetine dönüş butonu içermelidir");

  // 3. Mutabakat Kapanış Sertifikası
  assert.ok(accountingContent.includes("accountingView.workSettlementTitle"), "AccountingView iş kapanış mutabakatı kartı içermelidir");
  assert.ok(accountingContent.includes("accountingView.btnArchiveWork"), "AccountingView işi arşivleme butonu içermelidir");
});

test("Faz 11 - 04: Dual Sidebar İş Raporları ve Firma Raporları Senkronizasyonu", () => {
  const sidebarContent = fs.readFileSync(dualSidebarPath, "utf-8");

  // 1. Global alanda reports tıklandığında company-reports açılmalı
  assert.ok(sidebarContent.includes('setModule("company-reports")'), "Global reports alanı company-reports modülünü açmalıdır");

  // 2. Alt menüde reports sekmeleri moduleSubView ile eşleşmeli
  assert.ok(sidebarContent.includes('setModule("company-reports", item.id)'), "reports alt sekmeleri moduleSubView ile yönlendirmelidir");

  // 3. work_reports grubu eşlemesi
  assert.ok(sidebarContent.includes('group.id === "work_reports"'), "work_reports grubu tıklama mantığı tanımlanmalıdır");
  assert.ok(sidebarContent.includes('setModule("accounting", "defter")'), "work-finance-reports accounting deftere gitmelidir");
  assert.ok(sidebarContent.includes('setModule("registrations", "reports")'), "work-reg-reports registrations raporuna gitmelidir");
  assert.ok(sidebarContent.includes('setModule("sponsorship", "roi")'), "work-sponsor-reports sponsorship ROI raporuna gitmelidir");
});

test("Faz 11 - 05: i18n Sözlük Paritesi (TR & EN)", () => {
  const tr = JSON.parse(fs.readFileSync(trJsonPath, "utf-8"));
  const en = JSON.parse(fs.readFileSync(enJsonPath, "utf-8"));

  // company-reports modül etiketi
  assert.ok(tr.modules["company-reports"], "tr.modules company-reports içermelidir");
  assert.ok(en.modules["company-reports"], "en.modules company-reports içermelidir");

  // Blok varlığı
  assert.ok(tr.companyReports && en.companyReports, "companyReports bloğu her iki dilde bulunmalıdır");
  assert.ok(tr.workReports && en.workReports, "workReports bloğu her iki dilde bulunmalıdır");
  assert.ok(tr.financeView && en.financeView, "financeView bloğu her iki dilde bulunmalıdır");
  assert.ok(tr.accountingView && en.accountingView, "accountingView bloğu her iki dilde bulunmalıdır");
  assert.ok(tr.lifecycle && en.lifecycle, "lifecycle bloğu her iki dilde bulunmalıdır");

  // Birebir anahtar paritesi
  const trKeys = Object.keys(tr.companyReports).sort();
  const enKeys = Object.keys(en.companyReports).sort();
  assert.deepStrictEqual(trKeys, enKeys, "companyReports anahtarları birebir eşleşmelidir");

  const trLcKeys = Object.keys(tr.lifecycle).sort();
  const enLcKeys = Object.keys(en.lifecycle).sort();
  assert.deepStrictEqual(trLcKeys, enLcKeys, "lifecycle anahtarları birebir eşleşmelidir");
});
