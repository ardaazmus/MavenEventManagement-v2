# Mimari ve Teknik Plan: 006 — Ürün Sözlüğü ve Modül Sahipliği (Faz 1)

**Referans Belge:** `proje-hafizasi/12-PRODUCT-TRANSFORMATION-ROADMAP.md`  
**Amaç:** Maven Event Management V2 yeni bilgi mimarisi ve taksonomisini somut, tip güvenli TypeScript veri modelleri ve sorgulama yardımcılarıyla çekirdeğe entegre etmek.

---

## 1. Mimari Tasarım

### A. Modül ve Bağlam Katmanı (`src/lib/product-taxonomy.ts`)
Yeni mimari iki temel çalışma bağlamını (`ContextScope`) ayırır:
1. `GLOBAL`: Firma B'nin tüm işler çaprazındaki portföyü, genel iletişimi, raporları ve firma ayarları.
2. `WORK`: Belirli bir iş/organizasyon açıldığında o işe tahsis edilen modüller, kurulum kontrol listesi ve operasyonel akışlar.

### B. Veri Sözleşmeleri ve Tipler
- `WorkGroup`: `"EVENT_ORGANIZATION" | "TRAVEL_CLIENT" | "CUSTOM"`
- `WorkType`: `"CONGRESS" | "FAIR" | "CORPORATE" | "WEDDING" | "TRAVEL" | "CUSTOM"`
- `WorkScopeProfile`: `"INDIVIDUAL" | "GROUP"`
- `WorkSegmentProfile`: `"STANDARD" | "VIP"`
- `WorkPrivacyProfile`: `"PUBLIC" | "PRIVATE"`
- `WorkOwnershipProfile`: `"OWN_WORK" | "CLIENT_WORK"`
- `GlobalNavArea`: `"jobs" | "portfolio" | "comms" | "reports" | "settings"`
- `WorkNavGroup`: `"work_management" | "people_registration" | "program_content" | "sponsor_exhibition" | "venue_onsite" | "accommodation_services" | "communication_experience" | "work_reports" | "work_settings"`

### C. 26 Modül Haritası (`PRODUCT_MODULE_CATALOG`)
Her modül kaydı aşağıdaki bilgileri içerir:
- `id`: Mevcut modül anahtarı (`dashboard`, `people`, `registrations`, `scientific`, vb.)
- `title`: Kullanıcı dilinde standart Türkçe ürün adı
- `responsibility`: Modülün üstlendiği ürün işlevi
- `scope`: `GLOBAL` veya `WORK`
- `targetGroup`: Hedef grup kimliği
- `targetPath`: UI ve rota hedef yolu
- `userRole`: Kullanıcı iş akışındaki görevi

---

## 2. Geriye Uyumluluk ve Güvenli Geçiş
- Mevcut `src/lib/constants.ts` içindeki `MODULES` ve `MODULE_GROUPS` sabitleri bozulmaz; `product-taxonomy.ts` bu sabitleri zenginleştirip hedef mimariye köprü kurar.
- Eski kodlar ve sayfalar çalışmaya devam ederken, yeni global shell ve iş shell'i bu taksonomiyi referans alacaktır.

---

## 3. Doğrulama Stratejisi
- `tests-mini/product-taxonomy-and-module-ownership.test.mjs`:
  1. 26 modülün tamamının eksiksizliği (kayıpsızlık testi).
  2. 5 global alanın ve alt menülerinin 12. yol haritası ile tam uyumu.
  3. 9 iş grubu ve alt menü öğelerinin hiyerarşik tutarlılığı.
  4. Alt yetenek ve ayar eşlemelerinin doğruluğu.
  5. İş türü ve profil sözlüklerinin doğrulanması.
