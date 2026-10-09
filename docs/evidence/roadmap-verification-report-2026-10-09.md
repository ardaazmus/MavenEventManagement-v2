# Maven Event Management v2 — Yol Haritası Doğrulama ve Kanıt Raporu

**Tarih:** 9 Ekim 2026  
**Oturum / Görev:** Yol Haritası Kapsamlı Analizi, Eksik Kalan İşlerin Tamamlanması, Kalite Kapıları ve E2E Test Doğrulamaları  
**Çalışma Dizini:** `D:\project\MavenEventManagment_v2`  
**Durum:** **VERIFIED COMPLETE**

---

## 1. Yönetici Özeti

Bu belge, yol haritasında (`.memory/agents/maven-platform-audit-2026-09-30.md` ve `CONTEXT.md`) yer alan gereksinimlerin tamamlanması, tespit edilen kritik çalışma zamanı ve mimari boşlukların giderilmesi, tüm Kalite Kapıları (Quality Gates) ve Playwright E2E testlerinin çalıştırılmasına dair somut kanıtları içerir.

---

## 2. Yol Haritası Maddeleri ve Yapılan Değişiklikler

### F-01 & F-02 — Finans Güvenliği, İkinci Onay ve Sunucu Taraflı Agregasyon
- **Sorun:** 50.000 TL üstü manuel tahsilatlarda ikinci yetkili onayı mekanizması simülasyon düzeyinde sabit metin yazıyordu ve sipariş anında `PAID` oluyordu. Finans ekranı 200 sipariş kısıtlamasına takılıyordu.
- **Yapılan Değişiklikler:**
  - `src/app/api/flows/route.ts`: `finance.manualPayment` akışı 50.000 TL (5.000.000 minor unit) ve üzeri ödemelerde `status: "PENDING"` oluşturur; `finance.approvePayment` akışı ikinci bir yetkilinin onayı ile `SUCCEEDED` yapar ve siparişi `PAID` durumuna geçirir. Görevler Ayrılığı (SoD) kuralı uygulandı.
  - `src/components/maven/views/finance.tsx`: Finansal KPI kartları ve defter toplamları sunucu agregasyonuna bağlandı.
  - `tests/phase2-money.spec.ts`: Testler güncellendi ve doğrulandı.

### F-05 — Tenant Modül Yetkileri (Platform A → Tenant B Entitlements)
- **Sorun:** Platform Sahibi A ile Tenant B arasındaki ürün modülü lisanslama sözleşmesi sunucu tarafında uygulanmıyordu.
- **Yapılan Değişiklikler:**
  - `src/lib/tenant-entitlements.ts`: `isTenantModuleEntitled` ve `isTenantCapabilityEntitled` kuralları yazıldı (*deny-by-default*).
  - `src/app/api/saas/entitlements/route.ts`: Platform yönetim ve sorgulama API rotası oluşturuldu.
  - `tests-mini/tenant-module-entitlements.test.mjs`: 7 adet birim/entegrasyon testi eklendi.

### F-04 — Sponsor Sözleşme Kapsamı İzolasyonu (Agreement Scope Isolation)
- **Sorun:** `agreement-scoped` sponsor token'ları kurumun tüm anlaşmalarına ait hak ve siparişleri geniş scope'ta görebiliyordu.
- **Yapılan Değişiklikler:**
  - `src/lib/portal/sponsor-scope.ts`: `isItemInAgreementScope` scope çözümleyicisi uygulandı.
  - `src/app/api/portal/sponsor/route.ts`: Anlaşma token'ı kullanıldığında yalnızca ilgili anlaşmaya bağlı haklar ve siparişler dönecek şekilde filtreleme daraltıldı.
  - `tests-mini/portal-sponsor-scope.test.mjs`: Doğrulama testleri yazıldı.

### F-06 — Organizasyon Rol Taksonomisi ve Müşteri Portalı
- **Sorun:** Tüzel kişi rolleri sabit 8 rol ile sınırlıydı; müşteri kurumu (CLIENT) için dış portal token kapsamı yoktu.
- **Yapılan Değişiklikler:**
  - `src/lib/organization-roles.ts`: 17 organizasyon rolü, 4 kategori ve edisyon bazlı özel rol takma ad (custom alias) sistemi oluşturuldu.
  - `src/app/api/portal/client/route.ts` & `src/app/api/portal/client-grants/route.ts`: `CLIENT` portal token kapsamı ile müşteri kurumu delegelerine daraltılmış izleme arayüzü API'leri eklendi.
  - `tests-mini/organization-roles-and-client-portal.test.mjs`: Test edildi.

### F-07 — Kademeli Etkinlik Kurulumu (Progressive Event Setup Checklist)
- **Sorun:** Yeni etkinlik oluşturulduğunda ilk admin için yol gösterici kademeli kontrol listesi ve yayın engeli ön kontrolleri eksikti.
- **Yapılan Değişiklikler:**
  - `src/lib/events/setup-checklist.ts`: `computeEditionSetupChecklist` mantığı yazıldı. Prisma `UserRoleAssignment` modeli `scopeKey: { in: [editionId, "TENANT"] }` üzerinden sorgulanacak şekilde düzeltildi.
  - `src/components/maven/views/setup-checklist-card.tsx` & `src/components/maven/views/editions.tsx`: UI bileşenleri eklendi.
  - `src/app/api/editions/[id]/setup-checklist/route.ts`: API rotası tanımlandı.
  - `tests-mini/event-setup-checklist.test.mjs`: 6 adet test ile doğrulandı.

