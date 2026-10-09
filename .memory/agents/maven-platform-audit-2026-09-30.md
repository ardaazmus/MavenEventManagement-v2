# Maven Event Management v2 — Salt Okunur Platform Hafızası ve Güncel Kod Denetimi

**Denetim tarihi:** 2026-09-30  
**İncelenen checkout:** `D:\project\MavenEventManagment_v2`  
**Commit:** `99729c886c2d41d759a603e4d39c128ce2254b83` (`main`, `origin/main` ile aynı)  
**İnceleme türü:** Kaynak kodu, şema, statik kapılar ve güvenli test çalıştırması. Bu çalışmada ürün kodu, yapılandırma, veritabanı veya test dosyaları değiştirilmemiştir. Yalnızca bu hafıza raporu oluşturulmuştur.

> Bu belge mevcut checkout için kanıt kaydıdır. Başka bir sürüme geçildiğinde sayılar, dosya yolları ve bulgular yeniden doğrulanmalıdır. Eski raporlar geçmiş bağlamdır; güncel kanıt yerine kullanılmamalıdır.

## 1. Denetim kapsamı ve kanıt sınırları

İncelenen başlıca yüzeyler:

- Uygulama kökü, paket komutları, çalışma yapılandırması ve yerel sağlık ucu.
- Prisma veri modeli ve tenant/event/participant/organization/role ilişkileri.
- UI modül kayıt defteri, sunucu API izin sözlüğü ve tenant kapsam korumaları.
- SaaS provizyon/abonelik uçları, event oluşturma akışı, sponsor ve katılımcı portalları.
- Kayıt, iletişim/CRM, bilimsel program, sponsorluk, finans, konaklama, saha ve PWA alanları.
- Statik kalite kapıları ve güvenli mini test paketi.

**Çalıştırılmayanlar:** Aktif `http://127.0.0.1:3000` çalışma alanına yazabilecek Playwright uçtan uca testleri başlatılmadı. Playwright yalnızca listeleme modunda tarandı; test çalıştırması değildir. `next build` de mevcut sunucunun kullandığı `.next` çıktılarını etkileyebileceğinden çalıştırılmadı. Bu nedenle bu rapor canlı UI akışlarının tamamına veya production dağıtımına onay vermez.

## 2. Güncel proje envanteri

Denetim anındaki kaynak envanteri:

- 27 UI modülü, `src/lib/constants.ts` içindeki `MODULES`.
- 26 sunucu `MODULE_IDS` ve API entity-to-module sözlüğü, `src/lib/api/permissions.ts`.
- 164 API route dosyası.
- Prisma şemasında 126 model.
- 47 Playwright spec dosyası; `bunx playwright test --list` 798 test kaydı listeliyor. Bu sayı çalıştırılmış/geçmiş test sayısı değildir.
- 76 bağımsız birim test dosyası bilgisi önceki envanter sayımından geliyor; güncel paket komutu `package.json` içinde `tests-mini` dosyalarını tek tek seçerek çalıştırıyor.

### 2.1 UI modül haritası

UI kayıt defteri 7 iş grubuna ayrılmış durumda:

| Grup | Modüller | İşlevsel kapsam |
|---|---|---|
| Genel bakış | `dashboard`, `operations`, `archive` | Portföy/etkinlik görünümü, görev ve operasyon, geçmiş edisyonlar |
| Kurulum | `editions`, `settings`, `portals`, `compliance`, `integrations` | Etkinlik/edisyon, şirket ayarları, portal, uyum/KVKK, entegrasyonlar |
| CRM | `people`, `organizations`, `communications`, `company-communications` | Kişi ve kurum portföyü, etkinlik iletişimi ve tenant çapında müşteri iletişimi |
| Kayıt ve finans | `registrations`, `forms`, `finance`, `accounting` | Kayıt kategorileri, form yanıtları, sipariş/tahsilat/iade, muhasebe |
| Bilim ve program | `scientific`, `program`, `social` | Bildiri/değerlendirme, oturum-program, sosyal etkinlik/tur |
| Etkileşim | `sponsorship`, `b2b`, `floors`, `media` | Sponsor/fuar, eşleştirme/görüşme, Floor Studio bağlantısı, medya varlıkları |
| Lojistik | `accommodation`, `onsite`, `badges`, `certificates` | Otel/oda, check-in/saha, yaka kartları, sertifika/belgeler |

