# Şartname: 013 — Sponsor, Fuar, B2B ve Medya (Faz 8)

## 1. Amaç ve Kapsam

Bu şartname, `proje-hafizasi/12-PRODUCT-TRANSFORMATION-ROADMAP.md` belgesindeki **Faz 8: Sponsor, fuar, B2B ve medya** gereksinimlerini karşılar:
1. **Sponsorluk İş Akışı Sıralaması:** Sponsor kurum ilişkisinden başlayarak Paket/Anlaşma (`packages-agreements`), Hak/Kontenjan (`deliverables-entitlements`) ve Teslimat (`deliverables`) adımlarına sırayla ilerleyen sekmeli çalışma alanı.
2. **Fuar ve Stant Tahsisi:** Floor Studio stant tahsisinin sponsor hakları ve mekanla entegrasyonu; ticari kayıt Maven'da, geometri Floor Studio'da kalacak şekilde interaktif planla birleşimi.
3. **B2B Tek Kullanıcı Yolculuğu:** B2B eşleşme talepleri, karşılıklı kabul (onay/red) ve görüşme çizelgesi/takviminin tek birleşik akışta toplanması.
4. **Firma Marka Kitaplığı ve İşe Ait Medya Ayrımı:** Global marka kimliği/logoları ile işe özel medya varlıklarının ayrılması; modül ve dış içerik bağlantılarının gösterilmesi.
5. **Sponsor Dış Portalı İzolasyonu:** Sponsor dış portalının Firma B yönetim panelinden izole edilmiş bağımsız bir dış deneyim alanı olarak sunulması.

---

## 2. Kullanıcı Senaryoları ve Akışları

### Senaryo 1: Sponsor İlişkisinden Paket, Hak ve Teslimata Sıralı İlerleme
- **Kullanıcı:** Firma B Sponsorluk Yöneticisi
- **Akış:**
  1. Kullanıcı `Sponsor ve Fuar` grubundan `Sponsorlar` menüsüne tıklar.
  2. Açılan `SponsorshipView` ekranında Kanban boru hattında sponsorluk satış hunisini (Prospect -> Negotiation -> Contracted -> Active -> Completed) inceler ve aşamaları taşır.
  3. `Paketler & Anlaşmalar` sekmesine geçerek seviye (tier) ve paket tanımlarını, fiyat ve kontenjanları yönetir.
  4. `Haklar & Kontenjanlar` sekmesine geçerek sponsor hak havuzunu (20/14/2/4 dökümü: tanınan/kullanılan/ayrılmış/kalan) ve komite onay akışını görüntüler.
  5. `Teslimatlar` sekmesinde vaat edilen teslimat takvimini, kanıt URL'lerini ve onay durumlarını takip eder.
  6. `Stant Tahsisi` sekmesinde ticari stant birimlerini sözleşmeli sponsorlara tahsis eder.

### Senaryo 2: Floor Studio ve Stant Tahsisinin Sponsor Haklarıyla Bağlanması
- **Kullanıcı:** Fuar ve Mekan Operasyon Sorumlusu
- **Akış:**
  1. Kullanıcı `Stantlar / Floor Studio` menüsüne tıklar.
  2. `FloorsView` üzerinde fuar planı, stant geometrisi ve ticari tahsis durumlarını inceler.
  3. Ekran üzerinde sponsorluk anlaşması ve hak havuzu bağlantı bilgisini görür; stant tahsisinin ticari kimliğinin Maven'da, geometrisinin Floor Studio'da yönetildiği güvenceye alınır.

