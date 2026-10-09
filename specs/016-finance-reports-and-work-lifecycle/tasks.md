# Görev Listesi: 016 — Finans, Raporlar ve İş Yaşam Döngüsü (Faz 11)

- [x] **Görev 1: Taksonomi ve Yaşam Döngüsü Tanımları (`src/lib/product-taxonomy.ts`)**
  - [x] 5 Aşamalı `MACRO_LIFECYCLE_STAGES` (`DRAFT`, `PLANNING`, `ACTIVE`, `COMPLETED`, `ARCHIVED`) tanımlarını ekle.
  - [x] Edisyon durumlarını makro aşamalara haritalayan `getMacroLifecycleStage(status: string)` fonksiyonunu ekle.
  - [x] `company-reports` modül tanımını `PRODUCT_MODULE_CATALOG` içine ekle.

- [x] **Görev 2: Firma Raporları Panosu (`src/components/maven/views/company-reports-view.tsx`)**
  - [x] Portföy, İş Portföyü, Operasyon, Finans, İletişim, Dışa Aktarımlar olmak üzere 6 sekmeli kurumsal raporlama panosunu oluştur.
  - [x] İş Portföyü ve Finans sekmelerinde her iş için "İş Özetini Aç", "İş Finansını Aç", "Katılımcıları Aç" derin bağlantılarını kur.
  - [x] React 19 güvenli `moduleSubView` senkronizasyonunu sağla.

- [x] **Görev 3: Operasyonel Finans ve Muhasebe Görünümlerinin Ayrılması (`finance.tsx` & `accounting.tsx`)**
  - [x] `FinanceView` içine operasyonel kapsam bildirimini ve "Mali Defter & Mutabakat Görünümüne Git" butonunu ekle.
  - [x] `FinanceView` içinde SoD >50.000 TL çift onay kontrol uyarısını belirginleştir.
  - [x] `AccountingView` içine kurumsal defter bildirimini, "Operasyonel Finansa Dön" ve "İş Özetine Dön" butonlarını ekle.
  - [x] `AccountingView` mutabakat sekmesinde kapanış sertifikasını ve `ARCHIVED` geçiş aksiyonunu bağla.

- [x] **Görev 4: Dual Sidebar ve Modül Haritası Senkronizasyonu (`dual-sidebar.tsx` & `module-components.tsx`)**
  - [x] `dual-sidebar.tsx`: Global `reports` alanı tıklandığında `company-reports` modülünü aç; ikincil menü sekmelerini `moduleSubView` ile bağla.
  - [x] `dual-sidebar.tsx`: İş bağlamındaki `work_reports` grubu (`work-finance-reports`, `work-reg-reports`, `work-sponsor-reports`) için yönlendirme ve aktiflik vurgusunu tam senkronize et.
  - [x] `module-components.tsx`: `company-reports` için dinamik bileşen haritasını kaydet.

- [x] **Görev 5: İşler Görünümü ve İş Özeti Yaşam Döngüsü Güncellemesi (`jobs-view.tsx` & `work-summary-view.tsx`)**
  - [x] `jobs-view.tsx`: 5 makro yaşam döngüsü filtresini ve kartlardaki makro rozetleri bağla.
  - [x] `work-summary-view.tsx`: İşin makro durumunu ve yaşam döngüsü geçiş durumlarını göster.

- [x] **Görev 6: i18n Sözlükleri (TR & EN Paritesi ve Sıfır Hardcoded Metin)**
  - [x] `src/i18n/_new/reports.tr.json` ve `reports.en.json` dosyalarını oluştur.
  - [x] `src/i18n/tr.json` ve `en.json` dosyalarına yeni anahtarları ekle.
  - [x] `bun run i18n:scan` ile 0 ihlal doğrula.

- [x] **Görev 7: Karakterizasyon Testi & Kalite Doğrulaması**
  - [x] `tests-mini/finance-reports-and-work-lifecycle.test.mjs` testini oluştur.
  - [x] `package.json` `test:unit` betiğine yeni testi ekle.
  - [x] `typecheck`, `lint`, `lint:arch`, `test:unit`, `test:smoke`, `quality` kapılarını başarıyla koştur.
  - [x] `docs/evidence/` ve `.memory/agents/` raporlarını güncelle.