UI modül açıklamaları, rol matrisi ve event capability ilişkilendirmeleri `src/lib/constants.ts` içindedir. `company-communications` açıkça UI-only alias olarak tanımlanmıştır; API yetkisi `communications` / `customer-contacts` üzerinden yürür. Bu tasarım belgelenmiş olmakla birlikte UI ve API modül kimliklerinin birebir eşleşmediği için regresyon testlerinde ayrıca korunmalıdır.

### 2.2 Temel veri ve sahiplik akışı

Kaynakta görülen ana model:

```text
Tenant (B benzeri platform müşterisi/işletme alanı)
├── User + RoleDefinition + RolePermission + UserRoleAssignment
├── Organization + OrganizationContact       (tenant CRM portföyü)
├── Person                                     (tenant kişi portföyü)
├── EventSeries                                (etkinlik markası/serisi)
└── EventEdition                               (belirli etkinlik edisyonu)
    ├── EventCapability                       (etkinlikte açılan yetenek/modül)
    ├── EventOrganizationAssignment            (etkinlikteki kurum rolü)
    ├── EventParticipation → Person            (etkinlik katılımı)
    │   ├── Registration / FormAnswer / RoleAssignment
    │   ├── Badge / Credential / Certificate / Reservation
    │   └── OrderLine / EntitlementClaim
    ├── SponsorAgreement → Organization
    ├── FormDefinition / Submission
    ├── Program / Scientific / B2B / Social / Task
    └── PortalToken / PortalConfig / PortalSession
```

`CustomerContact` ayrıca tenant çapında müşteri iletişim havuzudur; `sourceEditionId` yalnız kaynak künyesi olarak tutulur. Bu, katılımcı listesinden farklı CRM portföyünün modelde karşılığı olduğunu gösterir. `EventParticipation` ise etkinlik-kişi ilişkisini temsil eder; aynı kişi profilini birden fazla edisyonda tekrar kullanmaya elverişlidir.

### 2.3 Şirket/platform ve etkinlik yetenekleri

- `Tenant` içinde firma adı, slug, ülke/saat dilimi, şirket logosu, slogan, iletişim ve web sitesi alanları bulunuyor.
- `EventSeries` ve `EventEdition` için ayrı logo/header ve portal başlık/görsel/renk alanları bulunuyor. Etkinlik kimliğinin tenant logosundan ayrı tutulması veri modelinde destekleniyor.
- `EventCapability` edisyon bazında açma/kapama ve `setupNote` tutuyor. Şablonlar ilk capability önerisini oluşturuyor.
- `TenantSubscription` plan/statü/fiyat/dönem/fatura/deneme kotası yönetiyor; kod yorumları ve abonelik uçları bu aşamanın manuel olduğunu söylüyor.
- `saas/provision` ayrı `MAVEN_SUPERADMIN_KEY` kapısı ve rate limit ile tenant provision edebiliyor.
- Bu checkout’ta tenant düzeyinde ürün modül yetkilerini (A’nın B’ye hangi modülleri açtığı) taşıyan açık bir `TenantModuleEntitlement` benzeri ilişki veya A’nın tenantları yönettiği tam bir uygulama ekranı doğrulanamadı. `Tenant.plan` ve event-level `EventCapability`, bu yetki sözleşmesinin yerine geçtiği anlamına gelmez.

## 3. Modül ve iş akışı kapsama değerlendirmesi

