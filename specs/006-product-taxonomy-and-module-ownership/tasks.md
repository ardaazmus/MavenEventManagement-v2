# Görev Listesi: 006 — Ürün Sözlüğü ve Modül Sahipliği (Faz 1)

- [x] **T-01:** `specs/006-product-taxonomy-and-module-ownership/` spec, plan ve tasks dokümanlarının hazırlanması.
- [x] **T-02:** `src/lib/product-taxonomy.ts` dosyasının oluşturulması:
  - [x] Temel varlıklar (`FIRMA_A`, `FIRMA_B`, `WORK`, `WORK_TYPES`, `WORK_PROFILES`, `PORTFOLIO_RECORD`, `WORK_RELATIONSHIP`, `WORK_PARTICIPATION`).
  - [x] Global Navigasyon Hiyerarşisi (5 alan ve ikinci menü görünümleri).
  - [x] İş Navigasyon Hiyerarşisi (9 iş grubu ve alt menü öğeleri).
  - [x] 26 modülün hedef ürün eşlemesi ve sorumluluk kataloğu.
  - [x] Alt yeteneklerin (ayrı menüsü olmayan fonksiyonlar) ana modül ve ayar alanlarıyla eşlemesi.
  - [x] Edisyon ve seri geçmişinin İş içindeki yerinin modellenmesi.
- [x] **T-03:** `tests-mini/product-taxonomy-and-module-ownership.test.mjs` birim ve sözleşme testlerinin yazılması.
- [x] **T-04:** Kalite kapılarının çalıştırılması (`typecheck`, `lint`, `policy:check`, `i18n:scan`, `lint:arch`, `test:unit` - 397/397 pass).
- [x] **T-05:** E2E smoke testlerinin doğrulanması (`test:smoke` - 9/9 pass).
- [x] **T-06:** Kanıt raporunun güncellenmesi ve Codex devir belgesine işlenmesi.
