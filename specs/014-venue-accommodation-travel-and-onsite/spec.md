# Şartname: 014 — Mekân, Konaklama, Seyahat ve Saha (Faz 9)

## 1. Amaç ve Kapsam

Bu şartname, `proje-hafizasi/12-PRODUCT-TRANSFORMATION-ROADMAP.md` belgesindeki **Faz 9: Mekân, konaklama, seyahat ve saha** gereksinimlerini karşılar:
1. **İş Mekânı ve Saha Operasyonu Entegrasyonu:** İş mekânının (`venues-spaces` / `floors`), İş Bilgileri (`editions`) ve Saha Operasyonu (`onsite`) ile doğrudan bağlanması; kapı/salon geçişleri ve alan kontrolünün iş mekânı kimliğiyle ilişkilendirilmesi.
2. **Konaklama Sıralı Akışı:** Konaklama talebi, otel blokları/stok (`hotels-blocks`), oda rezervasyonları (`reservations`), rooming listesi konsolu (`rooming`) ve yolcu/misafir hiyerarşisinin sıralı bir kullanıcı yolculuğunda sunulması.
3. **Seyahat, Transfer ve Ek Hizmetler:** Uçuş, transfer, havalimanı karşılama ve ek hizmetlerin talep, sorumlu, teyit ve ifa aşamalarında gösterilmesi (`travel-transfers` ve `extra-services`).
4. **Saha Operasyonu Düzenlemesi:** Canlı check-in, kapı tarama, kiosk self-servis ve alan içi doluluk takibinin anlık etkinlik günü hızlı görev modunda düzenlenmesi.
5. **Yaka Kartları ve Sertifikaların Dış Deneyime Bağlanması:** Yaka kartı basım kuyruğu (`badges-print`) ve sertifika üretiminin (`certificates-docs`) iş katılımı ve katılımcı dış portalıyla bağlanması.

---

## 2. Kullanıcı Senaryoları ve Akışları

### Senaryo 1: İş Mekânı ve Saha Operasyonunun Bağlanması
- **Kullanıcı:** Saha ve Etkinlik Operasyon Yöneticisi
- **Akış:**
  1. Kullanıcı `Mekân ve Saha` grubundan `Mekânlar ve Alanlar` veya `Saha Operasyonu` menüsüne tıklar.
  2. Saha Operasyonu (`onsite`) üzerinde seçili işin fiziki mekânı, salonları ve kapı listesi (Kapı A, Kapı B, Ana Giriş vb.) net olarak görüntülenir.
  3. Mekân planına ve iş bilgilerine tek tıkla geçiş butonları sağlanır.

### Senaryo 2: Konaklama Talepleri, Blok Stokları ve Rezervasyon Akışı
- **Kullanıcı:** Konaklama Koordinatörü
- **Akış:**
  1. Kullanıcı `Konaklama ve Hizmetler` grubundan `Konaklama` menüsüne tıklar.
  2. `AccommodationView` üzerinde sekmeli akış sunulur:
     - `Oteller ve Bloklar`: Kontratlı oteller, oda tipleri, gecelik stok ve kontenjanlar.
     - `Rezervasyonlar`: Katılımcı ve misafir bazlı oda rezervasyonları, teyit bekleyenler, no-show takibi.
     - `Rooming Konsolu`: Toplu rooming listesi aktarımı, attrition ve oda arkadaşı eşleştirme.
     - `Seyahat ve Transfer`: Uçuş, karşılama ve araç transfer takibi.
  3. `DualSidebar`'dan `Seyahat ve Transfer` tıklandığında doğrudan transfer sekmesi aktifleşir (`moduleSubView === "transfers"`).

### Senaryo 3: Seyahat ve Transfer İfa Takibi
- **Kullanıcı:** Ulaşım ve Transfer Sorumlusu
- **Akış:**
  1. Kullanıcı `Seyahat ve Transfer` sekmesine geçer.
  2. Uçuş kodları, varış/kalkış saatleri, havalimanı, araç tipi, plaka, şoför ve yolcu listesini inceler.
  3. Durum yaşam döngüsü: `Talep Alındı` -> `Araç Atandı` -> `Teyit Edildi` -> `Karşılandı / Tamamlandı`.