| Alan | Kodda görülen mevcut karşılık | Denetim notu |
|---|---|---|
| Etkinlik oluşturma | `src/components/maven/views/editions.tsx`: şablon/seri ve adlar, tarih/şehir/mekân, capability seçimi; event create API | Mevcut sihirbaz 3 adımdır. Dosya yorumu daha geniş kurulumun ilk 3 adımını işaret ediyor. Müşteri/etkinlik sahibi ilişkisi, ekip yetkileri, portal kimliği ve yayın kontrolü bu ilk oluşturma sihirbazında tamamlanmıyor; bazıları sonradan ayrı ekranlarda mevcut. |
| Kişi ve kurum portföyü | `Person`, `Organization`, `OrganizationContact`, `CustomerContact`; kişi/kurum CRUD, XLSX/CSV içe aktarma, merge preview, vCard | CRM portföyü ve etkinlik katılımı ayrı kavramlar olarak modellenmiş. İçe aktarma eşleştirme/önizleme akışları test kapsamına sahip. |
| Katılımcı / grup / roller | `EventParticipation`, `Registration`, davet/LCV, `EventRoleAssignment`, `CustomRole`, delegasyon ve companion modelleri | Standart ve etkinlik-özel katılımcı rolleri mevcut. Bunlar Firma B personel rolüyle veya etkinlikteki tüzel kişi rolüyle karıştırılmamalı. |
| Formlar | `FormDefinition`, `FormField`, `FormSubmission`, `FormAnswer`; alan sıralama, public submission ve export uçları | Koşullu form mantığı ve form merkezi var. E2E listesinde UI placeholder ve temel akış testleri mevcut; bu denetimde canlı akış koşulmadı. |
| E-posta/CRM kampanyaları | `CustomerContact`, tenant/event mail şablonları, consent, send decision, IYS outbox ve campaign uçları | Firma portföyü, katılımcı aktarımı ve rıza/kanal yönetimi için kod mevcut. Harici e-posta/SMS/WhatsApp sağlayıcısı başarıları yalnız yerel kod/test kanıtıyla doğrulanabilir; canlı sağlayıcı teslimatı bu denetimin kapsamı dışında. |
| Sponsorluk/fuar | Tier, package, agreement, deliverable, booth, entitlement/claim, sponsor personel, lead capture, meeting, availability, ROI/benchmark | Sponsor portalı kurum/edisyon kapsamı ve opsiyonel agreement scope kullanıyor. Hak havuzu `Entitlement` modeliyle kurum/kişi sahibine bağlanıyor. Anlaşma kapsamlı token ile kurum-geneli kaynakların kapsam uyumu ayrıca kontrol edilmeli (bulgu F-04). |
| Bilim/program | Bildiri, yazar, track, review assignment, review/decision; room/session/program assignments; CME raporları | Ayrı modüller ve rol tabanlı yönetim mevcut. Bilimsel double-blind iddiası kaynakta belirtiliyor; bu denetim kurulmuş gerçek veride anonimliği uçtan uca test etmedi. |
| Finans | `Order`, `OrderLine`, `Payment`, `Refund`; minor-unit para sözleşmesi; transaction/lock ile tekrar ödeme/iade korumaları | İade ve manuel ödeme bakiyesi için transaction/seri işleme kodu bulunuyor. Büyük tutarda ikinci onay semantiği API/UI arasında bozuk (F-01). Finans ekranının liste/KPI kapsamı 200 siparişle sınırlı (F-02). |
| Konaklama | Otel, oda türü/blok, gece stoğu, rezervasyon/occupancy, roommate request | Edisyon kapsamına bağlı; kaynakta teyit ve stok idempotency testleri var. Canlı çok kullanıcılı yük ve gerçek otel sağlayıcıları test edilmedi. |
| Saha / yaka / sertifika | Credential, scan event, badge profile/design/instance, certificate definition/issue | UI ve API modülleri mevcut. Cihaz çevrimdışı senaryosu PWA kuyruğu seviyesinde var; gerçek cihaz/etiket yazıcı entegrasyonu bu denetimde çalıştırılmadı. |
| Medya / arşiv | Tenant/edition medya klasörleri, yükleme, iş kuyruğu ve indirme tokenları | Dosya tipi/URL/containment ve export testleri mevcut. Depolama sağlayıcısı, disk/volume dayanıklılığı veya production retention doğrulanmadı. |
| Katılımcı PWA/portal | Dinamik manifest, service worker, çevrimdışı HTML fallback, kurulum ekranı, katılımcı ve sponsor portal UI/API, offline mutation kuyruğu, cüzdan uçları | Teknik PWA yüzeyi kapsamlıdır; yerel IndexedDB mutation queue var. Service worker API yanıtlarını cache etmiyor. Bu, uygulamanın native uygulama olduğu anlamına gelmez. Kullanıcının tarif ettiği “admin ekranının devamı gibi duran” görsel deneyim ürün/UX çalışması olarak hâlâ ayrı değerlendirilmelidir; bu denetimde cihazda görsel test yapılmadı. |
| Yetkilendirme | UI rol filtreleri, 26 modüllü API sözlüğü, tenant-scope korumaları, DB role/permission modeli ve legacy fallback | UI görünürlüğü güvenlik sınırı değildir; sunucu kontrolü de mevcut. Aşağıda auth-off ve rol/tenant modelinin çok-kiracılı üretim konfigürasyonundaki riskleri kaydedilmiştir. |

