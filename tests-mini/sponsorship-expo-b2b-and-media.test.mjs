import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const rootDir = process.cwd();

test("Faz 8: Dual Sidebar sponsorluk, fuar, b2b ve medya rotalarını haritalar", () => {
  const taxFile = path.join(rootDir, "src/lib/product-taxonomy.ts");
  const taxContent = fs.readFileSync(taxFile, "utf8");

  // sponsor_exhibition alt öğeleri (product-taxonomy)
  assert.match(taxContent, /id: "sponsors"/, "Sponsors alt öğesi olmalı");
  assert.match(taxContent, /id: "packages-agreements"/, "Packages & Agreements alt öğesi olmalı");
  assert.match(taxContent, /id: "deliverables-entitlements"/, "Deliverables & Entitlements alt öğesi olmalı");
  assert.match(taxContent, /id: "booths-floors"/, "Booths & Floors alt öğesi olmalı");
  assert.match(taxContent, /id: "b2b"/, "B2B alt öğesi olmalı");

  const sideFile = path.join(rootDir, "src/components/maven/navigation/dual-sidebar.tsx");
  const sideContent = fs.readFileSync(sideFile, "utf8");

  // setModule yönlendirmeleri
  assert.match(sideContent, /setModule\("sponsorship",\s*"sponsors"\)/, "sponsors alt görünümü yönlendirilmelidir");
  assert.match(sideContent, /setModule\("sponsorship",\s*"packages"\)/, "packages alt görünümü yönlendirilmelidir");
  assert.match(sideContent, /setModule\("sponsorship",\s*"deliverables"\)/, "deliverables alt görünümü yönlendirilmelidir");
  assert.match(sideContent, /setModule\("floors",\s*null\)/, "floors modülüne yönlendirilmelidir");
});

test("Faz 8: Sponsorluk modülü 5 aşamalı sıralı akış ve dış portal izolasyonunu uygular", () => {
  const file = path.join(rootDir, "src/components/maven/views/sponsorship.tsx");
  const content = fs.readFileSync(file, "utf8");

  // 5 sıralı sekme butonları
  assert.match(content, /tabSponsors/, "tabSponsors sekmesi bulunmalı");
  assert.match(content, /tabPackages/, "tabPackages sekmesi bulunmalı");
  assert.match(content, /tabEntitlements/, "tabEntitlements sekmesi bulunmalı");
  assert.match(content, /tabDeliverables/, "tabDeliverables sekmesi bulunmalı");
  assert.match(content, /tabBooths/, "tabBooths sekmesi bulunmalı");

  // moduleSubView senkronizasyonu
  assert.match(content, /moduleSubView === "sponsors"/, "sponsors subview senkronize edilmeli");
  assert.match(content, /moduleSubView === "packages"/, "packages subview senkronize edilmeli");
  assert.match(content, /moduleSubView === "deliverables"/, "deliverables subview senkronize edilmeli");

  // Dış portal izolasyon uyarısı ve aksiyonu
  assert.match(content, /portalIsolationNotice/, "Portal izolasyon bildirimi bulunmalı");
  assert.match(content, /btnOpenSponsorPortal/, "Portal açma aksiyon butonu bulunmalı");

  // Floor Studio entegrasyon uyarısı
  assert.match(content, /boothFloorNotice/, "Floor Studio stant tahsis kuralı bildirimi bulunmalı");
});

test("Faz 8: Floor Studio stant tahsisini sponsor hakları ve mekanla bağlar", () => {
  const file = path.join(rootDir, "src/components/maven/views/floors.tsx");
  const content = fs.readFileSync(file, "utf8");

  // Mekân ve sponsor hak havuzu bağlantı bildirimi
  assert.match(content, /sponsorLinkNotice/, "sponsorLinkNotice bildirimi bulunmalı");

  // i18n dosya kontrolleri
  const trFile = path.join(rootDir, "src/i18n/_new/floors.tr.json");
  const enFile = path.join(rootDir, "src/i18n/_new/floors.en.json");
  const trContent = JSON.parse(fs.readFileSync(trFile, "utf8"));
  const enContent = JSON.parse(fs.readFileSync(enFile, "utf8"));

  assert.ok(trContent.floors.sponsorLinkNotice, "floors.tr.json içinde sponsorLinkNotice tanımlı olmalı");
  assert.ok(enContent.floors.sponsorLinkNotice, "floors.en.json içinde sponsorLinkNotice tanımlı olmalı");
});

