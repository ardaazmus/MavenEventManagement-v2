# Görev Listesi: 011 — Kişiler, Kayıt ve Formlar (Faz 6)

- [x] **T-01:** `specs/011-people-registrations-and-forms/` belgelerinin hazırlanması (`spec.md`, `plan.md`, `tasks.md`).
- [x] **T-02:** `src/components/maven/navigation/dual-sidebar.tsx` içinde `people_registration` grubu öğelerinin (`people-orgs`, `participants`, `categories-rights`, `forms`, `approval-center`, `import-export`) ilgili modüllere ve alt görünümlere bağlanması.
- [x] **T-03:** `src/components/maven/views/registrations.tsx` bileşenine "Kategoriler ve Haklar" (`categories`) sekmesinin eklenmesi:
  - [x] Kategori listesi (Kapasite, Fiyat, Onay, Aktiflik).
  - [x] Kategori ekleme/düzenleme diyaloğu.
  - [x] Dahil olan haklar / kontenjanlar sunumu.
- [x] **T-04:** `src/components/maven/views/form-center.tsx` bileşeninde yanıttan incelemeye ve doğru modül sonucuna geçişin güçlendirilmesi:
  - [x] Gönderi inceleme modalında onaylanan kayıtlar için "Kayıt Modülünde Aç" butonu.
  - [x] Kişi kaydı için "Kişi 360'ta Aç" butonu.
  - [x] Sipariş için "Finans / Siparişte Aç" butonu.
- [x] **T-05:** `src/components/maven/views/people.tsx` bileşeninde iş bağlamında Portföy Ana Kaydı vs İş Katılımı kavramsal ve görsel ayrımının güçlendirilmesi:
  - [x] İş katılımı kapsam bildirimi ve rozetleri.
  - [x] Portföyden işe bağlama / çıkarma kontrolleri.
- [x] **T-06:** i18n Sözlük Güncellemeleri (`registrations`, `forms`, `people` namespace'leri için yeni etiketler, 0 hardcoded metin ihlali).
- [x] **T-07:** `tests-mini/people-registrations-and-forms.test.mjs` test paketinin yazılması ve `package.json`'a eklenmesi.
- [x] **T-08:** Kalite kapılarının çalıştırılması (`typecheck`, `lint`, `i18n:scan`, `lint:arch`, `test:unit`, `test:smoke`, `quality-report`).
- [x] **T-09:** Kanıt raporunun (`docs/evidence/`) ve Codex devir protokolünün güncellenmesi.