## 4. Doğrulanmış bulgular ve riskler

### F-01 — P1: Büyük manuel tahsilatta ikinci onay uygulanmıyor

**Kanıt:** `src/components/maven/views/finance.tsx` başarı mesajı 50.000 TL üstü için “ikinci onay istenir” diyor ve ayrı “Manuel Teyit Bekleyen” KPI’sı `Payment.status === PENDING` kayıtlarını sayıyor. Buna karşılık `src/app/api/flows/route.ts` içindeki `finance.manualPayment` aynı sipariş transaction’ında ödeme kaydını eşiğin üstünde de `status: "SUCCEEDED"` ve `paidAt: new Date()` ile oluşturuyor; `approvedBy` alanına gerçek kullanıcı onayı yerine sabit `"Tenant Sahibi"` metni yazıyor. Test `tests/phase2-money.spec.ts` de 60.000 TL için bu otomatik başarılı durumu ve sabit onaylayıcıyı bekliyor.

**Sonuç:** Bu yalnızca etiket/arayüz hatası değildir. Tahsilat gerçekleşmeden/ikinci yetkili onaylamadan finansal durum kesinleşmiş gibi görünür; bekleyen KPI bu yoldan üretilen kayıtlarla beslenmez. Test mevcut yanlış semantiği güvence altına alıyor.

**Düzeltme için doğrulama şartı:** Kayıt eden kullanıcı, onaylayan kullanıcı, bekleyen/ret/onay durum makinesi, aynı kişinin kendi işlemini onaylamama kuralı, bakiye yeniden hesabı ve audit olayları beraber tasarlanmalı. Eşik altı akışın mevcut çalışması korunmalı; mevcut onay kaydı/ödeme verisi migrate edilirken hiçbir kayıt silinmemeli veya geriye dönük onaylanmış gibi işaretlenmemeli.

### F-02 — P2: Finans tablosu ve toplamlar yalnız ilk 200 siparişi kapsıyor

**Kanıt:** `src/components/maven/views/finance.tsx` siparişleri `listEntity("orders", { ..., limit: 200 })` ile tek kez yüklüyor; `append/more` sayfalama kullanılmıyor. `orderedTotal`, `collectedTotal`, `openTotal`, `partialCount` ve bekleyen manuel sayısı aynı `orders` dizisinden hesaplanıyor. Genel API `src/app/api/[entity]/route.ts` cursor pagination uyguluyor.

**Sonuç:** 200’den çok sipariş bulunan bir edisyonda finans listesi ve kart KPI’ları eksik görünür. Bu, “etkinlik toplamı” etiketlerinin yanlış anlaşılmasına yol açabilir ve mutabakatı UI üzerinden yapan kullanıcı için güvenilir değildir. Bu sınırın etkisi henüz büyük seed veriyle UI’da çalıştırılarak doğrulanmadı; kod yolu kanıtı kuvvetlidir.

**Düzeltme yönü:** Liste sayfalamasını kullanıcıya görünür şekilde sürdürmek; finans KPI’larını sayfalı UI listesinden değil, sunucuda filtrelenmiş aggregate/özet endpoint’inden almak. Sipariş ve payment/refund toplamlarında minor-unit tamsayı disiplini korunmalı.

