# Görev Listesi: 007 — Firma B Global Shell ve İş Portföyü (Faz 2)

- [x] **T-01:** `specs/007-global-shell-and-jobs-view/` spec, plan ve tasks dokümanlarının hazırlanması.
- [x] **T-02:** `src/components/maven/navigation/dual-sidebar.tsx` çift sol menü bileşeninin oluşturulması:
  - [x] Dar sabit sol ikon şeridi (56px) (İşler, Portföy, İletişim, Raporlar, Ayarlar, Yardım, Profil).
  - [x] Bağlamsal ikinci menü (220px) (seçili global alana ait menü veya seçili işin 9 grubu).
  - [x] İşe girildiğinde iş kimliği ve iş içi navigasyon desteği.
- [x] **T-03:** `src/components/maven/views/jobs-view.tsx` "İşler ve Organizasyonlar" ana ekranının oluşturulması:
  - [x] Arama ve durum filtreleme sekmeleri (Tümü, Aktif, Planlanan, Dikkat Gereken, Tamamlanan, Arşiv).
  - [x] İş kartları ve liste görünümü toggle desteği.
  - [x] İş kartında tür, profil, müşteri, sorumlu, tarih/şehir ve açık modüller.
  - [x] "İşi Aç", "Kuruluma Devam Et" ve "İş Ayarları" hızlı eylem butonları.
  - [x] "Dikkat Gerekenler" özeti ve yönlendirici boş durum (empty state).
- [x] **T-04:** `src/components/maven/shell.tsx` ve `src/app/page.tsx` entegrasyonu:
  - [x] `DualSidebar` masaüstü ve mobil Sheet entegrasyonu.
  - [x] `jobs` modülünün varsayılan giriş ekranı olarak `JobsView` ile bağlanması.
- [x] **T-05:** `tests-mini/global-shell-and-jobs-view.test.mjs` testlerinin yazılması ve `package.json`'a eklenmesi.
- [x] **T-06:** Tüm kalite kapılarının ve testlerinin çalıştırılması (`typecheck`, `lint`, `policy:check`, `i18n:scan`, `lint:arch`, `test:unit`, `test:smoke`).
- [x] **T-07:** Kanıt raporunun ve Codex devir belgesinin güncellenmesi.
