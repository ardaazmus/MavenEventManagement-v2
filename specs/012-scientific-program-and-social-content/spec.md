# Şartname: 012 — Bilimsel, Program ve Sosyal İçerik (Faz 7)

## 1. Amaç ve Kapsam

Bu şartname, `proje-hafizasi/12-PRODUCT-TRANSFORMATION-ROADMAP.md` belgesindeki **Faz 7 (Bilimsel, program ve sosyal içerik)** gereksinimlerini karşılamak üzere hazırlanmıştır:
1. **Bilimsel Gruplaması:** Bildiri, hakem, karar ve CME modüllerini "Bilimsel" şemsiyesi altında gruplamak; sekmeli ve alt görünümlü tekil bir çalışma alanı sunmak.
2. **Kabulden Oturum/Konuşmacıya Geçiş:** Kabul edilen bir bildirinin (`ACCEPTED`) henüz bir oturuma atanıp atanmadığını tespit etmek, tek tıkla oturum oluşturma ve sunucu yazarı konuşmacı (`SPEAKER`) olarak atama akışını sağlamak; oturumu olan bildiriler için ise doğrudan Programa geçiş bağlantısı sunmak.
3. **Program Düzenlemesi:** Program modülünü Oturumlar, Salonlar, Konuşmacılar/Görevliler, Çizelge (Timetable matrisi) ve Yayın Akışı boyutlarında düzenlemek; çakışma kontrolü ve yayın görünürlüğünü berraklaştırmak.
4. **Sosyal Etkinlik ve Turlar:** Gala, gezi, yemek ve turları ana iş programıyla ilişkili kılmak; ayrı bir katılım alanı olarak kontenjan, LCV (RSVP) ve kayıt paketi dahil/ücretli katılım takibini zenginleştirmek.

---

## 2. Kullanıcı Senaryoları ve Kabul Kriterleri (Acceptance Criteria)

### Senaryo 1: Bilimsel Şemsiyesi Altında Bildiri, Hakem, Karar ve CME Gruplaması
- **Girdi:** Kullanıcı sol iş menüsünden "Bilimsel" alanına tıklar veya doğrudan ilgili alt sekmeyi seçer.
- **Beklenen Davranış:**
  - `ScientificView` 4 ana çalışma sekmesine sahip olur:
    - `submissions`: Bildiriler ve yazarlar listesi, filtreler, hızlı durum güncellemesi.
    - `reviews`: Hakem atamaları, geciken hakemler, puanlar ve rubrik değerlendirmesi.
    - `decisions`: Karar bekleyen bildiriler, karar geçmişi ve gerekçeli karar diyaloğu (`ACCEPT_ORAL`, `ACCEPT_POSTER`, `REJECT`, `REVISION_REQUIRED`).
    - `cme`: CME kredi defteri, oturum bazlı kredi dağıtımı ve CME raporu (`CmeReportOverlay`).
  - İkili sol menüden (`dual-sidebar.tsx`) alt görünümler seçildiğinde `moduleSubView` ile doğrudan ilgili sekmeye odaklanılır.

### Senaryo 2: Kabulden Programa Oturum ve Konuşmacı Aktarımı
- **Girdi:** Kullanıcı kabul edilen (`status === "ACCEPTED"` veya kabul kararı alınmış) bir bildiriyi inceler.
- **Beklenen Davranış:**
  - Eğer bildirinin atanmış bir oturumu yoksa: "Program Slotu Bekliyor" rozeti ve "Programa Oturum Oluştur" eylemi gösterilir.
  - Tıklandığında bildirinin kodu, başlığı ve türü (`ORAL` -> `TALK`, `POSTER` -> `POSTER_SESSION`) oturum oluşturma formuna aktarılır ve sunucu yazar (`presentingAuthorName`) oturuma konuşmacı (`SPEAKER`) olarak bağlanabilir.
  - Eğer bildirinin zaten bir oturumu varsa: "Oturumda Planlandı" rozeti ve "Programda Gör" butonu ile doğrudan `program` modülüne geçiş sağlanır.

### Senaryo 3: Program Akışının Oturum, Salon, Konuşmacı, Çizelge ve Yayın Akışında Düzenlenmesi
- **Girdi:** Kullanıcı "Program" modülünü açar.
- **Beklenen Davranış:**
  - `ProgramView` içinde 5 sekme yer alır:
    - `sessions`: Gün/saat bazlı oturumlar, çakışma uyarıları, materyaller ve görev atamaları.
    - `rooms`: Etkinlik salonları, kapasiteleri ve oturum dağılımı.
    - `speakers`: Oturumlarda görevli konuşmacı, başkan ve moderatörler dizini.
    - `timetable`: Salon ve zaman ekseninde görsel timetable matrisi.
    - `broadcast`: Oturumların yayındaki dış durumu, gizli/açık oturumlar ve canlı yayın bağlantıları.

### Senaryo 4: Sosyal Etkinlik ve Turların Ana Programla Bağlantılı Ayrı Katılım Alanı Olması
- **Girdi:** Kullanıcı "Sosyal ve Tur Planı" modülünü açar.
- **Beklenen Davranış:**
  - Ana iş (edisyon) programıyla bağlantıyı vurgulayan bildirim alanı gösterilir.
  - Her plan için ayrı katılım alanı (katılımcı listesi, LCV yanıtları, dahil olan/ek ücretli durumları ve iş katılımcılarından davet etme) görünür kılınır.

---

## 3. Mimari ve Güvenlik Sınırları
- UI/UX ve iş akışına odaklanılır; gereksiz API/şema kırmalarından kaçınılır.
- `src/lib/constants.ts` ve `MODULES` 26 modül sözleşmesi korunur.
- Yeni metinler `src/i18n/_new/scientific.*.json` ve `social.*.json` dosyalarına sözlük-öncelikli eklenir (`i18n:scan` 0 ihlal kuralı).
- Tüm kalite kapıları (`typecheck`, `lint`, `i18n:scan`, `lint:arch`, `test:unit`, `test:smoke`, `quality-report`) %100 yeşil kalmalıdır.