### F-03 — P1 koşullu / Konfigürasyon güvenliği: Yerel runtime auth kapalı; production’da açık demo bayrağı auth-off’u meşrulaştırabiliyor

**Kanıt:** Mevcut `:3000` sağlık yanıtı `authEnabled:false` verdi; aynı yanıt veritabanı erişimini `ok:true` gösterdi. `.env` değerleri bu rapor için okunmadı. `src/lib/config.ts` production’da `MAVEN_AUTH=off` + `MAVEN_DEMO_MODE` açık değilse startup’ı reddediyor; ancak `MAVEN_DEMO_MODE=on` production’da auth-off’a izin veriyor. `src/lib/api/permissions.ts` actor/role yoksa `authorizeDualRead` demo bypass sonucu yetki veriyor; `src/lib/constants.ts` de role yokken UI modüllerini görünür kılıyor. CI workflow demo flag’iyle bu modu kullanıyor.

**Sonuç:** Çalışan yerel örnek, kontrollü demo ise anlaşılır; buradan production’ın auth-off olduğu çıkarılamaz. Ancak production ortamında demo flag’inin yanlışlıkla açılması tam kimlik doğrulamayı devre dışı bırakabilir. Ortam bayrağı operasyonel olarak kritik bir güvenlik anahtarıdır.

**Kontrol:** Production dağıtım manifestlerinde `MAVEN_DEMO_MODE` bulunmadığı ve auth-on zorunluluğu ayrıca incelenmeli. Bu checkout’ta gerçek production manifesti/secret deployment kanıtı görülmedi.

### F-04 — P2 güvenlik/scope tutarlılığı: agreement-scoped sponsor token bazı verileri sponsor kurumunun tamamı olarak okuyor

**Kanıt:** `PortalToken` üzerinde nullable `agreementId` ve `src/lib/portal/sponsor-scope.ts` içinde “agreement-scoped token only that agreement” semantiği var. `src/app/api/portal/sponsor/route.ts` agreements sorgusuna `agreementFilter(token)` uyguluyor; fakat aynı yanıt içinde `Entitlement` kurum/edisyon bazında, `Order` alıcı kurum/edisyon bazında ve sponsor personeli şirket adına/edisyon bazında sorgulanıyor; bu alt sorgular `token.agreementId` ile daraltılmıyor. `Entitlement` modelinde doğrudan `agreementId` alanı da yok. `src/app/api/portal/leads/route.ts` ise hedef agreement’i token agreement’inden seçerek daraltıyor. Böylece aynı token’ın kaynaklara göre scope anlamı farklılaşıyor.

**Sonuç:** Başka tenant’ın bilgisine erişim kanıtı değildir; risk aynı tenant/edisyon/sponsor kurumunun farklı anlaşmaları arasındaki ayrımdadır. Eğer anlaşma-scoped token’ın sözleşmesi gerçekten “yalnız bu anlaşma” ise sponsor overview ekranında hak, sipariş veya personel verisi fazla geniş dönebilir. Eski agreement’siz tokenların kurum-geneli çalışması yorumla özellikle geriye uyum için korunuyor.

**Düzeltme yönü:** Önce ürün kararı: haklar ve siparişler kurum-geneli mi, anlaşma-geneli mi? İkinci seçenek isteniyorsa veri modelinde sahiplik/bağ ve her alt sorgu tek scope resolver üzerinden sınırlandırılmalı. Üçüncü taraf sponsor A/B anlaşma izolasyon testi API düzeyinde eklenmeli; yalnız scope helper birim testinin yeterli olmadığı unutulmamalı.

### F-05 — P2 mimari boşluk: A → B ürün modül yetki sözleşmesi görünür ve ayrı bir veri katmanı olarak doğrulanmadı

