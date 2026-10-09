import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const taxonomyPath = path.resolve("src/lib/product-taxonomy.ts");
const storePath = path.resolve("src/lib/store.ts");
const registrationsPath = path.resolve("src/components/maven/views/registrations.tsx");
const peoplePath = path.resolve("src/components/maven/views/people.tsx");
const formCenterPath = path.resolve("src/components/maven/views/form-center.tsx");
const dualSidebarPath = path.resolve("src/components/maven/navigation/dual-sidebar.tsx");

test("Faz 6 - 01: Kişiler ve Kayıt Navigasyon Grubu ve Hedef Modül Eşlemesi", async () => {
  const { WORK_NAV_GROUPS } = await import(pathToFileURL(taxonomyPath).href);

  const peopleGroup = WORK_NAV_GROUPS.find((g) => g.id === "people_registration");
  assert.ok(peopleGroup, "people_registration grubu tanımlı olmalı");
  assert.strictEqual(peopleGroup.title, "Kişiler ve Kayıt");

  const itemMap = Object.fromEntries(peopleGroup.items.map((i) => [i.id, i.primaryModuleId]));
  assert.strictEqual(itemMap["people-orgs"], "people", "Kişiler ve Kurumlar -> people modülüne gitmeli");
  assert.strictEqual(itemMap["participants"], "registrations", "Katılımcılar -> registrations modülüne gitmeli");
  assert.strictEqual(itemMap["categories-rights"], "registrations", "Kategoriler ve Haklar -> registrations modülüne gitmeli");
  assert.strictEqual(itemMap["forms"], "forms", "Formlar -> forms modülüne gitmeli");
  assert.strictEqual(itemMap["approval-center"], "registrations", "Onay Merkezi -> registrations modülüne gitmeli");
  assert.strictEqual(itemMap["import-export"], "registrations", "İçe / Dışa Aktarım -> registrations modülüne gitmeli");
});

test("Faz 6 - 02: Kayıtlar Modülü Çoklu Sekme ve Kategoriler & Haklar Sözleşmesi", () => {
  const content = fs.readFileSync(registrationsPath, "utf-8");

  assert.ok(
    content.includes('"categories"'),
    "RegistrationsView içinde 'categories' sekmesi tanımlı olmalı"
  );
  assert.ok(
    content.includes("openNewCategory") && content.includes("saveCategory"),
    "Kategori ekleme/kaydetme fonksiyonları bulunmalı"
  );
  assert.ok(
    content.includes("catDialogOpen"),
    "Kategori yönetim diyaloğu bulunmalı"
  );
  assert.ok(
    content.includes("totalCategories") && content.includes("totalCapacity"),
    "Kategoriler KPI kartları bulunmalı"
  );
});

test("Faz 6 - 03: Kaynak Ekran İçe/Dışa Aktarım ve Portföy vs İş Katılımı Ayrımı", () => {
  const regContent = fs.readFileSync(registrationsPath, "utf-8");
  const peopleContent = fs.readFileSync(peoplePath, "utf-8");

  // Kayıtlar ekranı
  assert.ok(
    regContent.includes("regIo.import.btn") && regContent.includes("regIo.export.btn"),
    "Kayıtlar ekranında içe ve dışa aktarım butonları kaynak ekranda olmalı"
  );
  assert.ok(
    regContent.includes("scopeNotice"),
    "Kayıtlar ekranında İş Katılımı kapsam uyarısı bulunmalı"
  );

  // Kişiler ekranı
  assert.ok(
    peopleContent.includes("workScopeNotice") && peopleContent.includes("portfolioScopeNotice"),
    "Kişiler ekranında İş Katılımı vs Firma Portföyü ayrımı bildirimi olmalı"
  );
  assert.ok(
    peopleContent.includes("workParticipationBadge") && peopleContent.includes("portfolioMasterBadge"),
    "Kişiler ekranında İş Katılımı ve Portföy Ana Kaydı rozetleri olmalı"
  );
  assert.ok(
    peopleContent.includes("toggleEventLink"),
    "Kişiyi işe bağlama/çıkarma fonksiyonu mevcut olmalı"
  );
});

test("Faz 6 - 04: Form Merkezi — Yanıttan İncelemeye ve Doğru Modül Sonucuna Geçiş", () => {
  const content = fs.readFileSync(formCenterPath, "utf-8");

  // 4 Sekmeli bütünleşik yapı
  assert.ok(
    content.includes('value="list"') && content.includes('value="studio"') && content.includes('value="inbox"') && content.includes('value="live"'),
    "Form Merkezinde Formlar, Stüdyo, Yanıtlar ve Canlı Görünüm sekmeleri olmalı"
  );

  // Yanıttan ilgili modüllere geçiş butonları
  assert.ok(
    content.includes("openInRegistrations"),
    "İnceleme detayında 'Kayıt Modülünde Aç' aksiyonu bulunmalı"
  );
  assert.ok(
    content.includes("openInPeople"),
    "İnceleme detayında 'Kişi 360'ta Aç' aksiyonu bulunmalı"
  );
  assert.ok(
    content.includes("openInFinance"),
    "İnceleme detayında 'Finans / Siparişte Aç' aksiyonu bulunmalı"
  );
});

test("Faz 6 - 05: Store ve Çift Sol Menü Entegrasyonu", () => {
  const storeContent = fs.readFileSync(storePath, "utf-8");
  const sidebarContent = fs.readFileSync(dualSidebarPath, "utf-8");

  // Store desteği
  assert.ok(
    storeContent.includes("moduleSubView") && storeContent.includes("setModuleSubView"),
    "Store AppState içinde moduleSubView ve setModuleSubView tanımlı olmalı"
  );

  // Çift sol menü yönlendirmesi
  assert.ok(
    sidebarContent.includes('setModule("registrations", "categories")'),
    "Kategoriler ve Haklar tıklandığında registrations modülü categories alt görünümüyle açılmalı"
  );
  assert.ok(
    sidebarContent.includes('setModule("registrations", "approval")'),
    "Onay Merkezi tıklandığında registrations modülü approval alt görünümüyle açılmalı"
  );
  assert.ok(
    sidebarContent.includes('setModule("registrations", "import")'),
    "İçe/Dışa Aktarım tıklandığında registrations modülü import alt görünümüyle açılmalı"
  );
});
