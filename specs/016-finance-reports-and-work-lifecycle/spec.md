# Şartname: 016 — Finans, Raporlar ve İş Yaşam Döngüsü (Faz 11)

## 1. Amaç ve Kapsam

Bu şartname, `proje-hafizasi/12-PRODUCT-TRANSFORMATION-ROADMAP.md` belgesindeki **Faz 11: Finans, raporlar ve iş yaşam döngüsü** gereksinimlerini karşılar:
1. **Finansal Görünümlerin Ayrılması:** Sipariş, ödeme, iade ve ek hizmet gibi operasyonel parasal hareketler (`finance` / Finans & Tahsilat) ile defter dökümleri, gelir, gider, bütçe kırılımı ve mutabakat raporlarının (`accounting` / Muhasebe & Mutabakat) birbirinden bağımsız kullanıcı görünümlerine ayrılması.
2. **İş Raporları ve Firma Raporları Kapsamının Düzenlenmesi:**
   - Seçili iş bağlamındaki İş Raporları (`work_reports` grubu: Finans ve Bütçe, Kayıt ve Katılım, Sponsor ve ROI) ile,
   - Firma B global düzeyindeki Firma Raporları (`reports` global alanı: Portföy Büyüme, İş Portföyü Karşılaştırması, Operasyon Metrikleri, Konsolide Finans, İletişim Başarısı, Dışa Aktarımlar) kapsamının net biçimde ayrılması.
3. **Raporlardan Kaynak İş ve Modüllere Dönüş:** Firma raporları ve iş raporlarından ilgili kaynağa (iş özeti, siparişler, katılımcılar, sponsorlar, operasyon) doğrudan geri dönüş ve derin bağlantı sağlanması.
4. **5 Aşamalı İş Yaşam Döngüsünün Tüm İş Türlerine Uyarlanması:** `DRAFT` (Taslak) → `PLANNING` (Planlanan) → `ACTIVE` (Aktif) → `COMPLETED` (Tamamlanan) → `ARCHIVED` (Arşiv) makro yaşam döngüsünün konferans, fuar, kurumsal, sosyal ve seyahat dahil tüm iş türlerinde tutarlı biçimde uygulanması.

---

## 2. Kullanıcı Senaryoları ve Akışları

### Senaryo 1: Operasyonel Finans vs Kurumsal Muhasebe Ayrımı
- **Kullanıcı:** Kayıt & Finans Sorumlusu veya Muhasebe Uzmanı
- **Akış:**
  1. Kullanıcı `Konaklama ve Hizmetler` altındaki `Ek Hizmetler / Finans` veya sipariş akışından `Finans & Tahsilat` ekranına girer.
  2. Bu ekranda yalnızca operasyonel sipariş satırları, katılımcı/kurum ödemeleri, >50.000 TL SoD çift onaylı manuel tahsilatlar, iade talepleri ve ek hizmet kataloğu yer alır.
  3. Genel defter, gelir/gider fişleri veya mutabakat incelemek istediğinde, üst bildirim veya menü üzerinden doğrudan `Muhasebe & Mutabakat` ekranına geçer.
  4. `Muhasebe` ekranında ise defter, gelirler, giderler, bütçe gerçekleşme kırılımı ve kapanış mutabakatı yönetilir; buradan tek tıkla operasyonel siparişlere geri dönülebilir.

### Senaryo 2: Firma Raporları Panosu ve İş Portföyü Karşılaştırması
- **Kullanıcı:** Firma Yöneticisi / Finans Direktörü
- **Akış:**
  1. Kullanıcı sol dar şeritteki 4. global ikon olan `Firma Raporları` (`reports`) alanına tıklar.
  2. Firma genelindeki 6 rapor alanını görür: Portföy, İş Portföyü, Operasyon, Finans, İletişim, Dışa Aktarımlar.
  3. `İş Portföyü` sekmesinde tüm işlerin tarih, durum, katılımcı sayısı, bütçe ve gerçekleşen finansal kârlılık tablosunu inceler.
  4. Tablodaki herhangi bir işin yanındaki "İş Özetini Aç", "İş Finansını Aç" veya "Katılımcıları Aç" butonuna basarak doğrudan o işin bağlamına geçiş yapar.