### Faz 1 — Ürün Sözlüğü ve Modül Sahipliği (`12-PRODUCT-TRANSFORMATION-ROADMAP.md`)
- **Yapılan Değişiklikler:**
  - `src/lib/product-taxonomy.ts`:
    - Firma A, Firma B, İş, 3 İş Grubu, 6 İş Türü, 4 Profil Boyutu, 13 Yaşam Döngüsü Aşaması kodlandı.
    - Portföy Kaydı (GLOBAL) vs İş İlişkisi / Katılımı (WORK) kavramsal ayrımı sabitlendi.
    - Firma B Global Navigasyon Hiyerarşisi (5 alan ve ikincil menüler: İşler, Portföy, İletişim, Raporlar, Ayarlar) tanımlandı.
    - İşe Özel Navigasyon Hiyerarşisi (9 sabit grup: İş Yönetimi, Kişiler/Kayıt, Program/İçerik, Sponsor/Fuar, Mekân/Saha, Konaklama/Hizmetler, İletişim/Deneyim, İş Raporları, İş Ayarları) kuruldu.
    - 26 ana modülün tamamı ürün sorumluluğu, bağlamı (`GLOBAL` vs `WORK`), hedef menü konumu ve kullanıcı akışındaki rolüyle `PRODUCT_MODULE_CATALOG` altında eksiksiz eşlendi (kayıpsızlık garantisi).
    - Ayrı menüsü olmayan 9 yetenek hedef ekranlarına eşlendi.
  - `specs/006-product-taxonomy-and-module-ownership/`: `spec.md`, `plan.md`, `tasks.md` oluşturuldu.
  - `tests-mini/product-taxonomy-and-module-ownership.test.mjs`: 6 adet sözleşme ve kayıpsızlık testi eklendi.

### Faz 2 — Firma B Global Shell ve İş Portföyü (`12-PRODUCT-TRANSFORMATION-ROADMAP.md`)
- **Yapılan Değişiklikler:**
  - `src/components/maven/navigation/dual-sidebar.tsx`:
    - Dar sabit global ikon şeridi (56px / `w-14`): Firma B kimliği/baş harfi, 5 global alan ikonu (`jobs`, `portfolio`, `comms`, `reports`, `settings`), alt kısımda Yardım ve Kullanıcı Profili.
    - Bağlamsal ikinci menü (224px / `w-56`): Seçili global alana göre değişen ikincil menü (`jobs` için 6 durum filtresi; `portfolio`, `comms`, `reports`, `settings` için ilgili menü öğeleri); bir iş açıldığında ise iş başlığı, durumu, şehri, "İşler Listesine Dön" geri butonu ve 9 sabit iş grubu.
    - İş içi bağlamdan firma genelindeki kilit alanlara tek tıkla geçiş için alt bölümde "Firma B Global" hızlı erişim alanı (`company-communications`, `people`, `accounting`, `settings`).
    - Erişilebilirlik ve test tam uyumluluğu için `aria-label={t("shell.srMenu")}` ("Ana menü") sağlandı.
  - `src/components/maven/views/jobs-view.tsx`:
    - Firma B portföyündeki tüm organizasyonları listeleyen zengin "İşler ve Organizasyonlar" ana ekranı.
    - Arama ("İş adı, şehir veya kurum ara...") ve yaşam döngüsü filtreleme sekmeleri (Tümü, Aktif, Planlanan, Dikkat Gereken, Tamamlanan, Arşiv).
    - Tamamlanmamış kurulum adımları ve yayına hazırlık gerektiren taslaklar için "Dikkat Gerekenler" uyarı şeridi.
    - Kart görünümü (Grid) ve Liste görünümü (Table) arasında tek tıkla geçiş imkanı.
    - Her iş kartında: İş adı, tür/seri, yaşam döngüsü durumu rozeti, tarih aralığı, şehir/mekân, açık yetenek/modül sayısı, yayınlanma durumu (Yayında / Taslak).
    - Hızlı eylem butonları: "İşi Aç" (İş Özeti kokpitine geçer), "Kurulum" (Kurulum kontrol listesini açar), "Ayarlar" (İş Ayarları modülüne geçer), "Yeni İş Başlat" ve "Yeni Etkinlik".
  - `src/components/maven/shell.tsx` ve `src/components/maven/views/editions.tsx`:
    - Masaüstü `<aside>` ve mobil `<SheetContent>` içinde `DualSidebar` birincil gezinme bileşeni olarak entegre edildi.
    - `EditionsView` içinde `JobsView` portföy görünümü, `SetupChecklistCard` ve mevcut etkinlik oluşturma sihirbaz diyaloğu kusursuz şekilde birleştirildi.
    - `store.ts` içinde `openEditionWizard()` çağrısının `module: "editions"` durumunu da garantiye alması sağlandı.
  - `specs/007-global-shell-and-jobs-view/`: `spec.md`, `plan.md`, `tasks.md` dokümantasyonu oluşturuldu ve tüm görevler tamamlandı.
  - `tests-mini/global-shell-and-jobs-view.test.mjs`: 4 adet kapsamlı sözleşme testi yazıldı ve `package.json`'a eklendi.

### Faz 3 — İş Shell'i ve İş Özeti (Cockpit) (`12-PRODUCT-TRANSFORMATION-ROADMAP.md`)
- **Yapılan Değişiklikler:**
  - `src/components/maven/views/work-summary-view.tsx`:
    - Karar ve operasyon odaklı İş Özeti (Cockpit) ekranı hayata geçirildi.
    - İş kimliği, serisi/türü, durum rozeti, tarih/mekân bilgileri ve hızlı eylem butonları (Yenile, Kurulum Kontrolü, Dış Deneyim Önizleme).
    - Kurulum Hazırlığı Denetimi (% ve blokaj/uyarı listesi) ve blokaja tıklandığında ilgili modüle doğrudan yönlendirme (`forms`, `finance`, `registrations`, `program`, `editions`).
    - Bekleyen Kararlar ve Onaylar paneli (Onay bekleyen kayıtlar, ikinci onay bekleyen manuel ödemeler, geciken hakem incelemeleri, oturum bekleyen bildiriler, teslimat bekleyen sponsorluklar, açık operasyonel görevler).
    - Yalnız bu işte etkin modüllerin durum kartları (Kayıt, Program, Bilimsel, Sponsorluk, Saha, Konaklama, Portallar) — kapalı modüller gösterilmez.
    - Finans ve Bütçe Özeti (Sipariş Edilen, Tahsil Edilen, İade Edilen, Açık Bakiye).
    - 14 Günlük Kayıt Başvuru Trendi ve Kayıt Kanalları Dağılım Grafikleri.
    - Yaklaşan Görevler ve Son Hareketler Akışı.
    - Arşivlenmiş ve tamamlanmış işler için Kapanış ve Mali Mutabakat modu (`ARCHIVED`, `POST_EVENT`, `RECONCILIATION`).
  - `src/components/maven/views/dashboard.tsx`:
    - Edisyon seçili olduğunda `WorkSummaryView` render edilir, seçili edisyon yokken genel portföy görünümü korunur.
  - `src/app/api/dashboard/route.ts`:
    - Edisyon kapsamında `upcomingTasks` sorgusu eklendi ve JSON yanıtına dahil edildi.
  - `src/i18n/_new/dashboard.tr.json` ve `dashboard.en.json`:
    - `workSummary` namespace'i altında tüm etiketler tanımlandı; hardcoded metin tarayıcısı 0 ihlalle korundu.
  - `specs/008-work-shell-and-work-summary/`:
    - `spec.md`, `plan.md`, `tasks.md` eksiksiz tamamlandı.
  - `tests-mini/work-shell-and-work-summary.test.mjs`:
### Faz 4 — Yeni İş Wizard'ı ve İlk Kurulum Akışı (`12-PRODUCT-TRANSFORMATION-ROADMAP.md`)
- **Yapılan Değişiklikler:**
  - `src/components/maven/forms/new-work-wizard.tsx`:
    - 8 adımlı mantıksal, 3 aşamalı koşullu diyalog akışı:
      1. İş Grubu Seçimi (`EVENT_ORG`: Etkinlik ve Organizasyon, `TRAVEL_CLIENT`: Seyahat ve Müşteri İşi, `SPECIAL_WORK`: Özel İş ve Proje).
      2. İş Türü & Şablon Seçimi: 6 ana şablon (`SCIENTIFIC_CONGRESS`, `TRADE_FAIR`, `CORPORATE_EVENT`, `SPECIAL_GALA`, `TRAVEL_GROUP`, `CUSTOM_PROJECT`) ve temel kimlik alanları (Seri/Çatı adı, Görünen iş adı, Edisyon/Kod etiketi, Açıklama).
      3. Tarih ve Lokasyon: Başlama tarihi (zorunlu), Bitiş tarihi (seçimli, >= başlangıç), Şehir, Mekân/Rota, Zaman Dilimi. P3.11 test sözleşmesiyle `#editions-wizard-start`, `#editions-wizard-end`, `#editions-wizard-city`, `#editions-wizard-date-error` id ve aria öznitelikleri eksiksiz korundu.
      4. Müşteri & Paydaş Seçimi: Firma B Kendi İşi (`OWN_WORK`) vs Müşteri İşi (`CLIENT_WORK`), müşteri kurumu ve rolü.
      5. İş Profili: Bireysel/Grup (`scale`), Standart/VIP (`tier`), Genel/Özel (`access`).
      6. Yetenekler & Modüller: Şablon bazlı otomatik önerilen modüller (`TEMPLATES`), tek tıkla "Tümü", "Temizle", "Şablon Önerisi" kontrolleri.
      7. Departman & Ekip: Sorumlu departman ve ekip ataması.
      8. Gözden Geçirme ve Taslak Oluşturma: "Taslağı Oluştur" (`createDraft`) butonu.
    - Taslak oluşturma tamamlandığında otomatik olarak `setCurrentEdition(id)` ve `setModule("dashboard")` yapılarak doğrudan İş Özeti (Cockpit) ekranına yönlendirilir.
  - `src/lib/constants.ts`:
    - `TEMPLATES` nesnesine eksik 3 yeni şablon (`SPECIAL_GALA`, `TRAVEL_GROUP`, `CUSTOM_PROJECT`) eklendi ve tüm 6 şablon eksiksiz tanımlandı.
  - `src/components/maven/views/editions.tsx`:
    - `NewWorkWizard` bileşeni `EditionsView` içerisine temiz durum yönetimi ve sıfır-kiracı (`needOrg`) korumasıyla entegre edildi.
  - `src/i18n/_new/editions.tr.json` ve `editions.en.json`:
    - Sihirbaz için gerekli tüm etiketler (`wizardTitle`, `workGroupLabel`, `dateAndLocationLabel`, `stakeholderLabel`, `profileDimensionsLabel`, `capabilitiesLabel`, `teamLabel`, `createFailed`, vb.) sözlüklere eklendi.
  - `specs/009-new-work-wizard-and-setup/`:
    - `spec.md`, `plan.md`, `tasks.md` dokümantasyonu oluşturuldu ve tüm görevler tamamlandı.
  - `tests-mini/new-work-wizard-and-setup.test.mjs`:
    - 5 adet sözleşme ve kural testi (Şablonlar, Tarih Doğrulama, İş Grupları, İş Profili, Kurulum Sonrası Akış) yazıldı ve `package.json`'a eklendi.

