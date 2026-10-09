# Uygulama Planı: 017 — Birleşik Ürün Dili ve Gezinme (Faz 12)

## 1. Mimari Tasarım ve Dosya Değişiklikleri

### A. Taksonomi ve Ürün Bağlam Kapsamları (`src/lib/product-taxonomy.ts`)
- `ProductContextScope` tipi (`GLOBAL_COMPANY`, `WORK_WORKSPACE`, `PLATFORM_OPERATOR`, `EXTERNAL_EXPERIENCE`) tanımlanır.
- `PRODUCT_CONTEXT_SCOPES` konfigürasyonu ve `getProductContextScope(moduleId: string)` fonksiyonu eklenir.
- 26 modülün her biri bu 4 bağlamdan birine haritalanır.
- Çapraz modül gezinme aksiyonları (`WORK_CONTEXT_BRIDGES`) tanımlanır:
  - `summary` ➔ `dashboard` (İş Özeti Cockpit)
  - `setup` ➔ `editions` / `setup-checklist` (Kurulum Listesi)
  - `comms` ➔ `communications` (İş İletişimi)
  - `portals` ➔ `portals` (Dış Deneyimler & Yayınlar)
  - `reports` ➔ `accounting` (İş Finansı ve Raporlar)

### B. Çapraz Modül Gezinme Köprüsü Bileşeni (`src/components/maven/navigation/module-context-bridge.tsx`)
- Bir iş açıkken modül sayfalarının üstünde (veya başlık alanında) yer alabilecek kompakt, zarif ve erişilebilir bir gezinme şeridi oluşturulur.
- Kullanıcı hangi iş modülünde olursa olsun tek tıkla işin Özetine, Kurulumuna, İletişimine, Portallarına veya Raporlarına geçebilir.
- İlgili aksiyonların tooltip ve erişilebilirlik etiketleri tam entegre edilir.

### C. Mobil ve Dar Ekran Gezinme İyileştirmeleri (`src/components/maven/navigation/dual-sidebar.tsx`)
- Mobilde çekmece (`SheetContent`) içinde `DualSidebar` render edildiğinde:
  - Üst kısımda "İş Alanı" ve "Firma Globali" arasında geçiş sağlayan kompakt bağlam anahtarı (Segmented Tab) sunulur.
  - Bir iş açıkken mobil kullanıcı doğrudan işin gruplarına odaklanabilir veya tek tıkla Firma Globali alanlarına (İşler, Portföy, İletişim, Raporlar, Ayarlar) erişebilir.
  - Dar ekranlarda (390px) menü genişliği optimize edilir; kaydırma alanları responsive hale getirilir.

### D. Üst Şerit (Header) Bağlam Göstergesi (`src/components/maven/shell.tsx`)
- Üst şeritte breadcrumb alanı güncellenir:
  - Bir iş seçili ve açıkken: `[Firma Adı] > [Seri/Kategori] > [İş Adı] (Makro Durum Rozeti)`
  - Global bir alan açıkken: `[Firma Adı] > [Firma Globali] > [Seçili Alan]`
- Kullanıcı hangi bağlamda olduğunu (Global vs İşe Özel) anında kavrar.

### E. i18n Sözlükleri (`src/i18n/`)
- `src/i18n/_new/unified-nav.tr.json` ve `unified-nav.en.json` oluşturulur.
- `tr.json`, `en.json` ve `i18n.ts` içine entegre edilir.
- `contextBridge`, `mobileNav`, `scopes` anahtarları eklenir.

### F. Karakterizasyon ve Sözleşme Testi (`tests-mini/unified-product-language-and-navigation.test.mjs`)
- `getProductContextScope` tüm 26 modül için doğrulanır.
- `WORK_CONTEXT_BRIDGES` 5 temel omurga alanını eksiksiz haritalar.
- `DualSidebar` ve `ModuleContextBridge` sözleşmeleri test edilir.
- i18n TR ve EN sözlük paritesi doğrulanır.

---

## 2. Kalite ve Doğrulama Kapıları
- `bun run typecheck`
- `bun run lint`
- `bun run lint:arch`
- `bun run i18n:scan` (0 ihlal)
- `bun run test:unit`
- `bun run test:smoke`
- `bun run test:e2e:ui`
- `bun run quality`
