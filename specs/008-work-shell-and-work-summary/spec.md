# Şartname: 008 — İş Shell'i ve İş Özeti (Cockpit)

**Faz:** Faz 3 — İş Shell'i ve İş Özeti  
**Kaynak:** `proje-hafizasi/12-PRODUCT-TRANSFORMATION-ROADMAP.md` (Bölüm 2.3 & 2.4 ve Faz 3)  
**Tarih:** 9 Ekim 2026  
**Durum:** Taslak / Uygulama Öncesi

---

## 1. Amaç ve İş Hedefi

Firma B çalışma alanında bir iş (`WORK`) seçildiğinde, kullanıcıyı ham modül tablosu veya karmaşık genel sayaçlar yerine, karar ve sıradaki eylem odaklı bir **İş Özeti (Cockpit)** ekranı karşılamalıdır. Aynı zamanda sol navigasyon, global ikon şeridini korurken ikinci menüyü 9 sabit iş grubuna dönüştürmeli, iş değiştirme ve yaşam döngüsü bağlamını net bir hiyerarşide sunmalıdır.

---

## 2. Kullanıcı Senaryoları (User Scenarios)

### Senaryo 1: İşe Giriş ve Karar Odaklı İş Özeti
- **Kullanıcı:** Firma B operasyon yöneticisi veya etkinlik koordinatörü.
- **Akış:** İşler listesinden veya üst seçiciden "No-Dig Turkey 2026" işini seçer ve açar.
- **Beklenen Davranış:** 
  1. Sol menüde global ikon şeridi kalır, ikinci menü 9 sabit iş grubuna (`work_management`..`work_settings`) geçer.
  2. Ana içerikte İş Özeti açılır:
     - Üstte iş kimliği, türü (Kongre), durumu (`ONSITE`), tarih/mekânı, müşterisi ve sorumlu ekibi.
     - Karar ve eylem bekleyen konular (onay bekleyen kayıtlar, ikinci onay bekleyen ödemeler, geciken görevler).
     - Yalnız bu işte etkin modüllerin durum kartları (Kayıt, Program, Sponsor, Saha, Konaklama, Portallar).
     - Sıradaki görevler ve son hareketler.
     - Dış deneyimler durumu ve canlı portal önizleme bağlantısı.

### Senaryo 2: Kurulum Eksikliği ve Blokaj Yönlendirmesi
- **Kullanıcı:** Yeni oluşturulmuş veya hazırlık aşamasındaki bir işin sahibi.
- **Akış:** İş Özeti'nde kurulum durumu kartındaki blokaja ("Banka hesabı tanımlanmadı", "Kayıt formu yayınlanmadı") tıklar.
- **Beklenen Davranış:** İlgili modül ekranına (`finance`, `forms`, `settings`) doğrudan yönlendirilir; geri döndüğünde aynı iş bağlamında kalır.

### Senaryo 3: Tamamlanmış ve Arşivlenmiş İş Görünümü
- **Kullanıcı:** Finans yöneticisi veya arşiv denetçisi.
- **Akış:** `status: "ARCHIVED"` veya `POST_EVENT` olan bir işi açar.
- **Beklenen Davranış:** Canlı sayaçlar ve aksiyon butonları yerine "Bu iş operasyonel olarak tamamlanmış ve arşivlenmiştir" kapanış/mutabakat özeti gösterilir.

---

## 3. Kabul Kriterleri (Acceptance Criteria)

- [ ] **AC-1:** Sol ikinci menüde iş açıkken iş başlığı, durumu ve "İşler Listesine Dön" butonu ile 9 sabit iş grubu gösterilmelidir.
- [ ] **AC-2:** İş Özeti başlığında iş adı, iş türü, profili, yaşam döngüsü durumu, tarih aralığı, lokasyon ve müşteri bilgisi yer almalıdır.
- [ ] **AC-3:** Bekleyen Kararlar ve Onaylar paneli, kayıt başvurularını, manuel ödeme onaylarını ve bekleyen iş kararlarını kaynak modülleriyle listelemelidir.
- [ ] **AC-4:** Sıradaki Görevler paneli, sorumlusu ve son tarihiyle yaklaşan görevleri öncelik rengiyle göstermeli ve `operations` modülüne bağlanmalıdır.
- [ ] **AC-5:** Açık Modüller Durumu paneli, sadece bu işte açık yeteneklerin (Kayıt, Sponsor, Program, Saha, Konaklama, Dış Portal) özetini sunmalı; kapalı modülleri göstermemelidir.
- [ ] **AC-6:** Dış Deneyimler bölümünde katılımcı PWA ve vitrin portalının yayında olma durumu ile tek tıkla önizleme bağlantısı bulunmalıdır.
- [ ] **AC-7:** Arşivlenmiş veya tamamlanmış işlerde kapanış ve mutabakat bilgileri gösterilmeli, canlı operasyon formları gizlenmelidir.
- [ ] **AC-8:** Tüm metinler i18n uyumlu olmalı ve hardcoded scan ihlali yaratmamalıdır.