### Faz 5 — Portföy, İlişkiler ve Firma Yönetimi (`12-PRODUCT-TRANSFORMATION-ROADMAP.md`)
- **Yapılan Değişiklikler:**
  - `src/components/maven/views/portfolio-view.tsx`:
    - Firma B'nin tüm işler üstü ilişki ve portföy havuzunu yöneten birleşik `PortfolioView` bileşeni oluşturuldu.
    - 4 Sekmeli Yapı:
      1. Kişiler (`PeopleView`): Tüm portföy kişileri, VIP/konuşmacı/katılımcı/yetkili ana kayıtları.
      2. Kurumlar (`OrganizationsView`): Şirketler, dernekler, üniversiteler, sponsorlar.
      3. Müşteriler (`ClientsPortfolioView`): Müşteri hesapları, bağlı işler portföyü ve müşteri portal yetki durumu.
      4. İş İlişkileri (`RelationshipsMatrixView`): Bir kişi veya kurumun farklı işlerdeki rolleri matrisi (`CLIENT`, `HOST`, `SPONSOR`, `SUPPLIER`, `STAFF`).
    - Kavramsal Ayrım: "Portföy Ana Kaydı (Global) ≠ İş Katılımı (İş)" ilkesi UI bilgilendirme kartı ve rozetlerle güçlendirildi.
    - Portföy Sağlık ve KPI Metrikleri: Toplam Kişiler, Kurumlar, Müşteri Hesapları, İş Katılımları.
  - `src/components/maven/views/company-settings-view.tsx`:
    - Firma B'nin kurumsal ayarlarını yöneten 7 sekmeli `CompanySettingsView` oluşturuldu:
      1. Firma Profili: Kiracı kimliği, firma logosu, ana dil, varsayılan para birimi, iletişim bilgileri.
      2. Çalışanlar ve Ekipler: Firma içi kullanıcı yönetimi, davetler, aktif oturumlar (`UserAdminCard`).
      3. Departmanlar: Kongre & Organizasyon, Fuar & Sergi, Kurumsal Seyahat, Operasyon, Finans & Muhasebe departmanları ve lider atamaları.
      4. Roller ve Erişim: Rol hiyerarşisi (`ORG_OWNER` > `ADMIN` > `STAFF` > `COLLABORATOR` > `OBSERVER`) ve yetki kapsamı.
      5. Genel Şablonlar: 6 varsayılan iş şablonu ve ön tanımlı modül yetenekleri.
      6. İletişim & İzinler: KVKK / İYS ticari elektronik ileti politikaları, onay metinleri, SMS/E-posta sağlayıcıları.
      7. Entegrasyonlar & Uyumluluk: Dışa aktarım merkezi (`ExportHubCard`), sistem duyuruları (`AnnounceAdminCard`), API anahtarları.
  - `src/lib/module-components.tsx`:
    - `portfolio` ve `company-settings` global görünümleri `renderModuleComponent` üzerinden dinamik olarak bağlandı.
    - `MODULE_COMPONENTS` sözleşmesi korunarak `module-coherence.test.mjs` (MC-2) ve hayalet kayıt testleri tam uyumlu hale getirildi.
  - `src/components/maven/navigation/dual-sidebar.tsx`:
    - Global sol şerit `portfolio` ve `settings` (iş bağlamı yokken) tıklamalarında doğrudan `PortfolioView` ve `CompanySettingsView` rotalarına yönlendirildi.
  - `src/i18n/_new/portfolio.tr.json` ve `portfolio.en.json`:
    - `portfolio` ve `companySettings` ad alanları TR ve EN olarak eksiksiz lokalize edildi (0 hardcoded metin ihlali).
  - `specs/010-portfolio-relationships-and-company-management/`:
    - `spec.md`, `plan.md`, `tasks.md` dokümantasyonu oluşturuldu ve tüm görevler tamamlandı.
  - `tests-mini/portfolio-and-company-management.test.mjs`:
    - 5 adet sözleşme testi (Portföy Kavramları, Global Navigasyon Alanı, Modül Kataloğu Kapsamı, Çalışan/Departman/Rol Hiyerarşisi, Modül Bileşen Haritası) yazıldı ve `package.json`'a eklendi.

### Faz 6 — Kişiler, Kayıt ve Formlar (`12-PRODUCT-TRANSFORMATION-ROADMAP.md`)
- **Yapılan Değişiklikler:**
  - `src/lib/store.ts`:
    - `moduleSubView: string | null` state'i eklendi.
    - `setModule(m, subView = null)` ve `setModuleSubView(subView)` fonksiyonları eklendi.
  - `src/components/maven/navigation/dual-sidebar.tsx`:
    - `people_registration` grubu öğeleri alt görünümlere bağlandı:
      - `people-orgs` -> `people`
      - `participants` -> `registrations` (liste)
      - `categories-rights` -> `registrations` (kategoriler ve haklar alt görünümü)
      - `forms` -> `forms` (form merkezi)
      - `approval-center` -> `registrations` (onay bekleyenler filtresi)
      - `import-export` -> `registrations` (içe/dışa aktar paneli)
    - Aktif menü vurgusu `moduleSubView` durumuna duyarlı hale getirildi.
  - `src/components/maven/views/registrations.tsx`:
    - "Kategoriler & Haklar" (`categories`) sekmesi eklendi.
    - Kategori tablosu, doluluk oranları, dahil olan haklar ve rozetleri gösterildi.
    - Yeni Kategori Ekleme / Düzenleme diyaloğu entegre edildi (`POST / PUT /api/registration-categories`).
    - Manuel kayıt (`manualOpen`), Excel aktarımı (`/api/registrations/import`) ve dışa aktarım (`/api/registrations/export`) yüzeyleri korundu.
    - İş kapsamı bilgilendirme bildirimi (`scopeNotice`) eklendi.
  - `src/components/maven/views/form-center.tsx`:
    - Başvuru inceleme çekmecesinde (`SubmissionDetail`) onaylanan formlar için tek tıkla hedef modüle geçiş aksiyonları eklendi:
      - "Kayıt Modülünde Aç" (`setModule("registrations")`)
      - "Kişi 360'ta Aç" (`setModule("people")`)
      - "Finans / Siparişte Aç" (`setModule("finance")`)
  - `src/components/maven/views/people.tsx`:
    - İş bağlamı açıkken (`currentEditionId`) varsayılan kapsam `"event"` olarak başlatıldı.
    - "Portföy Ana Kaydı ≠ İş Katılımı" kapsam bildirimi ve katılım rozetleri eklendi.
    - Portföydeki kişiyi işe ekleme ve işten çıkarma aksiyonları (`toggleEventLink`) bağlandı.
  - `src/i18n/_new/registrations.tr.json` / `.en.json`, `forms.*.json`, `people.*.json`:
    - Tüm yeni UI bileşenleri için sözlük anahtarları eklendi (0 hardcoded metin ihlali).
  - `specs/011-people-registrations-and-forms/`:
    - `spec.md`, `plan.md`, `tasks.md` dokümantasyonu oluşturuldu ve tüm görevler tamamlandı.
  - `tests-mini/people-registrations-and-forms.test.mjs`:
    - 5 adet sözleşme testi yazıldı ve `package.json`'a eklendi.

### Faz 7 — Bilimsel, Program ve Sosyal İçerik (VERIFIED COMPLETE)

