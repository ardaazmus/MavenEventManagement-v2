# Şartname: 017 — Birleşik Ürün Dili ve Gezinme (Faz 12)

## 1. Amaç ve Kapsam

Bu şartname, `proje-hafizasi/12-PRODUCT-TRANSFORMATION-ROADMAP.md` belgesindeki **Faz 12 — Birleşik ürün dili ve gezinme** gereksinimlerini karşılar.

Yol Haritası Hedefleri:
1. **Terminoloji Birleştirme:** Firma globali (`GLOBAL_COMPANY`), iş alanı (`WORK_WORKSPACE`), Firma A (`PLATFORM_OPERATOR`) ve dış deneyim (`EXTERNAL_EXPERIENCE`) kavramsal ayrımını ve bağlam hiyerarşisini sabitlemek.
2. **Çapraz Yetenek Yerleşimi:** Duyuru, bildirim, dışa aktarım (export), entegrasyon, özel alan/şablon ve portal ayarları gibi ayrı ana menü olmayan yetenekleri sahibi ekranlara yerleştirmek.
3. **Modül İlişkileri Köprüsü (Context Bridge):** Her iş modülünde Özet (Summary), Kurulum (Setup), İletişim (Comms), Dış Deneyim (Portals) ve Rapor (Reports) ilişkisini tek tıkla erişilebilir bir gezinme şeridi ile görünür kılmak.
4. **Mobil / Dar Ekran Gezinmesi:** Masaüstü çift menü hiyerarşisini (ikon şeridi + bağlamsal ikincil menü) mobil cihazlarda (≤768px) görev odaklı katmanlar ve geri gezinme akışlarıyla optimize etmek.
5. **Kullanıcı Görünen Adları:** Teknik registry adlarını kullanıcı arayüzünden tamamen arındırarak gerçek etkinlik, kongre, fuar ve seyahat sektörü terminolojisini (TR & EN tam parite) garanti altına almak.

---

## 2. Kullanıcı Senaryoları ve Kabul Kriterleri

### Senaryo 1: Bağlam Hiyerarşisi ve Terminoloji
- **Girdi:** Kullanıcı sistemde gezinir.
- **Kabul Kriteri:**
  - `src/lib/product-taxonomy.ts` içinde 4 ürün bağlam kapsamı (`PRODUCT_CONTEXT_SCOPES`: `GLOBAL_COMPANY`, `WORK_WORKSPACE`, `PLATFORM_OPERATOR`, `EXTERNAL_EXPERIENCE`) tanımlanır.
  - Her modülün hangi bağlama ait olduğunu belirten `getProductContextScope(moduleId)` fonksiyonu sunulur.
  - Kullanıcıya gösterilen üst şerit ve gezinme başlıklarında teknik terimler (capability id, db model, registry key) yerine sektörel ve birleşik dil kullanılır.

### Senaryo 2: Çapraz Modül Gezinme Köprüsü (Module Context Bridge)
- **Girdi:** Kullanıcı herhangi bir iş modülü içindedir (örn. `registrations`, `scientific`, `accommodation`, `sponsorship`).
- **Kabul Kriteri:**
  - Her iş modülünden 5 temel iş omurgası alanına (İş Özeti Cockpit, Kurulum Listesi, İş İletişimi, Dış Deneyimler, İş Raporları) hızlı geçiş sağlayan `ModuleContextBridge` şeridi sunulur.
  - Bu köprü, kullanıcının iş bağlamını kaybetmeden modüller arası akışları yürütmesini sağlar.

### Senaryo 3: Çapraz Yeteneklerin Sahip Ekranlara Entegrasyonu
- **Girdi:** Kullanıcı bildirim, export, entegrasyon veya portal ayarlarına erişmek ister.
- **Kabul Kriteri:**
  - Dışa aktarma (export) eylemi ilgili modül ekranında (Kayıt, Portföy, Sponsor, Finans, Firma Raporları) kaynak veri listesiyle bütünleşiktir.
  - Bildirim ve duyurular: Genel bildirim zili + iş özelinde `CommunicationsView`.
  - Entegrasyonlar ve uyumluluk: Firma Ayarları üzerinden yönetilir; işe yansıyan durumu İş Ayarları ve ilgili modülde izlenir.

### Senaryo 4: Mobil ve Dar Ekran Görev Odaklı Gezinmesi
- **Girdi:** Kullanıcı 390px - 768px mobil cihaz ekranında menüyü açar.
- **Kabul Kriteri:**
  - `DualSidebar` mobil çekmecede (Sheet) görev odaklı sekmeli/katmanlı bir gezinme deneyimi sunar:
    - Bir iş açıkken "İş Modülleri" ve "Firma Globali" arasında tek tıkla geçiş yapılabilir.
    - Dar ekranda yatay taşma (overflow) yaşanmaz.
    - Menü öğeleri tıklandığında çekmece yumuşak şekilde kapanır ve hedef ekrana yönlenir.

### Senaryo 5: Sıfır Hardcoded Metin ve TR/EN Sözlük Paritesi
- **Girdi:** `bun run i18n:scan` ve `bun run typecheck` çalıştırılır.
- **Kabul Kriteri:**
  - 0 hardcoded metin ihlali korunur.
  - TR ve EN sözlüklerinde tüm yeni anahtarlar eksiksiz tanımlanır.