**Kanıt:** `Tenant.plan` ve `TenantSubscription` plan/abonelik/fatura durumunu taşıyor. `EventCapability` yalnız edisyon düzeyinde yetenek açıp kapatıyor. `src/app/api/saas/provision/route.ts` gizli süper-admin anahtarı ile yeni tenant provision ediyor. Bu denetimde A’nın tenantları listeleyip B’ye modül/özellik paketi verme, değiştirme, askıya alma ve audit geçmişini görme ekranı doğrulanamadı; şemada da tenant–module entitlement ilişkisinin açık karşılığı bulunamadı.

**Sonuç:** A’nın platform işletmecisi, B’nin müşteri tenantı olması kabul edilen hedef modeldir; mevcut tenant/event capability modeli bu iki katmanı tek başına sağlamaz. Plan ismi, subscription statüsü veya event capability üzerinden B’nin modül hakkını tahmin etmek güvenilir bir yetki modeli değildir. Bu bir mevcut kullanım bug’ı değil; kabul edilen hedef mimarinin henüz görünür uygulama karşılığının eksik olduğuna dair doğrulanabilir boşluktur.

**Öncelik:** Event/tenant verisinin sınırlarını daha da genişletecek özelliklerden önce A→B entitlement kaynağının ve tenant içindeki rol ile event capability kesişiminin yazılı/sunucu tarafından uygulanabilir sözleşmesi belirlenmeli.

### F-06 — P2 UX/domain boşluğu: event kuruluş ilişkisi ve dış portal rol aileleri henüz hedeflenen esnekliği göstermiyor

**Kanıt:** `EventOrganizationAssignment.role` `String` olarak tutuluyor; açıklama metninde HOST, EVENT_OWNER, CLIENT, PCO, SUPPORTER, SPONSOR, VENUE, ASSOCIATION gibi sabit sözlük bulunuyor. Görünen ad eşlemesi `src/lib/constants.ts` içindeki sabit rol etiketleri. `CustomRole`/`EventRoleAssignment` ise katılımcı veya etkinlik personeli rol ataması içindir; tüzel kişi rol adlarını/başlıklarını tenant veya edisyon bazında yönetmekle aynı veri yapısı değildir. Portal token scope türleri `PARTICIPANT | SPONSOR`; bu kodda ayrı bir CLIENT/ORGANIZER/COMMISSIONING_ORG portal scope’u doğrulanamadı.

**Sonuç:** Firma B’nin müşteri kurum/dernek/üniversite/devlet birimi/gerçek kişi ilişkisinin kayıt altına alınması için `CLIENT` rolü mevcut sözlükte temsil ediliyor; fakat kullanıcının istediği gibi rol başlığını firmaca özelleştirme, destek türünü/önceliğini tanımlama ve bu kuruluşa daraltılmış erişim verme modeli aynı şey değildir. Sponsor portali var diye müşteri kurum portalının da var olduğu varsayılmamalıdır.

**Karar yönü:** Her ilişki türünün görünür adını özelleştirmek gerekebilir; sistem içi sabit kimlik/semantik anahtarlar, sıralama ve marka/portal görünürlüğünden ayrılmalı. Firma B tüm yetkiyi elinde tutmalı; müşteri kuruluşa sadece B’nin seçtiği ekran/alan/işlemler açılmalı. Bu rapor kod değişikliği yapmıyor.

### F-07 — P2 UX akışı: İlk etkinlik wizard’ı temel taslak oluşturuyor; kabul edilen tam kurulum akışının tamamı değil

**Kanıt:** `src/components/maven/views/editions.tsx` üç adımlı sihirbazı uyguluyor: şablon/seri/ad; tarih/şehir/mekân; event capability seçimi. Logo, event owner/client ataması, iç ekip kullanıcı/rol ataması, sponsor/partner isimlendirmeleri, portal header ve yayın hazırlıklarının tamamı bu ilk akışın adımları değil. Tarih doğrulaması ve yayın ön kontrolü kod/test kapsamına alınmış.

**Sonuç:** Bu sihirbaz işlevsiz değil; etkinlik taslağı ve modül başlangıç konfigürasyonu yaratabiliyor. Ancak “tek yetkili hızlı başlasın” ve “ilk veri girişleri küçük yönlendirici yazılarla kademeli yapılsın” hedefini tek başına tamamlamıyor. Her şeyi ilk modalda zorunlu hale getirmek de ilk kurulum bariyerini artırır.

