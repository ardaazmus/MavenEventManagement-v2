# Mimari ve Teknik Plan: 007 — Firma B Global Shell ve İş Portföyü (Faz 2)

**Referans Belge:** `proje-hafizasi/12-PRODUCT-TRANSFORMATION-ROADMAP.md`  
**Amaç:** Firma B için çift sol menü mimarisini ve "İşler ve Organizasyonlar" ana ekranını geliştirmek.

---

## 1. Bileşen ve Modül Mimarisi

### A. Çift Sol Menü Bileşeni (`src/components/maven/navigation/dual-sidebar.tsx`)
- **Global Rail (Sol İkon Şeridi - 56px):**
  - Firma B logosu / baş harfi ("M").
  - 5 Global Buton:
    1. `Briefcase` -> `jobs` ("İşler ve Organizasyonlar")
    2. `Contact` -> `portfolio` ("Firma Portföyü")
    3. `Megaphone` -> `comms` ("Genel İletişim")
    4. `BarChart3` -> `reports` ("Firma Raporları")
    5. `Settings` -> `settings` ("Firma Ayarları")
  - Alt Butonlar: `HelpCircle` (Yardım), Kullanıcı Avatarı.
- **Contextual Panel (İkinci Menü - 220px):**
  - Seçili global alana ait menü (`GLOBAL_NAV_AREAS`).
  - Bir iş açıkken: İş kimliği başlığı ve işin 9 grubu (`WORK_NAV_GROUPS`).
  - Global ve iş modülleri arasında pürüzsüz geçiş.

### B. İşler ve Organizasyonlar Görünümü (`src/components/maven/views/jobs-view.tsx`)
- **Filtreler ve Arama:**
  - Metin araması (iş adı, şehir, seri veya müşteri adı).
  - Yaşam döngüsü durum sekmeleri (Tümü, Aktif, Planlanan, Dikkat Gereken, Tamamlanan, Arşiv).
  - Görünüm modu seçici (Grid / Liste).
- **İş Kartı Bileşeni (`JobCard`):**
  - Başlık, tarih aralığı, şehir/mekân, iş türü (Kongre, Fuar, Kurumsal vb.) rozeti.
  - Yaşam döngüsü durumu etiketi (`StatusBadge`).
  - Müşteri kurumu / düzenleyen adı.
  - Açık modül sayısı ve temel operasyon sayaçları.
  - Butonlar: "İşi Aç" -> `setModule("dashboard")` ve iş seçimi; "Kuruluma Devam Et" -> `setModule("editions")`; "Ayarlar" -> `setModule("settings")`.
- **Dikkat Gerekenler Şeridi:**
  - Yayın engeli veya eksik kurulum adımı bulunan işleri uyarı kutusuyla listeleme.
- **Boş Durum:**
  - Henüz iş yoksa "İlk İşinizi Başlatın" ve yeni iş sihirbazını açan belirgin buton.

### C. Shell Entegrasyonu (`src/components/maven/shell.tsx`)
- Masaüstünde `DualSidebar` kullanımı.
- Mobilde drawer / sheet içinde aynı çift menü akışı.
- Üst çubukta kompakt arama, bildirim, dil, tema ve profil barındırılması.

---

## 2. Doğrulama ve Test Planı
- `tests-mini/global-shell-and-jobs-view.test.mjs`:
  - Çift sol menü alanları ve öğe doğrulaması.
  - `jobs-view` filtreleme, yaşam döngüsü gruplaması ve iş kartı sözleşmesi.
  - Arama ve durum filtreleme mantığı.
