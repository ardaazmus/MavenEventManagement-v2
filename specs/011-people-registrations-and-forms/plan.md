# Uygulama Planı: 011 — Kişiler, Kayıt ve Formlar (Faz 6)

## 1. Mimari Tasarım ve Bileşen Dağılımı

### A. İşe Özel "Kişiler ve Kayıt" Navigasyonu
`src/components/maven/navigation/dual-sidebar.tsx`:
- `people_registration` grubu öğeleri:
  - `people-orgs`: `setModule("people")`
  - `participants`: `setModule("registrations")`
  - `categories-rights`: `setModule("registrations")` (veya `subTab="categories"`)
  - `forms`: `setModule("forms")`
  - `approval-center`: `setModule("registrations")` (veya `subFilter="PENDING_APPROVAL"`)
  - `import-export`: `setModule("registrations")` (veya `subAction="import"`)

### B. Kayıtlar Modülü Genişletmesi (`RegistrationsView`)
`src/components/maven/views/registrations.tsx`:
- Sekmeler: `list` (Kayıtlar / Katılımcılar), `categories` (Kategoriler & Haklar), `agency` (Acente Konsolu), `waitlist` (Bekleme Listesi), `lcv` (LCV / Davetliler).
- Yeni `categories` sekmesi:
  - Kayıt kategorileri listesi (Ad, Kod, Fiyat/Para birimi, Onay gereksinimi, Kapasite/Doluluk, Aktiflik).
  - Kategoriye bağlı haklar / kontenjanlar (Dahil öğeler: Gala bileti, kongre çantası, vb.).
  - Yeni kategori oluşturma ve düzenleme diyaloğu (`registration-categories` API).
- İçe / Dışa Aktarım:
  - Zaten mevcut olan `regIo.import.btn` ve `regIo.export.btn` butonları kaynak ekranın üst barında korunur ve zenginleştirilir.

### C. Form Merkezi (`FormCenterView`) — İncelemeden Modül Sonucuna Geçiş
`src/components/maven/views/form-center.tsx`:
- Gönderi İnceleme Detayı (`SubmissionDetail`):
  - Onaylanmış veya kayıt üretmiş başvurular için:
    - `registration` bilgisi varsa:
      - "Kayıt Modülünde Aç" butonu -> `setModule("registrations")`
    - Gönderi sahibi için:
      - "Kişi 360'ta Aç" butonu -> `setModule("people")`
    - Sipariş oluşmuşsa:
      - "Finans / Siparişte Aç" butonu -> `setModule("finance")`
- Yayın Durumu Yönetimi:
  - Form listesinde ve stüdyoda yayın durumu (Taslak / Yayında / Kapalı) hızlı geçiş anahtarı.

### D. Kişiler Modülü (`PeopleView`) — Portföy vs İş Katılımı Ayrımı
`src/components/maven/views/people.tsx`:
- İş bağlamı varken (`currentEditionId` dolu):
  - Üst bilgilendirme şeridi: "İş Katılımı Kapsamı: Bu ekrandaki roller ve atamalar mevcut işe özeldir; global kişi ana kaydı korunur."
  - "İşe Kişi Ekle / Portföyden Bağla" ve "Etkinlikten Çıkar" (`toggleEventLink`) kontrollerinin belirginliği.

### E. i18n Lokalizasyonu
`src/i18n/_new/registrations.tr.json` / `registrations.en.json` ve `forms.tr.json` / `forms.en.json`:
- Yeni sekmeler, butonlar ve yönlendirme etiketleri eksiksiz eklenir.

---

## 2. Test ve Doğrulama Stratejisi
- Yeni mini test: `tests-mini/people-registrations-and-forms.test.mjs`
  - Test 1: `people_registration` navigasyon grubu ve alt öğe eşlemeleri.
  - Test 2: `RegistrationsView` sekmeleri (`categories`, `list`, `agency`, `waitlist`, `lcv`).
  - Test 3: Kategori & Hak sözleşmesi (`registration-categories`).
  - Test 4: Form Merkezi yanıttan modül sonucuna geçiş sözleşmesi.
  - Test 5: Kişi Ana Kaydı (Global) vs İş Katılımı (İş) sözleşmesi.
- Kalite Kapıları:
  - `bun run typecheck`
  - `bun run lint`
  - `bun run i18n:scan`
  - `bun run lint:arch`
  - `bun run test:unit`
