# Uygulama Planı: 013 — Sponsor, Fuar, B2B ve Medya (Faz 8)

## 1. Mimari Tasarım ve Değişiklikler

### A. Dual Sidebar Navigasyonu (`dual-sidebar.tsx`)
- `sponsor_exhibition` grubu elemanları:
  - `sponsors` -> `setModule("sponsorship", "sponsors")`
  - `packages-agreements` -> `setModule("sponsorship", "packages")`
  - `deliverables-entitlements` -> `setModule("sponsorship", "deliverables")`
  - `booths-floors` -> `setModule("floors", null)`
  - `b2b` -> `setModule("b2b", null)`
- `communication_experience` grubu elemanı:
  - `media` -> `setModule("media", null)`
- Aktif öğe durumunun `module` ve `moduleSubView` ile tam senkronizasyonu.

### B. Sponsorluk Çalışma Alanı (`SponsorshipView` in `sponsorship.tsx`)
- `Tabs` yapısı ile 5 ana sekme:
  1. `sponsors`: Satış hunisi ve Kanban boru hattı (`SponsorshipKanban`).
  2. `packages`: Seviye (Tier) ve Paket tanımları, kapasite ve fiyat yönetimi.
  3. `entitlements`: Hak havuzları (Entitlement Motoru 20/14/2/4 dökümü), komite onay akışı, misafir ekleme.
  4. `deliverables`: Vaat edilen teslimatlar takvimi, kanıt URL ve onay durumu.
  5. `booths`: Ticari stant tahsisi, Floor Studio bağlantı rozeti.
- `moduleSubView` senkronizasyon effect'i (`sponsors`, `packages`, `entitlements`, `deliverables`, `booths`).
- İzole Sponsor Dış Portalı Bilgilendirme ve Hızlı Erişim Banner'ı:
  - Firma B yönetici paneli ile dış portalın ayrılığı vurgulanır (`external-experiences` / `/api/portal/sponsor`).

### C. Fuar Alanı ve Stantlar (`FloorsView` in `floors.tsx`)
- Sponsorluk hakları ve mekan bağlantı bilgilendirme bildirimi.
- Stantların ticari kimliğinin Maven'da, geometrisinin Floor Studio'da yönetildiği güvencesi.

### D. B2B Tek Kullanıcı Yolculuğu (`B2bView` in `b2b.tsx`)
- `Tabs` yapısı ile 3 aşamalı kullanıcı yolculuğu:
  1. `requests`: Eşleşme talepleri ve katılımcı havuzu.
  2. `mutual`: Karşılıklı kabul bekleyen görüşmeler (onay/red akışı).
  3. `timetable`: Kesinleşen görüşme çizelgesi, masa/lokasyon ve takvim görünümü.
- Mobil uygulama önizleme/simülasyon yeteneğinin korunması.

### E. Medya Modülü (`MediaView` in `media.tsx`)
- İki sekmeli ayrım:
  1. `work`: İşe Ait Medya Arşivi (edisyon izole klasörler, fotoğraflar, sunumlar, bağlı varlık tipi `linkedType`).
  2. `brand`: Firma Marka Kitaplığı (global logolar, antetli şablonlar, basın kitleri).
- Modül ve dış içerik bağlantı rozetleri.

### F. Çoklu Dil (i18n)
- `sponsorship.tr.json` / `en.json`, `b2b.tr.json` / `en.json`, `media.tr.json` / `en.json`, `floors.tr.json` / `en.json` dosyalarına tüm yeni sekmeler, bildirimler ve butonlar için anahtarlar eklenecek.

---

## 2. Test ve Doğrulama Stratejisi
- `tests-mini/sponsorship-expo-b2b-and-media.test.mjs` karakterizasyon test paketi yazılacak.
- Kalite kapıları çalıştırılacak:
  - `bun run typecheck`
  - `bun run lint`
  - `bun run i18n:scan`
  - `bun run lint:arch`
  - `bun run test:unit`
  - `bun run test:smoke`
  - `node scripts/quality-report.mjs`
