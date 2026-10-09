import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const rootDir = process.cwd();

test("Faz 7: Bilimsel modülü bildiri, hakem, karar ve CME sekmelerini gruplar", () => {
  const file = path.join(rootDir, "src/components/maven/views/scientific.tsx");
  const content = fs.readFileSync(file, "utf8");

  // ScientificView tab yapısı
  assert.match(content, /value="submissions"/, "Bildiriler sekmesi olmalı");
  assert.match(content, /value="reviews"/, "Hakem Değerlendirmesi sekmesi olmalı");
  assert.match(content, /value="decisions"/, "Karar Merkezi sekmesi olmalı");
  assert.match(content, /value="cme"/, "CME Kredi Defteri sekmesi Scientific altında bulunmalı");

  // moduleSubView senkronizasyonu
  assert.match(content, /moduleSubView === "reviews"/, "reviews alt görünüm senkronizasyonu olmalı");
  assert.match(content, /moduleSubView === "decisions"/, "decisions alt görünüm senkronizasyonu olmalı");
  assert.match(content, /moduleSubView === "cme"/, "cme alt görünüm senkronizasyonu olmalı");
});

test("Faz 7: Kabul edilen bildiriden oturum/konuşmacıya geçiş köprüsü tanımlıdır", () => {
  const file = path.join(rootDir, "src/components/maven/views/scientific.tsx");
  const content = fs.readFileSync(file, "utf8");

  // Oturum eşleme haritası
  assert.match(content, /sessionBySubId/, "Bildiriye ait oturum eşleme haritası olmalı");
  // Slot bekleme veya oturumda planlandı rozeti
  assert.match(content, /awaitingSlot/, "Slot bekleyen rozeti olmalı");
  assert.match(content, /slottedInSession/, "Oturumda planlandı rozeti olmalı");
  // Programa oturum oluşturma ve programda açma CTA'ları
  assert.match(content, /btnCreateSession/, "Programa oturum oluşturma aksiyonu olmalı");
  assert.match(content, /btnViewInProgram/, "Programda açma aksiyonu olmalı");
  assert.match(content, /createSessionSub/, "Bildiriden oturum oluşturma diyaloğu olmalı");
});

test("Faz 7: Program oturum, salon, konuşmacı, çizelge ve yayın akışında düzenlenmiştir", () => {
  const file = path.join(rootDir, "src/components/maven/views/scientific.tsx");
  const content = fs.readFileSync(file, "utf8");

  // ProgramView tab yapısı
  assert.match(content, /<TabsTrigger value="sessions"/, "Oturumlar sekmesi olmalı");
  assert.match(content, /<TabsTrigger value="rooms"/, "Salonlar sekmesi olmalı");
  assert.match(content, /<TabsTrigger value="speakers"/, "Konuşmacılar sekmesi olmalı");
  assert.match(content, /<TabsTrigger value="timetable"/, "Timetable sekmesi olmalı");
  assert.match(content, /<TabsTrigger value="broadcast"/, "Yayın akışı sekmesi olmalı");

  // ProgramView Tab içerikleri
  assert.match(content, /<TabsContent value="rooms"/, "Salonlar sekme içeriği olmalı");
  assert.match(content, /<TabsContent value="speakers"/, "Konuşmacılar sekme içeriği olmalı");
  assert.match(content, /<TabsContent value="broadcast"/, "Yayın akışı sekme içeriği olmalı");

  // İstatistik ve hesaplama mantıkları
  assert.match(content, /speakersList/, "Konuşmacı listesi türetilmiş olmalı");
  assert.match(content, /roomsStats/, "Salon kullanım istatistikleri hesaplanmalı");
  assert.match(content, /publishedSessions/, "Yayınlanan oturumlar filtrelenmeli");
});

test("Faz 7: Sosyal etkinlik ve turlar programla ilişkili ayrı katılım alanı sunar", () => {
  const file = path.join(rootDir, "src/components/maven/views/social.tsx");
  const content = fs.readFileSync(file, "utf8");

  // Program entegrasyonu bildirimi
  assert.match(content, /programIntegrationNotice/, "İş programı entegrasyon bildirimi olmalı");

  // Sekmeler: Etkinlik & Tur Planları vs Ayrı Katılım Alanı (LCV)
  assert.match(content, /<TabsTrigger value="plans"/, "Planlar sekmesi olmalı");
  assert.match(content, /<TabsTrigger value="attendance"/, "Ayrı Katılım Alanı (LCV) sekmesi olmalı");
  assert.match(content, /<TabsContent value="attendance"/, "Katılım alanı içeriği olmalı");

  // Paket dahil / ücretli ayrımı
  assert.match(content, /includedInPackage/, "Kayıt paketine dahil rozeti olmalı");
  assert.match(content, /paidActivity/, "Ek ücretli aktivite rozeti olmalı");
  assert.match(content, /inviteFromWork/, "İş katılımcılarından davet aksiyonu olmalı");
});

test("Faz 7: Dual Sidebar navigasyonu program_content modüllerini doğru eşler", () => {
  const file = path.join(rootDir, "src/components/maven/navigation/dual-sidebar.tsx");
  const content = fs.readFileSync(file, "utf8");

  assert.match(content, /primaryModuleId === "scientific"[\s\S]*displayTitle = t\("modules\.scientific"\)/, "Bilimsel başlık eşlemesi olmalı");
  assert.match(content, /primaryModuleId === "program"[\s\S]*displayTitle = t\("modules\.program"\)/, "Program başlık eşlemesi olmalı");
  assert.match(content, /primaryModuleId === "social"[\s\S]*displayTitle = t\("modules\.social"\)/, "Sosyal & turlar başlık eşlemesi olmalı");
});

test("Faz 7: Sözlük çevirileri eksiksiz tanımlıdır (TR ve EN)", () => {
  const sciTr = JSON.parse(fs.readFileSync(path.join(rootDir, "src/i18n/_new/scientific.tr.json"), "utf8"));
  const sciEn = JSON.parse(fs.readFileSync(path.join(rootDir, "src/i18n/_new/scientific.en.json"), "utf8"));
  const socTr = JSON.parse(fs.readFileSync(path.join(rootDir, "src/i18n/_new/social.tr.json"), "utf8"));
  const socEn = JSON.parse(fs.readFileSync(path.join(rootDir, "src/i18n/_new/social.en.json"), "utf8"));

  // Scientific anahtarları
  const reqSci = [
    "tabSubmissions", "tabReviews", "tabDecisions", "tabCme",
    "tabRooms", "tabSpeakers", "tabBroadcast",
    "awaitingSlot", "slottedInSession", "btnCreateSession", "btnViewInProgram",
    "createSessionForSubTitle", "noRoomsFound", "noSpeakersFound", "noBroadcastSessions"
  ];
  for (const k of reqSci) {
    assert.ok(sciTr.scientific[k], `scientific.tr.json eksik anahtar: ${k}`);
    assert.ok(sciEn.scientific[k], `scientific.en.json eksik anahtar: ${k}`);
  }

  // Social anahtarları
  const reqSoc = [
    "tabPlans", "tabAttendance", "programIntegrationNotice",
    "includedInPackage", "paidActivity", "inviteFromWork",
    "thPlan", "thKind", "thCapacity", "thPricing", "thRsvp"
  ];
  for (const k of reqSoc) {
    assert.ok(socTr.social[k], `social.tr.json eksik anahtar: ${k}`);
    assert.ok(socEn.social[k], `social.en.json eksik anahtar: ${k}`);
  }
});