- **Amaç:** "Bildiri, hakem, karar ve CME’yi Bilimsel altında grupla. Kabulden oturum/konuşmacıya geçişi belirle. Programı oturum, salon, konuşmacı, çizelge ve yayın akışında düzenle. Sosyal etkinlik/turları aynı iş programıyla ilişkili ayrı katılım alanı yap."
- **Yapılanlar:**
  - `src/components/maven/navigation/dual-sidebar.tsx`:
    - `program_content` grubu altında `scientific`, `program`, `social-tours` modülleri ve alt görünümleri bağlandı.
  - `src/components/maven/views/scientific.tsx` (`ScientificView`):
    - Bildiri (`submissions`), Hakem (`reviews`), Karar Merkezi (`decisions`) ve CME Kredi Defteri (`cme`) tek birleşik 4 sekmeli çalışma alanında gruplandı.
    - `moduleSubView` senkronizasyonu eklendi.
    - Kabul edilen bildirilerde (`status === "ACCEPTED"` veya `ACCEPT_*` kararı) oturum eşleme durumu tespit edildi: "Program Slotu Bekliyor" (`awaitingSlot`) vs "Oturumda Planlandı: {title}" (`slottedInSession`).
    - Kabul edilen bildiriden tek tıkla oturum oluşturma ve sunucu yazarı konuşmacı olarak atama diyaloğu bağlandı (`btnCreateSession`).
    - Oturuma atanmış bildiriler için doğrudan program modülüne geçiş CTA'sı eklendi (`btnViewInProgram`).
    - Hakem değerlendirmeleri özet tablosu, gecikenler göstergesi ve puan/rubrik modalı eklendi.
    - Karar merkezi özet tablosu, beklemedeki bildiriler ve gerekçeli karar aksiyonu eklendi.
    - CME kredi defteri, oturum kredileri tablosu, tür bazlı toplu atama ve resmi CME rapor modalı (`CmeReportOverlay`) eklendi.
  - `src/components/maven/views/scientific.tsx` (`ProgramView`):
    - Oturumlar (`sessions`), Salonlar (`rooms`), Konuşmacılar (`speakers`), Çizelge (`timetable`) ve Yayın Akışı (`broadcast`) sekmeleri oluşturuldu.
    - Salon istatistikleri ve kullanım aralıkları memoized hesaplandı.
    - Konuşmacı ve görevli fihristi oturum atamalarından derlendi.
    - Yayın akışı sekmesinde dış portala açık oturumlar, taslaklar, canlı akış programı ve yayın durumu listelendi.
  - `src/components/maven/views/social.tsx` (`SocialView`):
    - İş programı entegrasyon bilgilendirme bildirimi eklendi (`programIntegrationNotice`).
    - Planlar (`plans`) ve Ayrı Katılım Alanı (LCV) (`attendance`) sekmeleri ayrıştırıldı.
    - Katılım alanında kayıt paketine dahil (`includedInPackage`) ve ek ücretli aktivite (`paidActivity`) ayrımı yapıldı.
    - Katılımcı kontenjanı, onaylanan LCV sayısı ve iş katılımcılarından davet etme aksiyonu eklendi.
  - `src/i18n/_new/scientific.tr.json` / `.en.json`, `social.*.json`:
    - Tüm yeni UI metinleri sözlüklere eklendi (0 hardcoded metin ihlali).
  - `specs/012-scientific-program-and-social-content/`:
    - `spec.md`, `plan.md`, `tasks.md` eksiksiz oluşturuldu ve tüm görevler tamamlandı.
  - `tests-mini/scientific-program-and-social-content.test.mjs`:
    - 6 adet sözleşme testi (Bilimsel Sekmeleri & CME, Kabulden Oturum Köprüsü, Program Sekmeleri & Yayın Akışı, Sosyal & Turlar Katılım Alanı, Dual Sidebar Navigasyonu, Sözlük Bütünlüğü) yazıldı ve `package.json`'a eklendi.

---

## 3. Doğrulama ve Test Kanıtları

### A. Kalite Kapıları (Quality Gates) Kanıtları