### Senaryo 3: İş Raporları Gezinimi ve Kaynak Modüle Dönüş
- **Kullanıcı:** Proje Yöneticisi
- **Akış:**
  1. Bir iş açıkken ikinci menüdeki `İş Raporları` grubundan `Kayıt ve Katılım İstatistikleri`ne tıklar.
  2. Katılım oranlarını ve kontenjan analizlerini inceler; rapordan tek tıkla `Katılımcı Listesi`ne veya `İş Özeti`ne geri döner.
  3. `Sponsor ve ROI Raporu`na geçtiğinde teslimat başarı oranlarını görür; tek tıkla `Sponsorlar` modülüne döner.

### Senaryo 4: 5 Kademeli Yaşam Döngüsü ve İş Kapanışı
- **Kullanıcı:** Operasyon Yöneticisi
- **Akış:**
  1. İşler listesinde işler 5 makro aşamaya göre filtrelenebilir: Taslak, Planlanan, Aktif, Tamamlanan, Arşiv.
  2. İş Özeti ekranında işin hangi makro aşamada olduğu ve sıradaki aşamaya geçiş adımı görüntülenir.
  3. Etkinlik bitiminde iş `COMPLETED` (Tamamlanan / Mutabakat) aşamasına geçer.
  4. `Muhasebe` mutabakat sekmesinde açık siparişler, tahsil edilmemiş alacaklar ve bekleyen gider fişleri denetlenir. Mutabakat tamamlandığında iş `ARCHIVED` durumuna alınarak arşivlenir.

---

## 3. Kabul Kriterleri (Acceptance Criteria)

- [ ] **AC-1 (Finans ve Muhasebe Görünüm Ayrımı):** `FinanceView` operasyonel sipariş/ödeme/iade/ek hizmet odaklı olmalı; `AccountingView` ise defter/gelir/gider/kırılım/mutabakat odaklı olmalı ve her iki ekran arasında karşılıklı geçiş bağlantıları bulunmalıdır.
- [ ] **AC-2 (Firma Raporları Global Görünümü):** Global `reports` alanı için `CompanyReportsView` bileşeni oluşturulmalı; Portföy, İş Portföyü, Operasyon, Finans, İletişim ve Dışa Aktarımlar olmak üzere 6 kurumsal rapor sekmesini sunmalıdır.
- [ ] **AC-3 (Raporlardan Kaynak İşe Dönüş):** Firma raporlarındaki iş satırlarından ve kartlarından ilgili işin İş Özetine, Finansına veya Katılımcılarına doğrudan geçiş butonları bulunmalıdır.
- [ ] **AC-4 (İş Raporları Menü Eşlemesi):** Dual sidebar `work_reports` grubundaki `work-finance-reports`, `work-reg-reports`, `work-sponsor-reports` öğeleri doğru modüllere ve alt görünümlere yönlendirilmeli ve aktiflik durumları senkronize edilmelidir.
- [ ] **AC-5 (5 Aşamalı Yaşam Döngüsü):** `DRAFT`, `PLANNING`, `ACTIVE`, `COMPLETED`, `ARCHIVED` makro yaşam döngüsü `product-taxonomy.ts`, `jobs-view.tsx` ve `work-summary-view.tsx` üzerinde tam uyarlanmalıdır.
- [ ] **AC-6 (i18n ve Sıfır Hardcoded Metin):** Eklenen tüm rapor, finans ve yaşam döngüsü metinleri TR ve EN sözlüklerinde eksiksiz tanımlanmalı; `bun run i18n:scan` 0 ihlal ile geçmelidir.
- [ ] **AC-7 (Karakterizasyon Testi & Kalite Kapıları):** `tests-mini/finance-reports-and-work-lifecycle.test.mjs` testi oluşturulup `package.json`'a eklenmeli; `typecheck`, `lint`, `lint:arch` ve kalite raporu başarıyla tamamlanmalıdır.