### Senaryo 4: Saha Operasyonu ve Anlık Görev Görünümü
- **Kullanıcı:** Kapı Görevlisi / Onsite Koordinatörü
- **Akış:**
  1. `Saha Operasyonu` ekranında hızlı masa tarama konsolu, kiosk terminali, alan içi anlık kişi sayısı ve CME oturum yoklama konsolu sekmeli olarak ayrılır.
  2. Görevli, kapı seçip QR/kod okuttuğunda anında sesli/görsel onay veya ret uyarısı alır.

### Senaryo 5: Yaka Kartı ve Belgelerin Katılımcı Dış Alanıyla Bağlantısı
- **Kullanıcı:** Katılımcı İlişkileri / Danışma Görevlisi
- **Akış:**
  1. `Yaka Kartları ve Baskı` ekranında basım kuyruğu, anti-fraud tekrar basım şifresi ve termal ZPL baskı emirleri yönetilir.
  2. Yaka kartı durumunun katılım onayından bağımsız bir operasyonel varlık olduğu ve katılımcının kendi mobil dış alanından dijital yaka kartına erişebildiği bilgisi sunulur.
  3. `Belgeler ve Sertifikalar` ekranında üretilen sertifikaların katılımcı portalına otomatik yansıdığı bildirimle gösterilir.

---

## 3. Kabul Kriterleri (Acceptance Criteria)

- [ ] **AC-1 (Dual Sidebar Mekân & Saha Grubu):** `venue_onsite` grubunda `venues-spaces` (`floors`), `onsite-operations` (`onsite`), `badges-print` (`badges`), `certificates-docs` (`certificates`) öğeleri doğru modüllere ve alt görünümlere yönlendirmeli, aktiflik durumları senkronize olmalıdır.
- [ ] **AC-2 (Dual Sidebar Konaklama & Hizmetler Grubu):** `accommodation_services` grubunda `accommodation` (`accommodation`, `hotels`), `travel-transfers` (`accommodation`, `transfers`), `extra-services` (`finance`) yönlendirmeleri `moduleSubView` ile bağlanmalıdır.
- [ ] **AC-3 (Konaklama Sıralı Sekmeli Yapı):** `AccommodationView`, `hotels` (Oteller & Bloklar), `reservations` (Rezervasyonlar), `rooming` (Rooming Listesi Konsolu) ve `transfers` (Seyahat & Transfer) sekmelerine sahip olmalı; `moduleSubView` ile senkronize çalışmalıdır.
- [ ] **AC-4 (Seyahat & Transfer Takip Konsolu):** Transfer sekmesinde uçuş, karşılama, araç/şoför ataması ve durum adımları (`REQUESTED`, `ASSIGNED`, `CONFIRMED`, `COMPLETED`) sunulmalıdır.
- [ ] **AC-5 (Saha Operasyonu Hızlı Görev ve Mekân Bağı):** `OnsiteView`, işin seçili mekân/alan bilgisini göstermeli; `desk` (Hızlı Tarama), `kiosk` (Kiosk Terminali), `occupancy` (Alan Yoğunluğu), `cme` (Oturum CME) sekmelerini sunmalıdır.
- [ ] **AC-6 (Yaka Kartı ve Belge Dış Portal Bağı):** `BadgeQueueView` ve `CertificatesView`, katılımcı dış portalı (`/portal/attendee`) erişim ve hak bağlantı bildirimlerine sahip olmalıdır.
- [ ] **AC-7 (i18n ve Sıfır Hardcoded Metin):** Tüm yeni metinler TR ve EN sözlük dosyalarında tanımlanmalı, `bun run i18n:scan` 0 ihlal vermelidir.
- [ ] **AC-8 (Sözleşme Testleri):** `tests-mini/venue-accommodation-travel-and-onsite.test.mjs` test paketi yazılarak tüm kriterler doğrulanmalıdır.
