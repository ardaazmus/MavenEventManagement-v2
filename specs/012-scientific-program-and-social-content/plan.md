# Uygulama Planı: 012 — Bilimsel, Program ve Sosyal İçerik (Faz 7)

## 1. Mimari Tasarım ve Değişiklik Noktaları

### 1.1 `src/components/maven/views/scientific.tsx` (`ScientificView`)
- Bildiri, hakem, karar ve CME sekmelerini üst Tabs bileşeninde toplama:
  - `tab === "submissions"`: Mevcut bildiri listesi, yazar çipleri, hızlı durum değişimi, bildiri ekle/düzenle.
  - `tab === "reviews"`: Hakem atamaları listesi, geciken hakemler, puan durumu, `PeerReviewModal` çağrıları.
  - `tab === "decisions"`: Karar bekleyen bildiriler, karar geçmişi, `decideTarget` ile karar verme diyalogu.
  - `tab === "cme"`: CME kredi defteri tablosu, toplu varsayılan kredi atama ve `CmeReportOverlay` raporu.
- `moduleSubView` dinleyicisi: `moduleSubView === "reviews"`, `"decisions"`, `"cme"`, `"submissions"` geldiğinde aktif sekmeyi senkronize etme.
- Kabulden Oturuma Geçiş Köprüsü:
  - Edisyondaki oturumlar (`sessions`) listelenerek her bildirinin bir oturumda yer alıp almadığı (`submissionId` eşleşmesi) hesaplanır.
  - `ACCEPTED` durumundaki bildiriler için:
    - Atanmamışsa: "Program Slotu Bekliyor" rozeti ve "Programa Oturum Oluştur" butonu. Tıklandığında diyalog açılarak oturum başlığı, türü (`ORAL` -> `TALK`, `POSTER` -> `POSTER_SESSION`), sunucu yazar ve bildiri ID'si ile POST `/api/sessions` çağrılır veya Program modülüne yönlendirilir.
    - Atanmışsa: "Oturum: [Başlık]" rozeti ve "Programda Aç" (`setModule("program")`) butonu.

### 1.2 `src/components/maven/views/scientific.tsx` (`ProgramView`)
- Program sekmelerinin yapılandırılması:
  - `sessions`: Gün ve saat bazında oturumlar, çakışma uyarıları, materyaller, düzenleme diyaloğu.
  - `rooms`: Salonlar tablosu, oda kapasiteleri, salona ait oturum sayıları.
  - `speakers`: Oturumlara atanmış konuşmacılar, moderatörler ve oturum başkanları fihristi.
  - `timetable`: Mevcut görsel `TimetableGrid` matrisi.
  - `broadcast`: Yayın durumu, görünürlük (`isVisible`), yayın durumu (`PUBLISHED` vs `DRAFT`) ve dış portal önizlemesi.
- `moduleSubView` desteği: `moduleSubView === "timetable"`, `"rooms"`, `"speakers"`, `"broadcast"` durumlarında ilgili sekmeye geçiş.

### 1.3 `src/components/maven/views/social.tsx` (`SocialView`)
- Ana program bağlantısı bilgilendirme alanı ("İş Programı ile Entegre Sosyal ve Tur Planı").
- Katılım ve LCV (RSVP) yönetiminin güçlendirilmesi:
  - Kayıt paketine dahil olanlar vs ek ücretli aktiviteler ayrımı.
  - Katılım kontenjanı doluluk çubuğu.
  - "İş Katılımcılarından Davet Et / Ekle" hızlı aksiyonu.

### 1.4 `src/components/maven/navigation/dual-sidebar.tsx`
- `program_content` grubundaki öğelerin `moduleSubView` ile derin bağlantılanması:
  - `scientific`: `submissions`, `reviews`, `decisions`, `cme` alt görünümleriyle uyumluluk.
  - `program`: `sessions`, `timetable`, `rooms`, `speakers`, `broadcast` alt görünümleriyle uyumluluk.
  - `social-tours`: `social` modülü.

### 1.5 i18n Sözlükleri
- `src/i18n/_new/scientific.tr.json` ve `.en.json`: Yeni sekmeler, kabulden programa geçiş butonları, salon ve konuşmacı listesi metinleri.
- `src/i18n/_new/social.tr.json` ve `.en.json`: Program entegrasyonu ve katılım alanı metinleri.

---

## 2. Test ve Doğrulama
- Yeni test dosyası: `tests-mini/scientific-program-and-social-content.test.mjs`.
  1. Bilimsel alt sekmeleri (Bildiriler, Hakemler, Kararlar, CME) ve sözleşme doğrulaması.
  2. Kabulden oturum/konuşmacıya geçiş ve oturum eşleme mantığı.
  3. Program alt sekmeleri (Oturumlar, Salonlar, Konuşmacılar, Çizelge, Yayın Akışı).
  4. Sosyal etkinlik ve turların ana iş programı ilişkisi ve katılım alanı modeli.
  5. İkili navigasyon menüsünde `program_content` grup öğelerinin rota ve alt görünüm uyumu.
- `package.json` içindeki `"test:unit"` script'ine ekleme.
- Kalite kapıları çalıştırılması.