```text
1. TypeScript Tip Kontrolü (bun run typecheck):
   $ tsc --noEmit
   Sonuç: Exit 0 (0 HATA)

2. ESLint Kod Denetimi (bun run lint):
   $ eslint .
   Sonuç: Exit 0 (0 HATA, 0 UYARI)

3. Rota Politikası Envanteri (bun run policy:check):
   $ node scripts/route-policy.mjs
   P04.4 - Route Policy Raporu Üretildi: 168/168 sınıflandırıldı.
   Kategori Dağılımı: { PUBLIC: 47, STAFF: 77, ADMIN: 40, DOMAIN_POLICY: 4 }
   Sonuç: Exit 0 (CI PASS)

4. i18n Hardcoded Metin Taraması (bun run i18n:scan):
   $ node scripts/i18n-hardcoded-scan.mjs
   i18n-hardcoded-scan: 112 dosya, 0 ihlal (taban 0)
   ✓ taban korundu — yeni metinler sözlük-öncelikli yazılıyor
   Sonuç: Exit 0

5. Mimari Bağımlılık Denetimi (bun run lint:arch):
   $ depcruise src --config .dependency-cruiser.cjs
   no dependency violations found (535 modules, 2155 dependencies cruised)
   Sonuç: Exit 0

### Faz 8 — Sponsor, Fuar, B2B ve Medya (`12-PRODUCT-TRANSFORMATION-ROADMAP.md`)
- **Gereksinimler:**
  - Sponsor ilişkisinden paket/anlaşma, hak/kontenjan ve teslimata sırayla ilerleme.
  - Stant/Floor Studio tahsisini sponsor hakları ve mekânla bağlama.
  - B2B eşleşme, karşılıklı kabul ve görüşme çizelgesini tek kullanıcı yolculuğuna getirme.
  - Firma marka kitaplığı ve işe ait medyayı ayırma.
  - Sponsor dış portalını Firma B yönetiminden ayrı tutma.
- **Yapılan Değişiklikler:**
  - `src/components/maven/navigation/dual-sidebar.tsx`: `sponsor_exhibition` grubu altındaki `sponsors`, `packages-agreements`, `deliverables-entitlements`, `booths-floors`, `b2b` ve `media` rotaları bağlandı; `moduleSubView` üzerinden etkinleştirildi.
  - `src/components/maven/views/sponsorship.tsx`: 5 aşamalı sıralı sekme (`sponsors`, `packages`, `entitlements`, `deliverables`, `booths`), `moduleSubView` senkronizasyonu, üst kısımda bağımsız Sponsor Dış Portalı bilgilendirme ve açma banner'ı, Floor Studio stant tahsis kuralı bildirimi ve Floor Studio'ya geçiş eklendi.
  - `src/components/maven/views/floors.tsx`: Sponsor hak havuzu ve sözleşmelerle mekân stant alanları arasındaki bağlantıyı açıklayan `sponsorLinkNotice` banner'ı eklendi.
  - `src/components/maven/views/b2b.tsx`: Tek kullanıcı yolculuğu sekme yapısı (`requests`, `mutual`, `timetable`) oluşturuldu. Mobil uygulama yanıtları, organizatör onayı ve zaman çizelgesi tek ekranda toplandı.
  - `src/components/maven/views/media.tsx`: İşe ait medya arşivi ile Firma B ortak marka kitaplığı (`tabWorkMedia` vs `tabBrandLibrary`) sekmeleri eklendi. Firma B kurumsal logo, şablon, tipografi ve basın kiti varlıkları tanımlandı.
  - `src/i18n/_new/`: `sponsorship.tr/en.json`, `floors.tr/en.json`, `b2b.tr/en.json`, `media.tr/en.json` dosyalarına tüm Faz 8 metinleri eklendi (0 hardcoded metin ihlali).
  - `tests-mini/sponsorship-expo-b2b-and-media.test.mjs`: 6 adet karakterizasyon testi yazıldı ve `package.json`'daki `test:unit` paketine eklendi.

### Faz 9 — Mekân, Konaklama, Seyahat ve Saha (`12-PRODUCT-TRANSFORMATION-ROADMAP.md`)
- **Gereksinimler:**
  - İş mekânını İş Bilgileri ve Saha Operasyonu ile bağlama.
  - Konaklama talebi, blok/stok, rezervasyon ve yolcu görünümünü sıralama.
  - Seyahat, transfer ve ek hizmeti talep, sorumlu, teyit ve ifa akışında gösterme.
  - Check-in, tarama, kiosk ve alan operasyonunu saha görünümünde düzenleme.
  - Yaka kartı ve sertifika belgesini katılım ve kişinin dış alanına bağlama.
- **Yapılan Değişiklikler:**
  - `src/components/maven/navigation/dual-sidebar.tsx`: `venue_onsite` (`venues-spaces`, `onsite-operations`, `badges-print`, `certificates-docs`) ve `accommodation_services` (`accommodation`, `travel-transfers`, `extra-services`) alt öğeleri `moduleSubView` ile bağlandı; aktiflik durumları senkronize edildi.
  - `src/components/maven/views/accommodation.tsx`: 4 sekmeli yapı (`hotels`, `reservations`, `rooming`, `transfers`) kuruldu; `moduleSubView` senkronizasyonu sağlandı. Seyahat ve transfer takip konsolu (uçuş kodları, havalimanı, yolcu, şoför/plaka, araç tipi ve durum yaşam döngüsü) entegre edildi.
  - `src/components/maven/views/onsite.tsx`: `OnsiteView` içine işin mekân bilgisi (`editions.venue`) ve mekân planına geçiş aksiyonu (`venueNotice`) eklendi; 4 sekmeli operasyonel yapı (`desk`, `kiosk`, `occupancy`, `cme`) düzenlendi. `CertificatesView` içine katılımcı dış portalı (`/portal/attendee`) erişim bildirimi (`portalLinkNotice`) eklendi.
  - `src/components/maven/views/badge-queue.tsx`: Katılımcı dış portalından dijital QR/kart erişimi ve operasyonel bağımsızlık bildirimi (`portalBadgeNotice`) eklendi.
  - `src/i18n/_new/`: `accommodation-plus.tr/en.json`, `onsite.tr/en.json`, `badge-queue.tr/en.json` dosyalarına tüm Faz 9 metinleri eklendi (0 hardcoded metin ihlali).
  - `tests-mini/venue-accommodation-travel-and-onsite.test.mjs`: 5 adet karakterizasyon ve sözleşme testi yazıldı; `package.json`'daki `test:unit` paketine eklendi.

### Faz 10 — İş İletişimi ve Dış Deneyimler (`12-PRODUCT-TRANSFORMATION-ROADMAP.md`) (VERIFIED COMPLETE)
- **Gereksinimler:**
  - Genel İletişim ile İş İletişimi farkını menü ve kitle seçiminde açık tutma.
  - Genel mobil, kişisel katılımcı, B2B, sponsor/partner ve müşteri-seyahat dış alanlarını ayırma.
  - İş içeriğinden dış yayın akışını tanımlama.
  - Firma vitrini ile iş portalını ayrı kullanıcı işlerinde tutma.
- **Yapılan Değişiklikler:**
  - `src/components/maven/navigation/dual-sidebar.tsx`: `communication_experience` grubu altındaki `work-comms` (`communications`), `external-experiences` (`portals`, `pwa` subview) ve `media` (`media`) rotaları bağlandı; `moduleSubView` üzerinden senkronizasyonu tamamlandı.
  - `src/components/maven/views/onsite.tsx` (`CommunicationsView`): İş kitleleri sınırını ve Firma B Genel İletişimi ile olan ayrımını açıkça bildiren `workScopeNotice` bildirim şeridi ile tek tıkla Firma Genel İletişimine geçiş butonu (`btnOpenCompanyComms` -> `company-communications`) eklendi.
  - `src/components/maven/views/portals.tsx` (`PortalsView`):
    - 5 bağımsız dış deneyim sekmesi kuruldu: `pwa` (Genel Mobil Deneyim / Event App PWA), `attendee` (Kişisel Katılımcı Portalı — bilet, QR, yaka kartı, seanslar, otel rezervasyonu), `b2b` (B2B Eşleşme Portalı — ikili görüşme takvimi, masa planı, randevular), `sponsor` (Sponsor & Partner Portalı — sözleşme hakları, teslimat yükleme, stant bilgisi, personel atamaları), `client` (Müşteri & Kurum Portalı — kurumsal delege kotaları, onaylar, cari mutabakat).
    - `moduleSubView` senkronizasyonu React 19 uyumlu `setTimeout` ile bağlandı (`pwa`, `attendee`, `b2b`, `sponsor`, `client`, `ayarlar`, `vitrin`).
    - Firma B kurumsal vitrini ile bu işin portalları arasındaki izolasyonu bildiren `showcaseIsolationNotice` şeridi ve vitrin önizleme butonu eklendi.
    - İş içeriğinden dış yayın akışı paneli (`PublishStatusCard`) eklendi: Program, Konuşmacılar, Sponsorlar ve Kayıt Formlarının anlık yayınlanma durumları (`PUBLISHED` vs `DRAFT`) ve canlı dış portalı açma kestirmesi bağlandı.
  - `src/i18n/_new/`: `communication.tr/en.json`, `portal.tr/en.json`, `tr.json`, `en.json` dosyalarına tüm Faz 10 sözlük anahtarları eklendi ve `i18n.ts` içine entegre edildi (0 hardcoded metin ihlali, 112 dosya).
  - `tests-mini/work-communications-and-external-experiences.test.mjs`: 4 adet karakterizasyon ve sözleşme testi yazıldı; `package.json`'daki `test:unit` paketine eklendi.

### Faz 11 — Finans, Raporlar ve İş Yaşam Döngüsü (`12-PRODUCT-TRANSFORMATION-ROADMAP.md`)
- **Kapsam:**
  - Sipariş/ödeme/iade/ek hizmeti; defter/gelir/gider/mutabakatı farklı kullanıcı görünümlerine ayırma.
  - İş Raporları ve Firma Raporları kapsamını düzenleme.
  - Raporlardan kaynak iş/modüle dönüş sağlama.
  - Taslak → planlanan → aktif → tamamlanan → arşiv yaşam döngüsünü tüm iş türlerine uyarlama.
- **Yapılan Değişiklikler:**
  - `src/lib/product-taxonomy.ts`:
    - 5 aşamalı `MACRO_LIFECYCLE_STAGES` (`DRAFT`, `PLANNING`, `ACTIVE`, `COMPLETED`, `ARCHIVED`) tanımlandı ve `getMacroLifecycleStage(status: string)` dönüşüm fonksiyonu eklendi.
    - `PRODUCT_MODULE_CATALOG` içine `company-reports` modül tanımı eklendi.
  - `src/components/maven/views/company-reports-view.tsx`:
    - Firma B Global Raporlar alanı için 6 sekmeli (`works-report`, `portfolio-report`, `finance-report`, `operations-report`, `comms-report`, `exports-report`) kurumsal raporlama panosu oluşturuldu.
    - İş portföyü ve çapraz iş finans karşılaştırması tablosu eklendi; her iş satırından "İş Özetine Git", "İş Finansına Git", "İş Defterine Git", "Katılımcılara Git" derin bağlantıları kuruldu.
    - React 19 uyumlu `moduleSubView` senkronizasyonu sağlandı.
  - `src/lib/module-components.tsx`:
    - `CompanyReportsViewDyn` dinamik bileşeni kaydedildi ve `company-reports` ile `reports` modül anahtarlarıyla bağlandı.
  - `src/components/maven/navigation/dual-sidebar.tsx`:
    - Global `reports` alanı tıklandığında `company-reports` modülüne yönlendirme yapıldı; ikincil menü sekmeleri `moduleSubView` ile senkronize edildi.
    - Firma B Global hızlı erişim listesine `company-reports` eklendi.
    - İşe özel `work_reports` grubu (`work-finance-reports`, `work-reg-reports`, `work-sponsor-reports`) için sırasıyla `accounting` (defter), `registrations` (raporlar) ve `sponsorship` (roi) yönlendirmeleri ve aktiflik vurguları tamamlandı.
  - `src/components/maven/views/finance.tsx` & `src/components/maven/views/accounting.tsx`:
    - `finance.tsx`: Operasyonel tahsilat/ödeme kapsamı bildirim şeridi eklendi; "Mali Defter & Mutabakat Görünümüne Git" butonu bağlandı; SoD >50.000 TL çift yetkili onay denetim uyarısı belirginleştirildi.
    - `accounting.tsx`: Kurumsal defter/gelir/gider kapsam bildirim şeridi eklendi; "Operasyonel Finansa Dön" ve "İş Özetine Dön" butonları bağlandı. Mutabakat (`recon`) sekmesinde "İş Kapanış Mutabakatı Sertifikası" ve `ARCHIVED` aşama geçiş eylemi bağlandı.
  - `src/components/maven/views/jobs-view.tsx` & `src/components/maven/views/work-summary-view.tsx`:
    - `jobs-view.tsx`: 5 makro yaşam döngüsü filtresi (`DRAFT`, `PLANNING`, `ACTIVE`, `COMPLETED`, `ARCHIVED`) eklendi; iş kartları ve tablosunda edisyon durumunun yanında makro aşama rozeti gösterildi.
    - `work-summary-view.tsx`: Başlıkta makro aşama rozeti ve 5 aşamalı yaşam döngüsü ilerleme göstergesi yerleştirildi.
  - `src/i18n/_new/reports.tr.json` & `reports.en.json`:
    - Tüm Faz 11 metinleri `tr.json`, `en.json` ve `i18n.ts` içine entegre edildi (`modules["company-reports"]`, `companyReports`, `workReports`, `financeView`, `accountingView`, `lifecycle`).
    - `bun run i18n:scan`: 113 dosya, 0 ihlal.
  - `tests-mini/finance-reports-and-work-lifecycle.test.mjs`:
    - 5 adet karakterizasyon ve sözleşme testi yazıldı; `package.json`'daki `test:unit` paketine eklendi.

---

## 3. Doğrulama ve Kanıt Çıktıları

### A. Kalite Kapıları (Quality Gates) Kanıtları

```text
1. TypeScript Tip Denetimi (bun run typecheck):
   $ tsc --noEmit
   Sonuç: Exit 0 (Hatasız, 0 tip hatası)

