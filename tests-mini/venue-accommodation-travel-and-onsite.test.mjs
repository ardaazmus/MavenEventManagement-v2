import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const rootDir = process.cwd();

test("Faz 9: Dual Sidebar mekan, saha, konaklama ve transfer rotalarını haritalar", () => {
  const taxFile = path.join(rootDir, "src/lib/product-taxonomy.ts");
  const taxContent = fs.readFileSync(taxFile, "utf8");

  // venue_onsite alt ogeleri
  assert.match(taxContent, /id: "venues-spaces"/, "venues-spaces alt ogesi bulunmali");
  assert.match(taxContent, /id: "onsite-operations"/, "onsite-operations alt ogesi bulunmali");
  assert.match(taxContent, /id: "badges-print"/, "badges-print alt ogesi bulunmali");
  assert.match(taxContent, /id: "certificates-docs"/, "certificates-docs alt ogesi bulunmali");

  // accommodation_services alt ogeleri
  assert.match(taxContent, /id: "accommodation"/, "accommodation alt ogesi bulunmali");
  assert.match(taxContent, /id: "travel-transfers"/, "travel-transfers alt ogesi bulunmali");
  assert.match(taxContent, /id: "extra-services"/, "extra-services alt ogesi bulunmali");

  const sideFile = path.join(rootDir, "src/components/maven/navigation/dual-sidebar.tsx");
  const sideContent = fs.readFileSync(sideFile, "utf8");

  // setModule yonlendirmeleri (Mekan & Saha)
  assert.match(sideContent, /setModule\("floors",\s*null\)/, "venues-spaces floors modulune yonlendirmeli");
  assert.match(sideContent, /setModule\("onsite",\s*"desk"\)/, "onsite-operations desk subview ile baslamali");
  assert.match(sideContent, /setModule\("badges",\s*"queue"\)/, "badges-print queue subview ile baslamali");
  assert.match(sideContent, /setModule\("certificates",\s*null\)/, "certificates-docs certificates modulune yonlendirmeli");

  // setModule yonlendirmeleri (Konaklama & Hizmetler)
  assert.match(sideContent, /setModule\("accommodation",\s*"hotels"\)/, "accommodation hotels subview ile baslamali");
  assert.match(sideContent, /setModule\("accommodation",\s*"transfers"\)/, "travel-transfers transfers subview ile baslamali");
  assert.match(sideContent, /setModule\("finance",\s*null\)/, "extra-services finance modulune yonlendirmeli");

  // moduleSubView aktiflik kontrolleri
  assert.match(sideContent, /moduleSubView === "transfers"/, "transfers subview aktiflik kontrolu bulunmali");
});

test("Faz 9: Konaklama modulu 4 sirali sekme ve seyahat/transfer konsolunu sunar", () => {
  const file = path.join(rootDir, "src/components/maven/views/accommodation.tsx");
  const content = fs.readFileSync(file, "utf8");

  // 4 sirali sekme butonlari
  assert.match(content, /tabHotels/, "tabHotels sekmesi bulunmali");
  assert.match(content, /tabReservations/, "tabReservations sekmesi bulunmali");
  assert.match(content, /tabRooming/, "tabRooming sekmesi bulunmali");
  assert.match(content, /tabTransfers/, "tabTransfers sekmesi bulunmali");

  // moduleSubView senkronizasyonu
  assert.match(content, /moduleSubView === "transfers"/, "transfers subview senkronize edilmeli");
  assert.match(content, /moduleSubView === "reservations"/, "reservations subview senkronize edilmeli");
  assert.match(content, /moduleSubView === "rooming"/, "rooming subview senkronize edilmeli");
  assert.match(content, /moduleSubView === "hotels"/, "hotels subview senkronize edilmeli");

  // Seyahat & Transfer takip konsolu
  assert.match(content, /transferNotice/, "transferNotice aciklama bildirimi bulunmali");
  assert.match(content, /btnNewTransfer/, "btnNewTransfer aksiyonu bulunmali");
  assert.match(content, /thFlight/, "Ucus kodu basligi bulunmali");
  assert.match(content, /thAirport/, "Havalimani basligi bulunmali");
  assert.match(content, /thPassenger/, "Yolcu/Misafir basligi bulunmali");
  assert.match(content, /thVehicle/, "Arac tipi basligi bulunmali");
  assert.match(content, /thDriver/, "Sofor & Plaka basligi bulunmali");
  assert.match(content, /thTransferStatus/, "Transfer durumu basligi bulunmali");

  // Transfer durumlari
  assert.match(content, /stRequested/, "Talep Alindi durumu bulunmali");
  assert.match(content, /stAssigned/, "Arac Atandi durumu bulunmali");
  assert.match(content, /stConfirmed/, "Teyit Edildi durumu bulunmali");
  assert.match(content, /stCompleted/, "Tamamlandi durumu bulunmali");
});

