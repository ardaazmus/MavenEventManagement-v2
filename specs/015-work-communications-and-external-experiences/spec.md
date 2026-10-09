# Şartname: 015 — İş İletişimi ve Dış Deneyimler (Faz 10)

## 1. Amaç ve Kapsam

Bu şartname, `proje-hafizasi/12-PRODUCT-TRANSFORMATION-ROADMAP.md` belgesindeki **Faz 10: İş iletişimi ve dış deneyimler** gereksinimlerini karşılar:
1. **Genel İletişim vs İş İletişimi Ayrımı:** Firma genelindeki kurumsal duyuru/pazarlama (`company-communications` / `comms`) ile seçili işe özel operasyonel katılımcı duyuru ve mesajlarının (`communications` / `work-comms`) menüde, kitle seçiminde ve geçmişinde açıkça ayrılması.
2. **Dış Deneyimlerin (Portallar) Ayrılması:** Tek bir karmaşık portal ekranı yerine, 5 bağımsız dış kullanıcı yüzeyinin netleştirilmesi:
   - Genel Mobil Deneyim (Event App / Katılımcı PWA)
   - Kişisel Katılımcı Portalı (`/portal/attendee` — bilet, karekod, sertifika, program)
   - B2B Eşleşme Portalı (B2B görüşme takvimi ve onaylar)
   - Sponsor & Partner Portalı (Sözleşme hakları, teslimat yükleme, stant bilgisi)
   - Müşteri & Kurum Portalı (`/portal/client` — delege kotası, fatura, onaylar)
3. **İş İçeriğinden Dış Yayın Akışı:** Program, oturumlar, konuşmacılar, sponsorlar ve stant planının dış deneyimlere yayına alınması / canlı yayın denetimi.
4. **Firma Vitrini vs İş Portalı Ayrımı:** Firma B'nin kurumsal vitrini (tüm etkinliklerin/hizmetlerin sergilendiği marka profili) ile münferit işin dış portalının kullanıcı iş akışlarında birbirinden bağımsız tutulması.

---

## 2. Kullanıcı Senaryoları ve Akışları

### Senaryo 1: İş İletişimi ve Kitle Ayrımı
- **Kullanıcı:** İletişim & Pazarlama Koordinatörü
- **Akış:**
  1. Kullanıcı, iş açıkken `İletişim ve Deneyim` grubundan `İş İletişimi`ne tıklar.
  2. Ekran başlığında seçili işe özel olduğu vurgulanır; alıcı kitlesi olarak yalnız o işin katılımcıları, kategorileri veya konuşmacıları listelenir.
  3. Genel kurumsal kitlelere gönderim yapılması istenirse "Firma Genel İletişimine Geç" kestirmesi sunulur.

### Senaryo 2: 5 Ayrı Dış Deneyim Alanının Yönetimi
- **Kullanıcı:** Etkinlik Yöneticisi
- **Akış:**
  1. Kullanıcı `İletişim ve Deneyim` grubundan `Dış Deneyimler` menüsüne tıklar (`portals`).
  2. Ekranda 5 ayrı dış alan sekmesi/kartı sunulur:
     - `Mobil Deneyim (PWA)`: Canlı yayın durumu, tema, offline desteği ve kurulum bağlantısı.
     - `Katılımcı Portalı`: Kişisel bilet, dijital yaka kartı QR, sertifika indirme ve LCV durumu.
     - `B2B Portalı`: İkili görüşme randevu sistemi, profil görünürlüğü ve masa planı.
     - `Sponsor Portalı`: Hak teslimatları, logo yükleme, stant bilgisi ve sözleşme özeti.
     - `Müşteri / Kurum Portalı`: Müşteriye özel delegasyon takibi, kayıt kotaları ve mali mutabakat özeti.
  3. Her yüzey için doğrudan "Dış Yüzeyi Önizle / Aç" linki bulunur.

### Senaryo 3: Dış Yayın Akışı ve Canlı Kontrol
- **Kullanıcı:** Dijital İçerik Editörü
- **Akış:**
  1. Kullanıcı, iş içeriklerinin (Program, Konuşmacılar, Sponsorlar, Katılımcı Kaydı) dış portallara aktarım durumunu inceler.
  2. "Yayında", "Taslakta", "Kilitli" yayın anahtarlarıyla her içeriğin dış dünyadaki görünürlüğünü yönetir.

### Senaryo 4: Firma Vitrini ile İş Portalı Ayrımı
- **Kullanıcı:** Firma Yöneticisi
- **Akış:**
  1. Firma vitrini ayarları ve tüm işlerin genel listesi Firma Ayarları / Vitrin alanında yönetilir.
  2. İş portalında yalnız seçili işin markası, afişi ve modülleri yayına açılır.

---

## 3. Kabul Kriterleri (Acceptance Criteria)

- [ ] **AC-1 (Dual Sidebar İletişim ve Deneyim Grubu):** `communication_experience` grubunda `work-comms` (`communications`), `external-experiences` (`portals`), `media` (`media`) öğeleri doğru yönlendirilmeli ve aktiflik durumları senkronize edilmelidir.
- [ ] **AC-2 (İş İletişimi & Genel İletişim Ayrımı):** `CommunicationsView`, iş kitleleri sınırını ve global iletişimle olan ayrımını bildiren `workScopeNotice` ve genel iletişime geçiş butonunu içermelidir.
- [ ] **AC-3 (5 Ayrı Dış Deneyim Yönetimi):** `PortalsView`, 5 dış kullanıcı deneyimini (`pwa` Mobil Deneyim, `attendee` Katılımcı Portalı, `b2b` B2B Portalı, `sponsor` Sponsor Portalı, `client` Müşteri/Kurum Portalı) sekmeli yapıda sunmalı ve her biri için dış bağlantı/önizleme sağlamalıdır.
- [ ] **AC-4 (Dış Yayın ve Canlı İçerik Denetimi):** Dış deneyimler alanında Program, Konuşmacılar, Sponsorlar ve Formların yayınlanma durumu (`PUBLISHED` vs `DRAFT`) açıkça gösterilmeli ve kontrol edilebilmelidir.
- [ ] **AC-5 (Firma Vitrini İzolasyonu):** Firma genel vitrini ile iş portalının ayrımını belirten bilgi bildirimi (`showcaseIsolationNotice`) bulunmalıdır.
- [ ] **AC-6 (i18n ve Sıfır Hardcoded Metin):** Tüm metinler TR ve EN sözlük dosyalarında tanımlanmalı, `bun run i18n:scan` 0 ihlal vermelidir.
- [ ] **AC-7 (Sözleşme Testleri):** `tests-mini/work-communications-and-external-experiences.test.mjs` test paketi yazılarak tüm kriterler doğrulanmalıdır.
