# Uygulama Planı: 014 — Mekân, Konaklama, Seyahat ve Saha (Faz 9)

## 1. Mimari Tasarım ve Bileşen Yapısı

Bu faz, `12-PRODUCT-TRANSFORMATION-ROADMAP.md` belgesindeki **Faz 9** hedeflerini mevcut bileşenleri bozmadan, modüler ve bağlamsal olarak dönüştürür.

### A. Dual Sidebar Entegrasyonu (`src/components/maven/navigation/dual-sidebar.tsx`)
- `venue_onsite` grubu:
  - `venues-spaces`: `setModule("floors", null)`
  - `onsite-operations`: `setModule("onsite", "desk")`
  - `badges-print`: `setModule("badges", "queue")`
  - `certificates-docs`: `setModule("certificates", null)`
- `accommodation_services` grubu:
  - `accommodation`: `setModule("accommodation", "hotels")`
  - `travel-transfers`: `setModule("accommodation", "transfers")`
  - `extra-services`: `setModule("finance", null)`
- `isItemActive` mantığının `moduleSubView` ile senkronize edilmesi.

### B. Konaklama ve Seyahat Konsolu (`src/components/maven/views/accommodation.tsx`)
- Sekmeli yapı oluşturulması:
  - `hotels`: Oteller, oda tipleri ve gecelik stok yönetimi.
  - `reservations`: Katılımcı oda rezervasyonları ve no-show yönetimi.
  - `rooming`: Cvent standartlarında RoomingMatrixConsole (toplu içe aktarım ve eşleştirme).
  - `transfers`: Seyahat ve transfer takibi (uçuş kodu, araç tipi, şoför, karşılama ve durum yaşam döngüsü).
- `moduleSubView` ile iki yönlü senkronizasyon (asenkron setTimeout ile React 19 uyumlu).
- Seyahat ve transfer demo/canlı veri akışı ve durum güncelleme aksiyonları.

### C. Saha Operasyonu ve Mekân Entegrasyonu (`src/components/maven/views/onsite.tsx`)
- `OnsiteView` içine işin mekân bilgisi (`editions.venue` / `city`) ve kapı bağlantı bildirimi eklenmesi.
- 4 sekmeli operasyonel görünüm:
  - `desk`: Hızlı masa tarama konsolu ve check-in.
  - `kiosk`: KioskTerminal self-servis modülü.
  - `occupancy`: InsideOccupancyWidget anlık alan içi yoğunluk takibi.
  - `cme`: SessionCmeConsole oturum yoklama konsolu.
- `CertificatesView` içine katılımcı dış portalı ve sertifika görüntüleme bilgilendirme bildirimi eklenmesi.

### D. Yaka Kartı Baskı Merkezi (`src/components/maven/views/badge-queue.tsx`)
- Yaka kartı operasyonunun bağımsızlığı ve katılımcı dış portalı (`/portal/attendee`) QR/dijital kart bağlantı bilgilendirme bildirimi eklenmesi.

### E. i18n Sözlükleri
- `src/i18n/_new/accommodation.tr.json` / `en.json`
- `src/i18n/_new/onsite.tr.json` / `en.json`
- `src/i18n/_new/badges.tr.json` / `en.json` (veya `badgeQueue`)
- `src/i18n/_new/certificates.tr.json` / `en.json`
- Sıfır hardcoded metin kuralı (`i18n:scan`).

---

## 2. Test ve Doğrulama
- `tests-mini/venue-accommodation-travel-and-onsite.test.mjs` test paketi:
  - Dual Sidebar grup ve alt öğe yönlendirme sözleşmesi.
  - Konaklama sekmeleri ve transfer akışı doğrulaması.
  - Saha operasyonu mekân bağı ve sekmeler doğrulaması.
  - Yaka kartı ve sertifika dış portal bağlantı doğrulaması.
  - i18n sözlük bütünlüğü doğrulaması.
