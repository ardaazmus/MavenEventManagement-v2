# Görev Listesi: 010 — Portföy, İlişkiler ve Firma Yönetimi (Faz 5)

- [x] **T-01:** `specs/010-portfolio-relationships-and-company-management/` şartname ve tasarım dokümanlarının hazırlanması.
- [x] **T-02:** Global Portföy Görünümü: `src/components/maven/views/portfolio-view.tsx` bileşeninin oluşturulması:
  - [x] Kişiler, Kurumlar, Müşteriler ve İş İlişkileri sekmeleri.
  - [x] Portföy Ana Kaydı vs İş Katılımı kavramsal ayrımı ve rozetleri.
  - [x] Müşteri işleri ve müşteri portal yetki durumu paneli.
- [x] **T-03:** Firma Ayarları Görünümü: `src/components/maven/views/company-settings-view.tsx` bileşeninin oluşturulması:
  - [x] 7 ana bölüm: Firma Profili, Çalışanlar/Ekipler, Departmanlar, Roller/Erişim, Genel Şablonlar, İletişim/İzinler, Entegrasyonlar/Uyumluluk.
  - [x] Firma varsayılanları ile iş özelleştirmelerinin bağlanması.
- [x] **T-04:** Navigasyon ve Modül Entegrasyonu:
  - [x] `src/lib/module-components.tsx` içine `portfolio` ve `company-settings` tanımlarının eklenmesi.
  - [x] `src/components/maven/navigation/dual-sidebar.tsx` global alan tıklamalarında doğru modül yönlendirmesi.
- [x] **T-05:** i18n Sözlük Güncellemeleri (`src/i18n/_new/portfolio.tr.json` / `.en.json` veya ilgili alanlar).
- [x] **T-06:** `tests-mini/portfolio-and-company-management.test.mjs` testlerinin yazılması ve `package.json`'a eklenmesi.
- [x] **T-07:** Kalite kapılarının çalıştırılması (`typecheck`, `lint`, `i18n:scan`, `lint:arch`, `test:unit`, `test:smoke`, `quality`).
- [x] **T-08:** Kanıt raporunun ve Codex protokolünün güncellenmesi.
