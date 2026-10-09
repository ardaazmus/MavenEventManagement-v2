# Görev Listesi: 009 — Yeni İş Başlatma (Wizard) ve İlk Kurulum Akışı (Faz 4)

- [x] **T-01:** `specs/009-new-work-wizard-and-setup/` dokümantasyonunun oluşturulması.
- [x] **T-02:** `src/components/maven/forms/new-work-wizard.tsx` bileşeninin geliştirilmesi:
  - [x] 8 adımlı mantıksal ve koşullu sihirbaz akışı (Grup, Tür/Şablon, Bilgiler, Müşteri, Profil, Yetenekler, Ekip, Özet).
  - [x] 6 ana şablon (Bilimsel Kongre, Ticari Fuar, Kurumsal Zirve, Düğün/Özel Davet, Grup Seyahati, Özel Proje).
  - [x] Tarih validasyon kuralı (başlangıç zorunlu, bitiş >= başlangıç).
  - [x] Test uyumluluğu için `editions-wizard-start`, `editions-wizard-end`, `editions-wizard-city`, `editions-wizard-date-error` id ve aria özniteliklerinin korunması.
- [x] **T-03:** `src/components/maven/views/editions.tsx` ve `jobs-view.tsx` üzerinde sihirbaz entegrasyonu.
  - [x] Başarılı oluşturma sonrası `setCurrentEdition` ve `setModule("dashboard")` (İş Özeti) yönlendirmesi.
- [x] **T-04:** `src/i18n/_new/editions.tr.json` ve `editions.en.json` dosyalarına i18n anahtarlarının eklenmesi.
- [x] **T-05:** `tests-mini/new-work-wizard-and-setup.test.mjs` testlerinin yazılması ve `package.json`'a eklenmesi.
- [x] **T-06:** Kalite kapılarının çalıştırılması (`typecheck`, `lint`, `i18n:scan`, `lint:arch`, `test:unit`, `test:smoke`, `quality`).
- [x] **T-07:** Kanıt raporunun ve Codex protokolünün güncellenmesi.
