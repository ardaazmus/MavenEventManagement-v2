# Antigravity & Codex İşbirliği ve Karşılıklı Kanıt Protokolü

**Proje:** Maven Event Management v2  
**Dizin:** `D:\project\MavenEventManagment_v2`  
**Oluşturulma Tarihi:** 9 Ekim 2026  
**Aktif Ajanlar:** Antigravity & Codex  

---

## 1. Altın İşbirliği Kuralı

Bu projede **Antigravity** ve **Codex** birlikte pair-programming ve geliştirme yürütmektedir. İki ajan arasındaki çalışma şu ilkelere bağlıdır:

1. **Kanıtsız Tamamlandı Denilemez:** Yapılan hiçbir iş, somut test koşusu çıktısı, compiler/linter sonucu ve dosya diff'i olmadan "bitti" veya "çalışıyor" olarak raporlanamaz.
2. **Karşılıklı Şeffaflık:** Bir ajanın yaptığı değişiklikler diğer ajan tarafından `git status`, `git diff`, `docs/evidence/` ve `specs/` üzerinden doğrudan doğrulanabilir olmalıdır.
3. **Kalıcı Kanıt Dosyaları:** Her ana aşama veya düzeltme, repo içindeki `docs/evidence/` klasörüne tarihli rapor olarak yazılmalıdır.
4. **Ortam ve Port Disiplini:** Yerel portlar ve servis süreçleri (Port 3000: FloorEditor, Port 3001: FloorPlanStudio, Port 3003: Collab-Service, Port 3005: Maven Dev Server) bilinmeli, çakışma yaratılmamalıdır.

---

## 2. Güncel Durum ve Devir (Handoff) Özeti (9 Ekim 2026)

