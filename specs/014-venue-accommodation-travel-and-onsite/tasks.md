# Görev Listesi: 014 — Mekân, Konaklama, Seyahat ve Saha (Faz 9)

- [x] **T-01:** `specs/014-venue-accommodation-travel-and-onsite/` dokümantasyonunun hazırlanması (`spec.md`, `plan.md`, `tasks.md`).
- [x] **T-02:** `src/components/maven/navigation/dual-sidebar.tsx` içinde `venue_onsite` (`venues-spaces`, `onsite-operations`, `badges-print`, `certificates-docs`) ve `accommodation_services` (`accommodation`, `travel-transfers`, `extra-services`) alt öğelerinin `moduleSubView` ile bağlanması ve aktiflik durumunun senkronizasyonu.
- [x] **T-03:** i18n Sözlük Dosyalarının Hazırlanması (`accommodation.tr.json` / `en.json`, `onsite.tr.json` / `en.json`, `badges.tr.json` / `en.json`, `certificates.tr.json` / `en.json`) — 0 hardcoded metin ihlali.
- [x] **T-04:** `src/components/maven/views/accommodation.tsx` (`AccommodationView`):
  - [x] 4 sekmeli yapı: `hotels` (Oteller ve Bloklar), `reservations` (Rezervasyonlar), `rooming` (Rooming Listesi Konsolu), `transfers` (Seyahat ve Transfer).
  - [x] `moduleSubView` senkronizasyon effect'i (asenkron setTimeout ile React 19 uyumlu).
  - [x] Seyahat ve transfer takip konsolu (uçuş, şoför, plaka, karşılama ve durum rozetleri).
- [x] **T-05:** `src/components/maven/views/onsite.tsx` (`OnsiteView` ve `CertificatesView`):
  - [x] `OnsiteView`: İş mekânı bilgisi ve bağlantı bildirimi (`venueNotice`), 4 sekmeli operasyonel yapı (`desk`, `kiosk`, `occupancy`, `cme`).
  - [x] `CertificatesView`: Katılımcı dış portalı ve sertifika görüntüleme bilgilendirme bildirimi (`portalLinkNotice`).
- [x] **T-06:** `src/components/maven/views/badge-queue.tsx` (`BadgeQueueView`):
  - [x] Yaka kartı ≠ Katılım ilkesi ve katılımcı dış portalı QR / dijital kart erişim bildirimi (`portalBadgeNotice`).
- [x] **T-07:** `tests-mini/venue-accommodation-travel-and-onsite.test.mjs` test paketinin yazılması ve `package.json`'a eklenmesi.
- [x] **T-08:** Kalite kapılarının çalıştırılması (`typecheck`, `lint`, `i18n:scan`, `lint:arch`, `test:unit`, `test:smoke`, `quality-report`).
- [x] **T-09:** Kanıt raporunun (`docs/evidence/`) ve yol haritası durumunun güncellenmesi.