**Düzeltme yönü:** Taslak oluşturma hızlı kalmalı; sonrasında durum kaydeden setup checklist/wizard, adım açıklamaları/örnekler, atla-sonra tamamla ve yayın blokları sunmalı. İlk admin’e tenant’ın izinli capability’leri için varsayılan tam erişim ancak event/tenant kapsamı doğrulandıktan sonra verilmeli.

### F-08 — P2 maintainability: UI module registry ve API policy registry birebir aynı kimlik seti değil

**Kanıt:** UI `MODULES` dizisinde 27 id var; sunucu `MODULE_IDS` dizisinde 26 id var. `company-communications` UI-only olarak yorumlanmış ve `communications`/`customer-contacts` backend kapılarını kullanıyor.

**Sonuç:** Mevcut fark açıkça belgelenmiş, bu nedenle tek başına hata olarak sınıflandırılmadı. Ancak yeni modül ekleme/değiştirmede UI görünürlük, API action policy, entitlement/capability ve i18n sözlüklerinin çapraz uyum testi olmadan ayrışma riski var. `lint:arch` bağımlılık grafiğini kontrol eder; bu modül yetki eşlemesinin tam kapsama testiyle aynı değildir.

## 5. Geçmiş bulgulara dair güncellik notu

Önceki `docs/arena/KAPSAMLI-ARASTIRMA-HATA-RAPORU-VE-HEDEF-YAPI.md` dosyası eski commit tabanında yazılmıştır. Eski rapordaki “API’de rol yetkisi yok”, “kişi kullanıcı yönetimi yok”, “şirket iletişimi capability’ye bağlı”, “i18n/lint/tsc bozuk”, “sponsor oluşturma her zaman bozuk” gibi iddialar bu checkout için otomatik olarak güncel kabul edilmemelidir.

Bu sürümde şu başlıkların belirgin karşılıkları bulundu: API authorization ve tenant guards; user invite/role assignment endpoints/UI; company-communications UI alias; sponsorship agreement wizard/tests; lint/typecheck/i18n/architecture kapıları. Buna karşılık F-01, eski finans kontrol riskinin güncel kodda hâlâ bulunduğunu doğrudan kaynak ve ilgili E2E beklentisiyle yeniden doğruluyor. Eski `docs/evidence/baseline.md` ve arena raporları tarih/commit belirtilmeden güncel ölçüm olarak kullanılmamalıdır.

## 6. Bu denetimde çalıştırılan kontroller

| Kontrol | Sonuç | Kanıt/not |
|---|---|---|
| `bun run lint` | **PASS** | ESLint hatası çıkmadı. |
| `bunx tsc --noEmit --incremental false` | **PASS** | TypeScript tanılaması çıkmadı. |
| `bun run i18n:scan` | **PASS** | 105 dosya, 0 ihlal. |
| `bun run lint:arch` | **PASS** | 518 modül / 2.044 bağımlılık tarandı, ihlal bulunmadı. |
| `bun run test:unit` | **FAIL — 363/364 geçti** | Tek hata `tests-mini/migration-baseline.test.mjs`: temiz boş SQLite DB’de `prisma migrate deploy`/şema farkı testi status 1 ile başarısız. |
| Migration-baseline testini tek başına yeniden çalıştırma | **FAIL — tekrarlanabilir** | 2 pass / 1 fail; Windows Prisma schema engine “Schema engine error”. `DEBUG=prisma:*` çıktısında engine indirme/başlatma yolu görülüyor; gerçek kök neden kanıtlanmış değil. Bu, mevcut Windows test blocker’ıdır; Linux/CI migration hatası olduğu sonucuna varılamaz. |
| `bunx playwright test --list` | **LISTED, NOT RUN** | 47 dosyada 798 test listelendi; testler çalıştırılmadı. |
| Yerel `GET /api/health` | **PASS, yalnız canlı yerel örnek** | HTTP 200, DB `ok:true`, `authEnabled:false`, `version:"task-b"`. Bu production doğrulaması değildir. |

