# Uygulama Planı: 009 — Yeni İş Başlatma (Wizard) ve İlk Kurulum Akışı

**Faz:** Faz 4 — Yeni İş Wizard'ı ve İlk Kurulum  
**Tarih:** 9 Ekim 2026  
**Durum:** Taslak / Uygulama Öncesi

---

## 1. Mimari Tasarım

Yeni İş akışı, kullanıcıyı 8 adımlı koşullu bir sihirbazla karşılar:
- **Adım 1:** İş Grubu (`EVENT_ORG`, `TRAVEL_CLIENT`, `SPECIAL_WORK`)
- **Adım 2:** İş Türü & Şablon (Kongre, Fuar, Kurumsal, Düğün/Gala, Seyahat, Özel Proje)
- **Adım 3:** İş Bilgileri (Ad, Seri/Kod, Başlama/Bitiş Tarihi, Şehir, Mekân, Saat Dilimi)
- **Adım 4:** Müşteri ve Paydaş Seçimi (Kendi İşi vs Müşteri İşi; Müşteri Adı ve Rol Adı)
- **Adım 5:** İş Profili Boyutları (Bireysel/Grup, Standart/VIP, Genel/Özel)
- **Adım 6:** Yetenek ve Modül Seçimi (Şablon önerisi + kullanıcı seçimleri)
- **Adım 7:** İş Sahibi, Departman ve Ekip Ataması
- **Adım 8:** Gözden Geçirme ve Taslak Başlatma

İş kaydedildiğinde:
1. Seri (`EventSeries`) ve Edisyon (`EventEdition`) kayıtları oluşturulur.
2. Seçilen modüller `EventCapability` olarak eklenir.
3. `setCurrentEdition(edition.id)` yapılır ve kullanıcı `module: "dashboard"` ile **İş Özeti (Cockpit)** ve Kurulum Kontrol Listesi'ne aktarılır.

---

## 2. Değişecek ve Eklenecek Dosyalar

1. `src/components/maven/forms/new-work-wizard.tsx`:
   - 8 adımlı yeni sihirbaz bileşeni.
   - Tarih validasyonları, şablon eşlemeleri, rol ve profil seçimleri.
   - Mevcut Playwright test sözleşmeleri ile tam uyumlu id ve aria öznitelikleri.
2. `src/components/maven/views/editions.tsx`:
   - Eski inline diyalog yerine `NewWorkWizard` kullanımına geçiş.
3. `src/components/maven/views/jobs-view.tsx`:
   - "Yeni İş Başlat" butonunun `openEditionWizard()` üzerinden `NewWorkWizard`'ı tetiklemesi.
4. `src/i18n/_new/editions.tr.json` ve `editions.en.json`:
   - Sihirbaz adımları, şablonlar ve etiketler için dil anahtarları.
5. `tests-mini/new-work-wizard-and-setup.test.mjs`:
   - Şablon önerileri, tarih validasyonları ve 8 adımlı sihirbaz veri sözleşmesi testleri.
