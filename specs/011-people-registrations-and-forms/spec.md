# Şartname: 011 — Kişiler, Kayıt ve Formlar (Faz 6)

## 1. Amaç ve Kapsam

Bu şartname, `12-PRODUCT-TRANSFORMATION-ROADMAP.md` belgesindeki **Faz 6 — Kişiler, kayıt ve formlar** gereksinimlerini hayata geçirmeyi hedefler:
1. İşteki kişiler, kurumlar, katılımcı, kategori/hak ve form ekranlarını iş bağlamı altında tek bir mantıksal grupta (`Kişiler ve Kayıt`) toplamak.
2. Form tasarımı, yayın durumu, yanıt kutusu (inbox) ve canlı görünümü aynı Form Merkezi alanında bütünleşik olarak düzenlemek.
3. Yanıttan incelemeye ve inceleme sonucunda doğru modül sonucuna (Kayıt, Finans, Kişi 360) doğrudan geçiş akışını kurmak.
4. İçe/dışa aktarımı kaynak ekranların kendi üzerinde erişilebilir kılmak; Kişi Ana Kaydı (Global Portföy) ile İş Katılımı (İşe Özel) ayrımını görsel ve işlevsel olarak netleştirmek.

---

## 2. Kullanıcı Senaryoları (User Scenarios)

### Senaryo 1: İşe Özel Kişiler ve Kayıt Ekosisteminde Gezinme
- **Kullanıcı:** Firma B etkinlik yöneticisi veya kayıt koordinatörü.
- **Akış:** Kullanıcı bir iş açtığında, sol menüdeki "Kişiler ve Kayıt" grubu altında şu 6 hedefi görür:
  1. *Kişiler ve Kurumlar* (`people`): Yalnız bu işle ilişkili kişilerin/kurumların görünümü ve portföy bağlantısı.
  2. *Katılımcılar* (`registrations`): Kesinleşmiş ve onaylanmış iş katılımcıları listesi.
  3. *Kategoriler ve Haklar* (`registrations`): Kayıt kategorileri, ücretler, kontenjanlar ve dahil haklar yönetimi.
  4. *Formlar* (`forms`): İşe özel başvuru, kayıt, anket ve değerlendirme formları.
  5. *Onay Merkezi* (`registrations`): İnceleme bekleyen kayıt başvuruları filtresi.
  6. *İçe / Dışa Aktarım* (`registrations`): Kayıt verisi toplu Excel/CSV aktarımları.

### Senaryo 2: Bütünleşik Form Yönetimi (Tasarım → Yayın → Yanıt Kutusu → Canlı Görünüm)
- **Kullanıcı:** Etkinlik form tasarımcısı.
- **Akış:** Form Merkezi'ne girdiğinde:
  - Form listesinden bir formu seçer veya şablondan yeni form üretir.
  - Formun yayın durumunu (Taslak / Yayında / Kapalı) tek tıkla kontrol eder.
  - Stüdyoda alanları, mantık kurallarını ve ödeme/kategori bağlantılarını düzenler.
  - Canlı görünümde formun mobil ve web çıktısını, QR kodunu ve paylaşım linkini inceler.

### Senaryo 3: Yanıt İncelemesinden Doğru Modüle Geçiş
- **Kullanıcı:** Başvuru hakemi veya onay yetkilisi.
- **Akış:** Yanıt kutusunda (Inbox) bekleyen bir kayıt formu gönderisini inceler:
  - Form yanıtları, spam skoru ve kişi bilgilerini görür.
  - Gönderiyi "Onayla" (Approve) butonuna basarak onaylar.
  - Arka planda otomatik olarak kayıt zinciri (`Person → Participation → Registration → Order`) oluşur.
  - İnceleme modalında anında beliren **"Kayıtlar Modülünde Aç"** butonuna basarak doğrudan ilgili katılımcı kaydına gider. Sipariş oluşmuşsa **"Finans / Siparişte Aç"** butonuyla muhasebe detayına geçebilir.

### Senaryo 4: Portföy Ana Kaydı vs. İş Katılımı Ayrımı
- **Kullanıcı:** Operasyon ve müşteri yöneticisi.
- **Akış:** Kişiler ekranında çalışırken:
  - Ekranın üst kısmında mevcut iş kapsamı (`Yalnız Bu İş` vs `Tüm Portföy`) net olarak gösterilir.
  - Kişinin global portföydeki ana kimliği ile bu işe atanmış katılım kaydı (rolleri, yaka kartı durumu, bilet hakkı) birbirinden ayrı rozet ve kartlarla sunulur.
  - Portföydeki bir kişiyi tek tıkla mevcut işe bağlayabilir veya işten çıkarabilir.

---

## 3. Kabul Kriterleri (Acceptance Criteria)

- **AC-1 (Navigasyon ve Gruplama):** `WORK_NAV_GROUPS` altındaki `people_registration` grubu öğeleri (`people-orgs`, `participants`, `categories-rights`, `forms`, `approval-center`, `import-export`) `DualSidebar` üzerinden tıklandığında ilgili modül ve doğru başlangıç sekmesine yönlendirir.
- **AC-2 (Kategoriler & Haklar Sekmesi):** `RegistrationsView` içinde kategorileri, kontenjanları, baz fiyatları ve hakları görüntüleyip yönetmeyi sağlayan "Kategoriler & Haklar" sekmesi (`categories`) bulunur.
- **AC-3 (Yanıttan Modüle Geçiş):** `FormCenterView` yanıt inceleme detayında (`SubmissionDetail`), onaylanmış veya kayıt üretmiş başvurular için "Kayıt Modülünde Aç" (`registrations`) ve "Kişi 360'ta Aç" (`people`) eylemleri çalışır.
- **AC-4 (Kaynak Ekran İçe/Dışa Aktarım):** `RegistrationsView` üzerinde doğrudan Excel/CSV İçe Aktarma (`/api/registrations/import`), Dışa Aktarma ve Manuel Kayıt butonları bulunur.
- **AC-5 (Portföy vs İş Katılımı Ayrımı):** `PeopleView` içinde iş bağlamında çalışırken Portföy Ana Kaydı ile İş Katılımı ayrımını belirten görsel bilgilendirme ve kapsam filtreleri (`peopleScope`) bulunur.
- **AC-6 (Kalite Kapıları):** Tüm TypeScript tür denetimleri (`typecheck`), linter (`lint`), mimari bağımlılık (`lint:arch`), i18n taraması (`i18n:scan` 0 ihlal) ve birim testleri (417+ test) %100 başarılı olmalıdır.