test("Faz 9: Saha Operasyonu mekan bilgisi, kapi kontrolu ve 4 operasyonel modu sunar", () => {
  const file = path.join(rootDir, "src/components/maven/views/onsite.tsx");
  const content = fs.readFileSync(file, "utf8");

  // Is mekani baglantisi
  assert.match(content, /venueNotice/, "venueNotice mekan baglanti bildirimi bulunmali");
  assert.match(content, /btnOpenVenue/, "btnOpenVenue mekan plani acma butonu bulunmali");

  // 4 operasyonel mod
  assert.match(content, /tabDesk/, "Hizli tarama masasi sekmesi bulunmali");
  assert.match(content, /tabKiosk/, "Kiosk terminali sekmesi bulunmali");
  assert.match(content, /tabOccupancy/, "Alan ici yogunluk sekmesi bulunmali");
  assert.match(content, /tabCme/, "Oturum CME yoklama sekmesi bulunmali");

  // moduleSubView senkronizasyonu
  assert.match(content, /moduleSubView === "desk"/, "desk subview kontrolu bulunmali");
  assert.match(content, /moduleSubView === "kiosk"/, "kiosk subview kontrolu bulunmali");
  assert.match(content, /moduleSubView === "occupancy"/, "occupancy subview kontrolu bulunmali");
  assert.match(content, /moduleSubView === "cme"/, "cme subview kontrolu bulunmali");
});

test("Faz 9: Yaka Karti ve Sertifikalar katilimci dis portalina baglanir", () => {
  // Yaka karti dis portal bildirimi
  const badgeFile = path.join(rootDir, "src/components/maven/views/badge-queue.tsx");
  const badgeContent = fs.readFileSync(badgeFile, "utf8");
  assert.match(badgeContent, /portalBadgeNotice/, "portalBadgeNotice dis portal QR bildirimi bulunmali");

  // Sertifika dis portal bildirimi
  const certFile = path.join(rootDir, "src/components/maven/views/onsite.tsx");
  const certContent = fs.readFileSync(certFile, "utf8");
  assert.match(certContent, /portalLinkNotice/, "portalLinkNotice katilimci portali goruntuleme bildirimi bulunmali");
});

test("Faz 9: i18n sozlukleri TR ve EN dil parity'sine sahiptir", () => {
  // Konaklama sozlukleri
  const accTr = JSON.parse(fs.readFileSync(path.join(rootDir, "src/i18n/_new/accommodation-plus.tr.json"), "utf8"));
  const accEn = JSON.parse(fs.readFileSync(path.join(rootDir, "src/i18n/_new/accommodation-plus.en.json"), "utf8"));

  assert.ok(accTr.accommodation.tabHotels, "TR tabHotels tanimli olmali");
  assert.ok(accEn.accommodation.tabHotels, "EN tabHotels tanimli olmali");
  assert.ok(accTr.accommodation.tabTransfers, "TR tabTransfers tanimli olmali");
  assert.ok(accEn.accommodation.tabTransfers, "EN tabTransfers tanimli olmali");
  assert.ok(accTr.accommodation.transferNotice, "TR transferNotice tanimli olmali");
  assert.ok(accEn.accommodation.transferNotice, "EN transferNotice tanimli olmali");
  assert.ok(accTr.accommodation.thTransferStatus, "TR thTransferStatus tanimli olmali");
  assert.ok(accEn.accommodation.thTransferStatus, "EN thTransferStatus tanimli olmali");

  // Saha operasyonu sozlukleri
  const onsiteTr = JSON.parse(fs.readFileSync(path.join(rootDir, "src/i18n/_new/onsite.tr.json"), "utf8"));
  const onsiteEn = JSON.parse(fs.readFileSync(path.join(rootDir, "src/i18n/_new/onsite.en.json"), "utf8"));

  assert.ok(onsiteTr.onsite.venueNotice, "TR venueNotice tanimli olmali");
  assert.ok(onsiteEn.onsite.venueNotice, "EN venueNotice tanimli olmali");
  assert.ok(onsiteTr.onsite.tabDesk, "TR tabDesk tanimli olmali");
  assert.ok(onsiteEn.onsite.tabDesk, "EN tabDesk tanimli olmali");
  assert.ok(onsiteTr.onsite.tabKiosk, "TR tabKiosk tanimli olmali");
  assert.ok(onsiteEn.onsite.tabKiosk, "EN tabKiosk tanimli olmali");
  assert.ok(onsiteTr.certificates.portalLinkNotice, "TR portalLinkNotice tanimli olmali");
  assert.ok(onsiteEn.certificates.portalLinkNotice, "EN portalLinkNotice tanimli olmali");

  // Yaka karti sozlukleri
  const badgeTr = JSON.parse(fs.readFileSync(path.join(rootDir, "src/i18n/_new/badge-queue.tr.json"), "utf8"));
  const badgeEn = JSON.parse(fs.readFileSync(path.join(rootDir, "src/i18n/_new/badge-queue.en.json"), "utf8"));

  assert.ok(badgeTr.badgeQueue.portalBadgeNotice, "TR portalBadgeNotice tanimli olmali");
  assert.ok(badgeEn.badgeQueue.portalBadgeNotice, "EN portalBadgeNotice tanimli olmali");
});
