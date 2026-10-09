# Şartname: 009 — Yeni İş Başlatma (Wizard) ve İlk Kurulum Akışı

**Faz:** Faz 4 — Yeni İş Wizard'ı ve İlk Kurulum  
**Kaynak:** `proje-hafizasi/12-PRODUCT-TRANSFORMATION-ROADMAP.md` (Bölüm 3 ve Faz 4)  
**Tarih:** 9 Ekim 2026  
**Durum:** Taslak / Uygulama Öncesi

---

## 1. Amaç ve İş Hedefi

Firma B çalışma alanında yeni bir iş başlatma deneyimi, karmaşık ve teknik formlar yerine; kullanıcıyı işin niteliğine göre yönlendiren, şablon tabanlı, koşullu ve 8 adımlı bir **Yeni İş Sihirbazı (New Work Wizard)** üzerinden yürütülmelidir. İş oluşturulduğunda kullanıcı doğrudan karar odaklı **İş Özeti (Cockpit)** ekranına ve **Kademeli Kurulum Kontrol Listesi**ne aktarılmalıdır.

---

## 2. Kullanıcı Senaryoları (User Scenarios)

### Senaryo 1: Kongre / Etkinlik Şablonu ile Yeni İş Başlatma
- **Kullanıcı:** Firma B etkinlik operasyon yöneticisi.
- **Akış:** İşler ekranında "Yeni İş Başlat" butonuna tıklar.
- **Adımlar:**
  1. **İş Grubu:** "Etkinlik ve Organizasyon" seçer.
  2. **İş Türü & Şablon:** "Bilimsel Kongre" şablonunu seçer.
  3. **Temel Bilgiler:** Ad ("Uluslararası Tıp Zirvesi 2027"), Başlama ve Bitiş tarihleri, Şehir, Mekân girer.
  4. **Müşteri & Paydaş:** "Müşteri İşi" seçer, portföyden düzenleyen derneği bağlar veya rol adı belirler.
  5. **İş Profili:** Kitle ölçeği (Grup), Hizmet seviyesi (VIP/Standart), Erişim tipi (Genel).
  6. **Önerilen Modüller:** Şablonun önerdiği modüller (Kayıt, Bilimsel, Program, Sponsorluk, Saha, Konaklama) listelenir; kullanıcı dilediğini açıp kapatır.
  7. **İş Sahibi & Ekip:** Sorumlu yönetici ve departman ("Kongre Departmanı") seçilir.
  8. **Gözden Geçirme:** Özet kart incelenir ve "Taslak Olarak Başlat"a tıklanır.
- **Beklenen Sonuç:** İş veritabanında oluşturulur, aktif edisyon yapılır ve kullanıcı İş Özeti kokpiti ile Kurulum Kontrol Listesi'ne yönlendirilir.

### Senaryo 2: Müşteri Seyahati Şablonu ile İş Başlatma
- **Kullanıcı:** Firma B seyahat koordinatörü.
- **Akış:** "Seyahat ve Müşteri İşi" grubunu ve "Grup Seyahati" şablonunu seçer.
- **Beklenen Davranış:** Şablon bilimsel bildiri gibi alakasız modülleri önermez; otel konaklama, transfer ve katılımcı listesi modüllerini önerir.

### Senaryo 3: Geçersiz Tarih Girişi ve Doğrulama
- **Kullanıcı:** Başlama tarihini boş bırakır veya bitiş tarihini başlama tarihinden önce seçer.
- **Beklenen Davranış:** Sihirbaz bir sonraki adıma geçişi engeller, satır içi hata mesajı gösterir (`aria-invalid="true"` ve `role="alert"`).

---

## 3. Kabul Kriterleri (Acceptance Criteria)

- [ ] **AC-1:** Sihirbaz 8 mantıksal ve koşullu adımdan oluşmalıdır (İş Grubu, Tür/Şablon, Bilgiler, Müşteri/Paydaş, Profil, Modüller, Ekip, Gözden Geçirme).
- [ ] **AC-2:** Başlangıç şablonları en az 6 ana türü kapsamalıdır (Bilimsel Kongre, Ticari Fuar, Kurumsal Zirve, Düğün/Özel Davet, Grup Seyahati, Özel Proje).
- [ ] **AC-3:** Başlama tarihi zorunlu olmalı ve bitiş tarihi başlama tarihinden önce girildiğinde adım ilerletilmemelidir.
- [ ] **AC-4:** Müşteri İşi seçildiğinde müşteri kurumu veya yeni müşteri adı ile işteki rol adı belirtilebilmelidir.
- [ ] **AC-5:** Şablon seçildiğinde ilgili modüller otomatik önerilmeli ve kullanıcıya açıklayıcı işlevleriyle sunulmalıdır.
- [ ] **AC-6:** İş oluşturulduğunda kullanıcı doğrudan seçili işin İş Özeti (Cockpit) ekranına yönlendirilmelidir.
- [ ] **AC-7:** Mevcut E2E testleri ve erişilebilirlik id'leri (`editions-wizard-start`, `editions-wizard-end`, `editions-wizard-city`, `editions-wizard-date-error`) tam uyumlulukla korunmalıdır.
- [ ] **AC-8:** Tüm metinler i18n sözlüklerinde tanımlanmalı, hardcoded scan ihlali yaratmamalıdır.