Test koşusu ayrıca Node `MODULE_TYPELESS_PACKAGE_JSON` ve `DEP0190` uyarıları verdi. Bunlar koşu uyarısıdır; bu denetimde doğrudan ürün arızası kanıtı sayılmadı.

## 7. Önceliklendirilmiş kalan iş / doğrulama sırası

1. **Finans güvenlik semantiği:** F-01’deki manuel tahsilat ikinci-onay akışını ürün kuralı ve rol modeliyle netleştir; mevcut testin yanlış davranışı beklediğini dikkate al. Eski kayıtların korunması ve audit zinciri için veri geçişi tasarla.
2. **Tenant ve ürün entitlement sözleşmesi:** A platform yöneticisi → B tenant ürün modül hakları → B’nin event capability seçimi → B’nin çalışan/partner erişimi. Her katman için kaynak-of-truth, deny-by-default, geri çekme ve loglama davranışı belirle.
3. **Tenant izolasyonu ve dış portal scope:** B-C tenant ayrımı yanında aynı sponsor kurumun agreement-scoped ve organization-scoped token’larını API kaynaklarının her birinde doğrula. Agreement-level ve organization-level verinin hangisi olduğu netleşmeden müşteri/sponsor portali genişletme.
4. **Veri hacmi ve finans doğruluğu:** Finans listesi için cursor UX; KPI/defter özetlerini tüm edisyon üzerinden sunucu aggregate’ı ile doğrula. 200’den fazla siparişli fixture kullan.
5. **Rol ve paydaş esnekliği:** `UserRoleAssignment` iç personel erişimi, katılımcı `EventRoleAssignment`, tüzel kişi `EventOrganizationAssignment` ve dış portal token’larını ayrı kavramlar olarak koru. Özelleştirilebilir görünen etiketleri sabit sistem anahtarlarından ayır.
6. **Kademeli etkinlik kurulumu:** 3 adımlı hızlı taslak deneyimini koruyup sonrasında rehberli setup checklist/ilerleme, kısa örnek metinler, taslak kaydetme ve yayın öncesi bloklayıcıları tasarla. Etkinlik logosu/başlığı ile tenant logosunu karıştırma.
7. **PWA gerçek cihaz doğrulaması:** Install/manifest/viewport/offline testleri kaynakta bulunuyor; bu denetimde koşmadı. Gerçek mobil tarayıcıda alt navigasyon, etkinlik markası, oturum, offline kuyruk/çakışma ve cihaz paylaşımlı oturum güvenliği görsel/fonksiyonel olarak tekrar test edilmeli.
8. **Güncel test altyapısı:** Windows migration-baseline hatasının Prisma engine kaynaklı mı, komut/DB URL/şema karşılaştırma hatası mı olduğu ayrı teşhis edilmeli. Lockfile veya migration’ı bu audit bulgusuna dayanarak değiştirme.
9. **Release kanıtı:** E2E, build, accessibility axe, API boundaries, mobile viewport, CI/Linux ve gerçek production auth/environment konfigürasyonu ayrı sonuçlar olarak kaydedilmeli. Birinin PASS olması diğerini kanıtlamaz.

## 8. Güvenli devam notları

- Denetim sırasında `:3000` sunucusu zaten çalışıyordu; durdurulmadı, yeniden başlatılmadı.
- Playwright testleri, mevcut server/DB üzerinde seed veya kayıt değişikliği yapma riski nedeniyle çalıştırılmadı.
- `bun run test:unit` tek başarısız migration testinden dolayı bütünüyle PASS değildir; 363/364 sonucu olduğu gibi korunmalıdır.
- Kaynak kodu, lockfile, Prisma şeması, migration, `.env`, veritabanı ve test koduna müdahale edilmedi.
- İleride açık bir “uygula” talebi gelse dahi mevcut kullanıcı sınırı gereği, kaynak koda yönelik çalışma öncesinde kapsam ve onay yeniden alınmalıdır. Bu belge tespit/hafıza dosyasıdır; otomatik uygulama talimatı değildir.
