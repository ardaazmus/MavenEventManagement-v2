# Görev Listesi: 017 — Birleşik Ürün Dili ve Gezinme (Faz 12)

- [x] **Görev 1: Taksonomi ve Ürün Bağlam Kapsamları (`src/lib/product-taxonomy.ts`)**
  - [x] `ProductContextScope` tipi (`GLOBAL_COMPANY`, `WORK_WORKSPACE`, `PLATFORM_OPERATOR`, `EXTERNAL_EXPERIENCE`) ve etiketleri ekle.
  - [x] `getProductContextScope(moduleId: string)` fonksiyonunu ekle.
  - [x] `WORK_CONTEXT_BRIDGES` tanımını ekle (Özet, Kurulum, İletişim, Dış Deneyimler, Raporlar köprüleri).

- [x] **Görev 2: Çapraz Modül Gezinme Köprüsü Bileşeni (`src/components/maven/navigation/module-context-bridge.tsx`)**
  - [x] İş modülleri için kompakt, erişilebilir `ModuleContextBridge` bileşenini oluştur.
  - [x] Özet, Kurulum, İletişim, Dış Deneyimler ve Raporlar butonlarını bağla.

- [x] **Görev 3: Dual Sidebar Mobil ve Dar Ekran Gezinme İyileştirmesi (`src/components/maven/navigation/dual-sidebar.tsx`)**
  - [x] Mobilde (dar ekranda) "İş Modülleri" ve "Firma Globali" arasında hızlı geçiş sekmesi ekle.
  - [x] Mobil çekmece içinde tek tıkla gezinme ve kapanma etkileşimini optimize et.
  - [x] 390px ekran genişliğinde sıfır taşma sağla.

- [x] **Görev 4: Üst Şerit (Header) Bağlam Göstergesi (`src/components/maven/shell.tsx`)**
  - [x] Üst breadcrumb alanında aktif bağlamı (Firma Globali vs İşe Özel Çalışma Alanı) açıkça göster.
  - [x] İş açıkken makro yaşam döngüsü rozetini ve iş adını belirginleştir.

- [x] **Görev 5: i18n Sözlükleri (TR & EN Paritesi ve Sıfır Hardcoded Metin)**
  - [x] `src/i18n/_new/unified-nav.tr.json` ve `unified-nav.en.json` dosyalarını oluştur.
  - [x] `src/i18n/tr.json` ve `en.json` dosyalarına yeni anahtarları ekle.
  - [x] `bun run i18n:scan` ile 0 ihlal doğrula.

- [x] **Görev 6: Karakterizasyon Testi & Kalite Doğrulaması**
  - [x] `tests-mini/unified-product-language-and-navigation.test.mjs` testini oluştur.
  - [x] `package.json` `test:unit` betiğine yeni testi ekle.
  - [x] `typecheck`, `lint`, `lint:arch`, `test:unit`, `test:smoke`, `test:e2e:ui`, `quality` kapılarını çalıştır.
  - [x] `docs/evidence/` ve `.memory/agents/` raporlarını güncelle.