### A. Yol Haritası (Roadmap) Tamamlananlar:
- **F-01 & F-02 (Finans Güvenliği & Çift Onay):** 50.000 TL üstü manuel ödemeler `PENDING` durumuna alınır, SoD kuralı ile ikinci yetkili onayı (`finance.approvePayment`) sonrası `PAID` olur. Finans kartları sunucu agregasyonuna bağlandı.
- **F-05 (Tenant Modül Yetkileri):** Platform A → Tenant B lisanslama yetkisi `src/lib/tenant-entitlements.ts` ve `/api/saas/entitlements` ile *deny-by-default* olarak kurgulandı.
- **F-04 (Sponsor Sözleşme Kapsamı):** `agreement-scoped` sponsor token'ları `isItemInAgreementScope` ile filtrelendi; başka anlaşmaların hakları izole edildi.
- **F-06 (Organizasyon Rolleri & Müşteri Portalı):** 17 rollü taksonomi (`src/lib/organization-roles.ts`), alias çözümleyici ve `CLIENT` portal token kapsamı `/api/portal/client` oluşturuldu.
- **F-07 (Kademeli Kurulum / Setup Checklist):** `src/lib/events/setup-checklist.ts` ve UI kartı eklendi. `UserRoleAssignment` sorgusu şema ile tam uyumlu hale getirildi (`scopeKey: { in: [editionId, "TENANT"] }`).
- **Faz 1 (Ürün Sözlüğü ve Modül Sahipliği):** `src/lib/product-taxonomy.ts` oluşturuldu. 5 Global Navigasyon Alanı, 9 İşe Özel Navigasyon Grubu, 26 modülün hedef ürün eşleme kataloğu (`PRODUCT_MODULE_CATALOG`) ve alt yetenek eşlemeleri tamamlandı.
- **Faz 2 (Firma B Global Shell ve İş Portföyü):** `src/components/maven/navigation/dual-sidebar.tsx` çift sol menü (56px ikon şeridi + 224px bağlamsal ikincil menü) ve `src/components/maven/views/jobs-view.tsx` portföy görünümü entegre edildi.
- **Faz 3 (İş Shell'i ve İş Özeti — Cockpit):** `src/components/maven/views/work-summary-view.tsx` karar ve operasyon odaklı İş Özeti (Cockpit) ekranı oluşturuldu. İş kimliği, Kurulum Hazırlığı Denetimi (% ve blokaj linkleri), Bekleyen Kararlar ve Onaylar (kayıt onayları, manuel ödeme ikinci onayları, geciken hakemler, oturum bekleyen bildiriler, teslimat bekleyen sponsorluklar), yalnız bu işte aktif modüllerin durum kartları, 14 günlük başvuru trendi, kaynak dağılımı, yaklaşan görevler ve arşivlenmiş işler için kapanış/mutabakat modu eksiksiz bağlandı. `DashboardView` edisyon bağlamında bu görünüme bağlandı.
- [x] **Faz 4 (Yeni İş Wizard'ı ve İlk Kurulum Akışı):** `src/components/maven/forms/new-work-wizard.tsx` 8 adımlı mantıksal ve koşullu sihirbaz (İş Grubu, Tür/Şablon, Kimlik/Açıklama, Tarih/Mekân, Müşteri/Paydaş, İş Profili, Yetenek Önerileri, Ekip/Departman, Taslak Oluşturma). P3.11 test sözleşmesi korundu. Taslak sonrası otomatik olarak `setCurrentEdition` ve `setModule("dashboard")` (İş Özeti Cockpit) yönlendirmesi sağlandı.
- [x] **Faz 5 (Portföy, İlişkiler ve Firma Yönetimi):** `src/components/maven/views/portfolio-view.tsx` (Kişiler, Kurumlar, Müşteriler, İş İlişkileri sekmeleri; Global Portföy Ana Kaydı ≠ İş Katılımı ayrımı; müşteri bağlı işler ve portal yetki durumu) ve `src/components/maven/views/company-settings-view.tsx` (Firma Profili, Çalışanlar/Ekipler, Departmanlar, Roller/Erişim, Genel Şablonlar, İletişim/İzinler, Entegrasyonlar/Uyumluluk) hayata geçirildi. `src/lib/module-components.tsx` üzerinden `renderModuleComponent` dinamik eşlemesi sağlandı. `MC-2` sözleşmesi korundu.
- [x] **Faz 6 (Kişiler, Kayıt ve Formlar):** `src/components/maven/navigation/dual-sidebar.tsx` içinde `people_registration` grubu öğeleri (`people-orgs`, `participants`, `categories-rights`, `forms`, `approval-center`, `import-export`) ilgili modüllere ve alt görünümlere bağlandı. `src/components/maven/views/registrations.tsx` bileşenine "Kategoriler & Haklar" sekmesi, kapasite/fiyat/onay/doluluk tablosu ve kategori modalı eklendi; manuel kayıt, Excel aktarımı yüzeyleri korundu. `src/components/maven/views/form-center.tsx` içinde onaylanan yanıttan kayıt/kişi/finans modüllerine tek tıkla geçiş eklendi. `src/components/maven/views/people.tsx` içinde portföy ana kaydı ile iş katılımı ayrımı ve işe ekleme/çıkarma yetenekleri eklendi.
- [x] **Faz 7 (Bilimsel, Program ve Sosyal İçerik):** Bildiri, hakem, karar ve CME tek çatı altında `ScientificView` içinde sekmelendi (`submissions`, `reviews`, `decisions`, `cme`). Kabul edilen bildirilerden tek tıkla programa oturum oluşturma ve sunucu yazarı konuşmacı bağlama köprüsü (`btnCreateSession`, `createSessionSub`) ile "Programda Aç" (`btnViewInProgram`) akışı kuruldu. `ProgramView` içinde oturumlar, salonlar, konuşmacılar, çizelge (timetable matrisi) ve yayın akışı (broadcast) sekmeleri ve istatistikleri düzenlendi. `SocialView` içinde iş programı entegrasyon bildirimi, planlar ve ayrı katılım/LCV (`attendance`) sekmeleri oluşturuldu; pakete dahil vs ücretli aktivite ayrımı ve katılımcı davet aksiyonu sağlandı.
- [x] **Faz 8 (Sponsor, Fuar, B2B ve Medya):** `dual-sidebar.tsx` içinde `sponsor_exhibition` grubu (`sponsors`, `packages-agreements`, `deliverables-entitlements`, `booths-floors`, `b2b`) tam olarak bağlandı. `SponsorshipView` 5 sıralı sekmeli akışa (`sponsors` → `packages` → `entitlements` → `deliverables` → `booths`), dış portal izolasyon uyarısına (`portalIsolationNotice`) ve Floor Studio entegrasyon uyarısına (`boothFloorNotice`) kavuşturuldu. `FloorsView` mekân ve sponsor hak havuzu bağlantı bildirimi (`sponsorLinkNotice`) ile donatıldı. `B2bView` tek kullanıcı yolculuğu bildirim şeridi (`journeyNotice`) ve 3 sıralı aşama (`requests`, `mutual`, `timetable`) ile yeniden yapılandırıldı. `MediaArchiveView` iş medyası ve firma marka kitaplığı (`tabWorkMedia` vs `tabBrandLibrary`) olarak ayrıldı. 0 hardcoded metin i18n taraması korundu.
- [x] **Faz 9 (Mekân, Konaklama, Seyahat ve Saha):** `dual-sidebar.tsx` içinde `venue_onsite` (`venues-spaces`, `onsite-operations`, `badges-print`, `certificates-docs`) ve `accommodation_services` (`accommodation`, `travel-transfers`, `extra-services`) alt öğeleri `moduleSubView` ile bağlandı; aktiflik durumları senkronize edildi. `AccommodationView` 4 sekmeli yapıya (`hotels`, `reservations`, `rooming`, `transfers`) kavuşturuldu; seyahat ve transfer takip konsolu (uçuş kodları, havalimanı, yolcu, şoför/plaka, araç tipi ve durum yaşam döngüsü) entegre edildi. `OnsiteView` içine işin mekân bilgisi (`editions.venueName`) ve mekân planına geçiş aksiyonu (`venueNotice`) eklendi; 4 sekmeli operasyonel yapı (`desk`, `kiosk`, `occupancy`, `cme`) düzenlendi. `CertificatesView` ve `BadgeQueueView` içine katılımcı dış portalı (`/portal/attendee`) erişim bildirimleri (`portalLinkNotice`, `portalBadgeNotice`) eklendi.
- [x] **Faz 10 (İş İletişimi ve Dış Deneyimler):** `dual-sidebar.tsx` içinde `communication_experience` grubu (`work-comms`, `external-experiences`, `media`) tam bağlandı ve aktiflik senkronize edildi. `CommunicationsView` içine iş kitleleri bildirim şeridi (`workScopeNotice`) ve Firma Genel İletişimine geçiş kestirmesi (`btnOpenCompanyComms` -> `company-communications`) eklendi. `PortalsView` 5 bağımsız dış deneyim alanına (`pwa` Mobil Deneyim, `attendee` Katılımcı Portalı, `b2b` B2B Portalı, `sponsor` Sponsor Portalı, `client` Müşteri/Kurum Portalı) ayrıldı; `moduleSubView` React 19 uyumlu senkronizasyonu tamamlandı. Firma genel vitrini izolasyon bildirimi (`showcaseIsolationNotice`) ve iş içeriğinden dış yayın akışı kontrol paneli (`PublishStatusCard` — Program, Konuşmacılar, Sponsorlar, Formlar için canlı yayın kontrolü) bağlandı. TR ve EN sözlüklerinde 0 hardcoded metin ihlali korundu.
- [x] **Faz 11 (Finans, Raporlar ve İş Yaşam Döngüsü):** `src/lib/product-taxonomy.ts` içinde 5 aşamalı `MACRO_LIFECYCLE_STAGES` (`DRAFT`, `PLANNING`, `ACTIVE`, `COMPLETED`, `ARCHIVED`) ve `getMacroLifecycleStage` tanımlandı. `CompanyReportsView` 6 sekmeli kurumsal raporlama panosu (`works-report`, `portfolio-report`, `finance-report`, `operations-report`, `comms-report`, `exports-report`) olarak kuruldu; her iş için İş Özeti, İş Finansı, İş Defteri ve Katılımcılara derin dönüş bağlantıları sağlandı. `FinanceView` operasyonel tahsilat/iade kapsamına ayrıldı, SoD >50.000 TL çift yetkili onay uyarısı vurgulandı ve Deftere geçiş butonu bağlandı; `AccountingView` ise kurumsal defter/gelir/gider ve mutabakat kapsamına ayrıldı, kapanış mutabakat sertifikası ile `ARCHIVED` geçişi bağlandı. `jobs-view.tsx` ve `work-summary-view.tsx` 5 aşamalı makro yaşam döngüsü filtreleri ve rozetleriyle güncellendi. `dual-sidebar.tsx` iş raporları (`accounting`, `registrations`, `sponsorship`) ve genel raporlar (`company-reports`) tam senkronize edildi. TR ve EN sözlüklerinde 0 hardcoded metin ihlali korundu.
- [x] **Faz 12 (Birleşik Ürün Dili ve Gezinme — Final Faz):** `src/lib/product-taxonomy.ts` içinde 4 ürün bağlam kapsamı (`GLOBAL_COMPANY`, `WORK_WORKSPACE`, `PLATFORM_OPERATOR`, `EXTERNAL_EXPERIENCE`) ve `getProductContextScope` tanımlandı. Her iş modülünden 5 omurga alana doğrudan geçiş sağlayan `WORK_CONTEXT_BRIDGES` ve `ModuleContextBridge` (`src/components/maven/navigation/module-context-bridge.tsx`) bileşeni entegre edildi (`hidden sm:block` ve `max-w-full overflow-hidden` korumasıyla 390px mobil viewport taşması önlendi). `dual-sidebar.tsx` ikincil panelinde "İş Modülleri" ve "Firma Globali" arasında `contextTab` hızlı geçişi (`tablist`) sağlandı. `shell.tsx` breadcrumbs ve başlık göstergeleri Firma Globali vs İş Çalışma Alanı bağlamını yansıtacak şekilde yapılandırıldı. TR ve EN sözlükleri `unified-nav` parçalarıyla tam eşitlendi; `tests-mini/unified-product-language-and-navigation.test.mjs` (5/5 PASS) ve Playwright E2E UI (18/18 PASS) dahil tüm kalite kapıları başarıyla tamamlandı.

### B. Kalite Kapıları ve Test Durumu (100% PASS):
- `bun run typecheck`: 0 hata
- `bun run lint`: 0 hata, 0 uyarı
- `bun run policy:check`: 168/168 rota tam sınıflandırıldı (CI PASS)
- `bun run i18n:scan`: 114 dosya, 0 ihlal
- `bun run lint:arch`: 543 modül, 2.185 bağımlılık, 0 ihlal
- `bun run test:unit`: **453/453 PASS** (0 fail, 0 skipped)
- `bun run test:smoke`: 9/9 PASS
- `bun run test:e2e:ui`: 18/18 PASS
- `node scripts/quality-report.mjs`: 4/4 PASS

### C. Çalışan Servisler ve Port Dağılımı:
- **Maven Event Management Web:** `http://localhost:3005` (Dev server Turbopack ile ayakta, health check HTTP 200).
- **Collab Service:** `http://localhost:3003` (PID 96268).
- **Diğer Yerel Süreçler (Dokunulmamalıdır):** Port 3000 (`FloorEditor_v2`), Port 3001 (`FloorPlanStudio`).

### D. İlgili Dosyalar:
- Detaylı Kanıt Raporu: [`docs/evidence/roadmap-verification-report-2026-10-09.md`](file:///d:/project/MavenEventManagment_v2/docs/evidence/roadmap-verification-report-2026-10-09.md)
- Şartnameler: `specs/001..005/`
- Rota Politikası Envanteri: `artifacts/route-policy-report.json`
- Platform Denetim Raporu: `.memory/agents/maven-platform-audit-2026-09-30.md`
