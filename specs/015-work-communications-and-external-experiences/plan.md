# Uygulama Planı: 015 — İş İletişimi ve Dış Deneyimler (Faz 10)

## 1. Mimari Tasarım ve Bileşen Yapısı

Bu faz, `12-PRODUCT-TRANSFORMATION-ROADMAP.md` belgesindeki **Faz 10** hedeflerini mevcut mimariye tam uyumlu olarak gerçekleştirir.

### A. Dual Sidebar Navigasyonu (`src/components/maven/navigation/dual-sidebar.tsx`)
- `communication_experience` grubu:
  - `work-comms`: `setModule("communications", null)`
  - `external-experiences`: `setModule("portals", null)`
  - `media`: `setModule("media", null)`
- Aktiflik (`isItemActive`) ve etiket kontrollerinin `moduleSubView` ile senkronizasyonu.

### B. İş İletişimi Görünümü (`src/components/maven/views/onsite.tsx` içindeki `CommunicationsView`)
- `CommunicationsView`:
  - Seçili iş kitleleri ayrımı bildirimi (`workScopeNotice`): "Bu ekrandaki gönderimler yalnız seçili işin katılımcılarına, kayıt kategorilerine ve paydaşlarına iletilir. Firma geneli kurumsal kitleler için Genel İletişim alanını kullanın."
  - "Firma Genel İletişimine Geç" butonu (`btnOpenCompanyComms`): `setModule("company-communications")`.
  - Seçili işin hedef kitle filtreleri ve edisyon bazlı kampanya yönetimi.

### C. Dış Deneyimler ve Portallar Görünümü (`src/components/maven/views/portals.tsx` içindeki `PortalsView`)
- 5 sekmeden oluşan dış deneyim yönetim mimarisi:
  1. `tabPwa` (Genel Mobil Deneyim / Event App): PWA manifest ayarları, tema renkleri, çevrimdışı önbellekleme ve PWA kurulum linki.
  2. `tabAttendee` (Kişisel Katılımcı Portalı): `/portal/attendee` doğrudan bağlantı, dijital yaka kartı QR, bilet ve oturum programı önizlemesi.
  3. `tabB2b` (B2B Eşleşme Portalı): B2B ikili görüşme dış portalı bağlantısı, toplantı onayları ve masa planı yayını.
  4. `tabSponsor` (Sponsor & Partner Portalı): `/portal/sponsor` bağlantısı, sponsor token erişimi, hak teslimatları ve stant yerleşim görünümü.
  5. `tabClient` (Müşteri & Kurum Portalı): `/portal/client` bağlantısı, müşteri delege listesi, katılım kotaları ve mutabakat görünümü.
- Firma Vitrini İzolasyonu Bildirimi (`showcaseIsolationNotice`): "Firma B kurumsal vitrini ile seçili işin dış portalı birbirinden bağımsızdır. Kurumsal vitrin Firma Ayarları üzerinden yapılandırılır."
- Canlı Dış Yayın Akışı Paneli (`publishStatusCard`):
  - Program & Oturumlar Yayını (`PUBLISHED` / `DRAFT`)
  - Konuşmacı Profilleri Yayını (`PUBLISHED` / `DRAFT`)
  - Sponsor & Stant Haritası Yayını (`PUBLISHED` / `DRAFT`)
  - Başvuru & Kayıt Formu Yayını (`PUBLISHED` / `DRAFT`)
- `moduleSubView` desteği (`pwa`, `attendee`, `b2b`, `sponsor`, `client`).

### D. i18n Sözlükleri
- `src/i18n/_new/portals.tr.json` / `en.json`
- `src/i18n/_new/communication.tr.json` / `en.json`
- `bun run i18n:scan` ile sıfır hardcoded metin garantisi.

---

## 2. Test ve Doğrulama
- `tests-mini/work-communications-and-external-experiences.test.mjs` test paketi:
  - Dual Sidebar `communication_experience` rotaları ve alt görünümleri.
  - İş İletişimi kitle ayrımı ve Genel İletişim bağlantısı.
  - PortalsView 5 dış deneyim sekmesi ve dış bağlantı rotaları.
  - Firma vitrini izolasyon bildirimi.
  - Canlı dış yayın içerik denetimi.
  - i18n sözlük paritesi.