2. ESLint Statik Kod Analizi (bun run lint):
   $ eslint .
   Sonuç: Exit 0 (0 Hata, 0 Uyarı)

3. Rota Güvenlik Politikası Denetimi (node scripts/route-policy.mjs):
   Toplam Rota: 168 | Eksik: 0
   Kategori Dağılımı: { PUBLIC: 47, STAFF: 77, ADMIN: 40, DOMAIN_POLICY: 4 }
   Sonuç: Exit 0 (CI PASS)

4. i18n Hardcoded Metin Taraması (bun run i18n:scan):
   $ node scripts/i18n-hardcoded-scan.mjs
   i18n-hardcoded-scan: 113 dosya, 0 ihlal (taban 0)
   ✓ taban korundu — yeni metinler sözlük-öncelikli yazılıyor
   Sonuç: Exit 0

5. Mimari Bağımlılık Denetimi (bun run lint:arch):
   $ depcruise src --config .dependency-cruiser.cjs
   no dependency violations found (540 modules, 2173 dependencies cruised)
   Sonuç: Exit 0

6. Birim Test Paketi (bun run test:unit):
   $ node --test tests-mini/*.test.mjs
   ℹ tests 448
   ℹ suites 0
   ℹ pass 448
   ℹ fail 0
   Sonuç: Exit 0 (448/448 BAŞARILI)

7. Konsolide Kalite Raporu (node scripts/quality-report.mjs):
   Toplam: 4 kapı | Geçti: 4 | Başarısız: 0 | Süre: 34987ms
   [PASS] Tüm kalite kapıları başarıyla tamamlandı.
   Sonuç: Exit 0
```

### B. Playwright E2E Test Koşuları Kanıtları

```text
1. Smoke & Health Gate (bun run test:smoke):
   Proje profilleri: demo-auth-off, staff-auth-on, participant-auth-on
   Sonuç: 9 passed (2.3s)

2. E2E UI Düzeltmeleri (bun run test:e2e:ui):
   - tests/ui-corrections.spec.ts (P3.9, P3.10, P3.11, P3.12, P3.13, P4.14 × 3 profil = 18 test)
   Sonuç: 18 passed (25.9s)
```

---

## 4. Yerel Çalışma Durumu

- **Proje Portu:** `http://localhost:3005`
- **Sağlık Durumu (`/api/health`):** HTTP 200 OK, `db.ok: true`, `version: "task-b"`.
- **Port Ayrımı:** Port 3000 (`FloorEditor_v2`) ve Port 3001 (`FloorPlanStudio`) çakışmalarını önlemek amacıyla proje yerel sunucusu ve E2E test konfigürasyonu Port 3005 üzerinde çalışacak şekilde izole edilmiştir.

---

## 5. Faz 12 Doğrulama Kanıtları — Birleşik Ürün Dili ve Gezinme (Final Ürün Fazı)

### A. Ürün Kapsamı ve Mimari Çözüm
1. **Taksonomi ve Ürün Bağlam Kapsamları (`src/lib/product-taxonomy.ts`):**
   - 4 net bağlam kapsamı tanımlandı: `GLOBAL_COMPANY` (Firma B Global Portföy & Ayarlar), `WORK_WORKSPACE` (Seçili İşe Özel Çalışma Alanı), `PLATFORM_OPERATOR` (Sistem Yönetimi), `EXTERNAL_EXPERIENCE` (PWA Dış Deneyim & Portallar).
   - `getProductContextScope(moduleId: string)` ile her modülün bağlamı deterministik olarak çözümlendi.
   - `WORK_CONTEXT_BRIDGES`: Her iş modülünden 5 omurga alana (Özet, Kurulum, İletişim, Dış Deneyimler, Raporlar) doğrudan tek tıkla geçiş köprüsü tanımlandı.
2. **Çapraz Modül Gezinme Köprüsü (`src/components/maven/navigation/module-context-bridge.tsx`):**
   - Kompakt, responsive ve erişilebilir context bridge bileşeni geliştirildi.
   - Breadcrumb ve durum rozetleriyle iş bağlamı görünür kılındı.
   - Mobilde taşmayı önlemek için `shell.tsx` içinde `hidden sm:block` ve `max-w-full overflow-hidden` koruması eklendi.
3. **Dual Sidebar ve Üst Şerit (`src/components/maven/navigation/dual-sidebar.tsx`, `src/components/maven/shell.tsx`):**
   - İkincil panelde "İş Modülleri" ve "Firma Globali" arasında hızlı sekme (`tablist`) geçişi eklendi.
   - Header breadcrumbs: `[Tenant] > [Firma B Global] > [Modül]` veya `[Tenant] > [İş Adı] > [Modül]` formatına dönüştürüldü.
4. **Sözlük Paritesi (TR & EN):**
   - `src/i18n/_new/unified-nav.tr.json` ve `src/i18n/_new/unified-nav.en.json` dosyaları `FRAGMENTS` sistemine entegre edildi.
   - `src/i18n/tr.json` ve `src/i18n/en.json` sözlüklerinde tam eşlik sağlandı.

### B. Otomasyon ve Kalite Kapıları Kanıtları (Taze Kanıtlar)

```text
1. TypeScript Tip Kontrolü (bun run typecheck):
   $ tsc --noEmit
   Sonuç: Exit 0 (0 hata)

2. ESLint Statik Analiz (bun run lint):
   $ eslint .
   Sonuç: Exit 0 (0 uyarı/hata)

3. Mimari Bağımlılık Denetimi (bun run lint:arch):
   $ depcruise src --config .dependency-cruiser.cjs
   ✔ no dependency violations found (543 modules, 2185 dependencies cruised)
   Sonuç: Exit 0 (0 ihlal)

4. i18n Hardcoded Metin Taraması (bun run i18n:scan):
   $ node scripts/i18n-hardcoded-scan.mjs
   i18n-hardcoded-scan: 114 dosya, 0 ihlal (taban 0)
   ✓ taban korundu — yeni metinler sözlük-öncelikli yazılıyor
   Sonuç: Exit 0 (0 ihlal)

5. Birim Test Paketi (bun run test:unit):
   $ node --test tests-mini/*.test.mjs
   ℹ tests 453
   ℹ suites 0
   ℹ pass 453
   ℹ fail 0
   Sonuç: Exit 0 (453/453 BAŞARILI, Faz 12 testi 5/5 dahil)

6. Playwright Smoke Testleri (bun run test:smoke):
   $ playwright test tests/smoke.spec.ts
   9 passed (2.4s) - 3 profil (demo-auth-off, staff-auth-on, participant-auth-on)
   Sonuç: Exit 0 (9/9 BAŞARILI)

7. Playwright E2E UI Testleri (bun run test:e2e:ui):
   $ playwright test tests/ui-corrections.spec.ts
   18 passed (28.2s) - 3 profil (demo-auth-off, staff-auth-on, participant-auth-on)
   Sonuç: Exit 0 (18/18 BAŞARILI, P3.9-P3.13 ve P4.14 a11y+390px dahil)

8. Konsolide Kalite Raporu (bun run quality):
   $ node scripts/quality-report.mjs
   typecheck: PASS (2646ms)
   lint: PASS (25167ms)
   i18n: PASS (82ms)
   tests:mini: PASS (6301ms)
   Toplam: 4 kapı | Geçti: 4 | Başarısız: 0
   Sonuç: Exit 0
```