test("Faz 8: B2B modülü talep, karşılıklı onay ve görüşme çizelgesini tek yolculukta birleştirir", () => {
  const file = path.join(rootDir, "src/components/maven/views/b2b.tsx");
  const content = fs.readFileSync(file, "utf8");

  // Tek yolculuk bildirim şeridi
  assert.match(content, /journeyNotice/, "journeyNotice tek kullanıcı yolculuğu bildirimi olmalı");

  // 3 aşamalı sekme yapısı
  assert.match(content, /tabRequests/, "tabRequests sekmesi bulunmalı");
  assert.match(content, /tabMutual/, "tabMutual sekmesi bulunmalı");
  assert.match(content, /tabTimetable/, "tabTimetable sekmesi bulunmalı");

  // Karşılıklı onay kontrolleri
  assert.match(content, /organizerApprove/, "Organizatör onay aksiyonu bulunmalı");
  assert.match(content, /allAssignments/, "Tüm atamalar listesi hesaplanmalı");

  // Görüşme çizelgesi tablo sütunları
  assert.match(content, /thMeeting/, "Görüşme konusu sütun başlığı olmalı");
  assert.match(content, /thParticipants/, "Katılımcılar sütun başlığı olmalı");
  assert.match(content, /thTimeSlot/, "Zaman dilimi sütun başlığı olmalı");
  assert.match(content, /thLocation/, "Masa/lokasyon sütun başlığı olmalı");
  assert.match(content, /thMutualStatus/, "Karşılıklı durum sütun başlığı olmalı");
});

test("Faz 8: Medya modülü işe ait medya ile firma marka kitaplığını ayırır", () => {
  const file = path.join(rootDir, "src/components/maven/views/media.tsx");
  const content = fs.readFileSync(file, "utf8");

  // Sekmeler
  assert.match(content, /tabWorkMedia/, "tabWorkMedia sekmesi bulunmalı");
  assert.match(content, /tabBrandLibrary/, "tabBrandLibrary sekmesi bulunmalı");

  // Bildirim şeritleri
  assert.match(content, /workMediaNotice/, "workMediaNotice bildirimi bulunmalı");
  assert.match(content, /brandLibraryNotice/, "brandLibraryNotice bildirimi bulunmalı");

  // Firma B marka kitaplığı varlıkları
  assert.match(content, /BRAND_LIBRARY_ITEMS/, "Firma B marka kitaplığı sabit varlık listesi tanımlı olmalı");

  // Bağlı modül etiketleri
  assert.match(content, /LINKED_TYPE_LABEL/, "Bağlı modül etiket sözlüğü bulunmalı");
});

test("Faz 8: i18n sözlüklerinde tüm Faz 8 anahtarları TR ve EN karşılıklarına sahiptir", () => {
  const spTr = JSON.parse(fs.readFileSync(path.join(rootDir, "src/i18n/_new/sponsorship.tr.json"), "utf8"));
  const spEn = JSON.parse(fs.readFileSync(path.join(rootDir, "src/i18n/_new/sponsorship.en.json"), "utf8"));
  assert.ok(spTr.sponsorship.tabSponsors && spEn.sponsorship.tabSponsors);
  assert.ok(spTr.sponsorship.portalIsolationNotice && spEn.sponsorship.portalIsolationNotice);
  assert.ok(spTr.sponsorship.boothFloorNotice && spEn.sponsorship.boothFloorNotice);

  const b2bTr = JSON.parse(fs.readFileSync(path.join(rootDir, "src/i18n/_new/b2b.tr.json"), "utf8"));
  const b2bEn = JSON.parse(fs.readFileSync(path.join(rootDir, "src/i18n/_new/b2b.en.json"), "utf8"));
  assert.ok(b2bTr.b2b.journeyNotice && b2bEn.b2b.journeyNotice);
  assert.ok(b2bTr.b2b.tabRequests && b2bEn.b2b.tabRequests);
  assert.ok(b2bTr.b2b.tabMutual && b2bEn.b2b.tabMutual);
  assert.ok(b2bTr.b2b.tabTimetable && b2bEn.b2b.tabTimetable);

  const medTr = JSON.parse(fs.readFileSync(path.join(rootDir, "src/i18n/_new/media.tr.json"), "utf8"));
  const medEn = JSON.parse(fs.readFileSync(path.join(rootDir, "src/i18n/_new/media.en.json"), "utf8"));
  assert.ok(medTr.media.tabWorkMedia && medEn.media.tabWorkMedia);
  assert.ok(medTr.media.tabBrandLibrary && medEn.media.tabBrandLibrary);
  assert.ok(medTr.media.brandLibraryNotice && medEn.media.brandLibraryNotice);
  assert.ok(medTr.media.workMediaNotice && medEn.media.workMediaNotice);
});