### Senaryo 3: B2B Eşleşme, Karşılıklı Kabul ve Görüşme Çizelgesi
- **Kullanıcı:** B2B Program Koordinatörü
- **Akış:**
  1. Kullanıcı `B2B` modülüne girdiğinde tek kullanıcı yolculuğu sunan sekmeli yapıyı görür:
     - `Talepler & Eşleşmeler`: B2B görüşme talepleri, katılımcı ve kurum havuzu.
     - `Karşılıklı Kabul`: Her iki tarafın onayını bekleyen eşleşmeler, onay/ret akışı.
     - `Görüşme Çizelgesi & Takvim`: Onaylanan görüşmelerin zaman dilimi, masa/lokasyon bilgisi ve ajandası.

### Senaryo 4: Firma Marka Kitaplığı ve İşe Özel Medya Ayrımı
- **Kullanıcı:** Medya ve İçerik Yöneticisi
- **Akış:**
  1. Kullanıcı `Medya` modülüne girdiğinde iki açık alan görür:
     - `İş Medyası`: Seçili işe ait fotoğraflar, oturum sunumları, yaka kartı şablonları, modül bağlantıları.
     - `Firma Marka Kitaplığı`: Firma B'nin global logoları, antetli şablonları ve basın kitleri.
  2. Her varlığın hangi modüle bağlı olduğu (`linkedType`) net olarak gösterilir.

### Senaryo 5: Sponsor Dış Portalı İzolasyonu
- **Kullanıcı:** Sponsor Temsilcisi / Firma B Yetkilisi
- **Akış:**
  1. Sponsorluk ekranında bağımsız dış portal linki ve erişim bilgilendirmesi sunulur.
  2. Firma B yönetim paneli menüsü ile sponsor dış portalı arayüzü birbirine karışmaz; sponsor dış portalı izole token (`/api/portal/sponsor`) ile çalışır.

---

## 3. Kabul Kriterleri (Acceptance Criteria)

- [ ] **AC-1 (Sponsor Sıralı Akış):** `SponsorshipView`, `sponsors` (Kanban Satış Hunisi), `packages` (Seviye ve Paketler), `entitlements` (Hak Havuzları & Komite Onayı), `deliverables` (Vaat Edilen Teslimatlar) ve `booths` (Stant Tahsisi) sekmelerine sahip olmalıdır.
- [ ] **AC-2 (moduleSubView Eşlemesi):** Dual Sidebar `sponsor_exhibition` grubunda yer alan `sponsors`, `packages-agreements`, `deliverables-entitlements`, `booths-floors`, `b2b` öğeleri doğru modül ve alt görünümlere yönlendirmeli ve aktif durumu yansıtmalıdır.
- [ ] **AC-3 (Stant & Floor Entegrasyonu):** `FloorsView` ve `SponsorshipView` stant alanında sponsor sözleşmesi ve hak havuzu bağlantısını, mekan/plan durumunu açıkça belirtmelidir.
- [ ] **AC-4 (B2B Tek Kullanıcı Yolculuğu):** `B2bView`, eşleşme talepleri (`requests`), karşılıklı kabul (`mutual`) ve görüşme çizelgesi (`timetable`) sekmeleriyle tek birleşik kullanıcı yolculuğu sunmalıdır.
- [ ] **AC-5 (Medya Ayrımı):** `MediaView`, iş medyası ile firma marka kitaplığını net bir sekme ve bilgilendirme ile ayırmalı; varlıkların modül bağlantılarını (`linkedType`) görünür kılmalıdır.
- [ ] **AC-6 (Sponsor Dış Portal İzolasyonu):** Sponsorluk ekranında Firma B yönetiminden bağımsız sponsor dış portalı erişim alanı ve bilgilendirmesi yer almalıdır.
- [ ] **AC-7 (Sözlük & i18n):** Tüm yeni metinler `sponsorship.*.json`, `b2b.*.json`, `media.*.json`, `floors.*.json` içinde tanımlanmalı, `i18n:scan` 0 ihlal vermelidir.
- [ ] **AC-8 (Test Güvencesi):** `tests-mini/sponsorship-expo-b2b-and-media.test.mjs` test paketi yazılmalı ve tüm kalite kapıları başarıyla geçmelidir.
