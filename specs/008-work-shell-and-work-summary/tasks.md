# Görev Listesi: 008 — İş Shell'i ve İş Özeti (Faz 3)

- [x] **T-01:** `specs/008-work-shell-and-work-summary/` dokümantasyonunun hazırlanması.
- [x] **T-02:** `src/components/maven/views/work-summary-view.tsx` (İş Özeti Cockpit) bileşeninin oluşturulması:
  - [x] İş kimliği, türü, profili, yaşam döngüsü rozeti ve müşteri paydaş başlığı.
  - [x] Kurulum hazırlığı (% ve blokaj listesi) ile kontrol listesine doğrudan geçiş.
  - [x] Bekleyen kararlar ve onaylar paneli (kayıt onayları, manuel ödeme ikinci onayları).
  - [x] Yalnız bu işte etkin modüllerin durum kartları (Kayıt, Program, Sponsor, Saha, Konaklama).
  - [x] Yaklaşan görevler ve sorumluları.
  - [x] Dış deneyimler önizleme ve yayın paneli.
  - [x] Arşivlenmiş/tamamlanmış işler için mutabakat ve kapanış modu.
- [x] **T-03:** `src/components/maven/views/dashboard.tsx` ve `src/lib/module-components.tsx` güncellemesi:
  - [x] `DashboardView` içinde edisyon seçiliyken `WorkSummaryView` render edilmesi.
  - [x] Edisyon seçili değilken portföy yönlendirmesinin korunması.
- [x] **T-04:** `tests-mini/work-shell-and-work-summary.test.mjs` testlerinin yazılması ve `package.json`'a eklenmesi.
- [x] **T-05:** Kalite kapılarının çalıştırılması (`typecheck`, `lint`, `i18n:scan`, `lint:arch`, `test:unit`, `test:smoke`, `quality`).
- [x] **T-06:** Kanıt raporunun ve Codex protokolünün güncellenmesi.
