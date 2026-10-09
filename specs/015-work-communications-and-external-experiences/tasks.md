# Görev Listesi: 015 — İş İletişimi ve Dış Deneyimler (Faz 10)

- [x] **T-01:** `specs/015-work-communications-and-external-experiences/` dokümantasyonunun hazırlanması (`spec.md`, `plan.md`, `tasks.md`).
- [x] **T-02:** `src/components/maven/navigation/dual-sidebar.tsx` içinde `communication_experience` grubu (`work-comms`, `external-experiences`, `media`) öğelerinin yönlendirmesi ve `moduleSubView` ile senkronizasyonu.
- [x] **T-03:** i18n Sözlük Dosyalarının Hazırlanması (`communication.tr.json` / `en.json`, `portal.tr.json` / `en.json`, `tr.json` / `en.json`) — 0 hardcoded metin ihlali.
- [x] **T-04:** `src/components/maven/views/onsite.tsx` (`CommunicationsView`):
  - [x] Seçili iş kitleleri bildirim şeridi (`workScopeNotice`) ve Firma Genel İletişimine geçiş butonu (`btnOpenCompanyComms`).
- [x] **T-05:** `src/components/maven/views/portals.tsx` (`PortalsView`):
  - [x] 5 sekmeden oluşan dış deneyim mimarisi (`pwa` Mobil Deneyim, `attendee` Katılımcı Portalı, `b2b` B2B Portalı, `sponsor` Sponsor Portalı, `client` Müşteri/Kurum Portalı).
  - [x] `moduleSubView` senkronizasyon effect'i (React 19 uyumlu setTimeout).
  - [x] Firma vitrini izolasyon bildirimi (`showcaseIsolationNotice`).
  - [x] İş içeriğinden dış yayın akışı ve durum kartları (`publishStatusCard` — Program, Konuşmacılar, Sponsorlar, Formlar).
- [x] **T-06:** `tests-mini/work-communications-and-external-experiences.test.mjs` test paketinin yazılması ve `package.json`'a eklenmesi.
- [x] **T-07:** Kalite kapılarının çalıştırılması (`typecheck`, `lint`, `i18n:scan`, `lint:arch`, `test:unit`, `test:smoke`, `quality-report`).
- [x] **T-08:** Kanıt raporunun (`docs/evidence/`) ve yol haritası durumunun güncellenmesi.
