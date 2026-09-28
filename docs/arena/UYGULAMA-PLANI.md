## Goal

`docs/arena` analiz setindeki (H-01…H-20, N-01…N-07, S serisi) bulgulardan, mevcut `main`
ağacında (`bf2f5eb`) hâlâ açık ve doğru olanları kapatmak: P0 güvenlik deliklerini
düzeltmek, hızlı kazanımları uygulamak ve P1 şirket-alanı özelliklerini mevcut
mimariyle (dual-read RBAC, mevcut seed/test sözleşmeleri) uyumlu şekilde eklemek.

## Success Criteria

- `/api/flows` 15 aksiyonu rol/modül kapısından geçer; yetkisiz personel 403 alır,
  auth-off demo ve mevcut E2E davranışı değişmez.
- `secrets.ts` üretimde fail-closed olur; `derivedKey` anahtarsız prod'da throw eder.
- `tsc --noEmit` 0 hata, `eslint .` 0 hata, `i18n:scan` 0 ihlal verir; CI'da bu üç
  kapı + build zorunlu (hard) olur.
- Yeni davranışların hepsi `tests-mini` sözleşme testleriyle kapsanır;
  `npm run test:unit` yeşil kalır.
- Kullanıcı/davet/rol atama UI'dan yapılabilir; şirket iletişimi etkinlik
  yeteneğinden bağımsız erişilir; şirket snapshot export + tanıtım duyurusu çalışır.

## Context And Current Facts

- Arena raporları `28acc8c` tabanına karşı yazıldı; ağaç şimdi `bf2f5eb` ve
  295 dosya değişti. Doğrulama sonucu: H-01, H-02, H-03, H-04 (generic CRUD),
  H-05 API, H-07, H-09, H-12, H-19 kapanmış; tsc temiz; eslint 39→3 hata;
  i18n 21→39 ihlal (kötüleşmiş); CI + typecheck eklenmiş ama lint/i18n adımları
  `|| true` ile yumuşak.
- Hâlâ açık: N-01 flows (rol kapısı yok — middleware auth-on'da 401 verir ama
  rol ayrımı yok), N-02 secrets fail-open, N-03 global e-posta, N-04 global slug,
  N-05 xlsx (sunucu tarafı yalnız yazma; okuma istemcide), N-07 ölü retry,
  H-05 UI, H-06 kısmi (yeni RBAC var; seed'lerde people/organizations yok),
  H-08, H-10, H-11, H-13 (3 hata), H-14 (39), H-15 drift, H-16 font,
  H-17 depcruise, H-18 B2B mock.
- Mevcut yetki tasarımı arena önerisinden farklı ama eşdeğer: `permissions.ts`
  sözlük + `authorizeDualRead` + `UserRoleAssignment(scopeKey)` + `seed-roles.mjs`
  (716 izin iddiası testte sabit). Arena'nın `StaffRole/ModulePermission`
  önerisi YENİDEN inşa edilmeyecek; mevcut tasarım genişletilecek.
- `seed-roles.test.mjs` toplam izin sayısını 716 olarak sabitler; seed değişirse
  test güncellenmelidir.
- Tüm flows aksiyonlarının repo-içi çağrıcıları personel view'larıdır; public
  token'lı çağrıcı yoktur (portal ayrı `/api/portal/*` ağacındadır).

## Constraints And Non-goals

- Mevcut test sözleşmeleri bozulmayacak (seed digest/716, dual-read, faz testleri);
  değişen sözleşme varsa testi birlikte güncellenecek.
- Şema değişiklikleri additive + `prisma/migrations` göçüyle; yıkıcı göç yok.
- `docs/arena/*` analiz girdileri değiştirilmeyecek (tarihsel kayıt).
- Kapsam dışı (takip işi olarak not edilecek): S serisi (e-Fatura, CME bildirimi,
  WhatsApp Cloud, ORCID, hibrit yayın, promo kod, sponsor self-servis, OpenAPI,
  WCAG taahhüdü, portföy analitiği, white-label domain, NPS), middleware→proxy
  codemod, xlsx→exceljs tam göçü.

## Key Decisions

1. **Flows kapısı merkezi + mevcut dual-read ile**: aksiyon→(entity, action)
   eşlemesi `src/lib/api/permissions.ts` içinde (ayrı dosya, node testlerinde
   uzantısız TS import çözülemediği için elendi); `authorizeDualRead` yeniden
   kullanılır. Gerekçe: generic route'larla aynı karar merkezi (tek matris
   ilkesi), auth-off demo bypass otomatik korunur.
2. **`registration.decide`→UPDATE (APPROVE değil)**: seed'lerde FINANCE/ONSITE
   `registrations` için APPROVE'a sahip değil; APPROVE seçimi mevcut yetkileri
   daraltırdı (davranış regresyonu). Seed değişikliği yerine eşleme
   seed-kapsayıcı seçildi.
3. **Seed'lere people/organizations eklenecek (716→747)**: generic `/api/people`
   ve yeni `person.merge` kapısı DB-atanmış EVENT/REG rollerini haksız yere
   403'e düşürmesin diye. UI matrisi (`roles: "*"`) ile tutarlı, minimal küme:
   EVENT_MANAGER +14, REGISTRATION_MANAGER +14, ONSITE_MANAGER +2, FINANCE +1.
4. **N-03/N-04'te kod-önce, kısıt-sonra**: login çoklu-eşleşmede 409 + kurum
   ipucu; register global çakışma mesajı netleşir. `@@unique` göçleri ancak
   mevcut veride çakışma olmadığı doğrulanabilirse bu turda; aksi halde kod
   koruması + takip notu.
5. **N-05'te istemci-sınırı**: sunucu okuma yapmıyor (istemci parse ediyor);
   bu turda 3 istemci parse noktasına dosya boyutu sınırı + not; tam paket
   göçü takip işi.
6. **H-16'da yerel font**: ağ varsa Geist woff2 indirilip `next/font/local`a
   geçilir (offline-first kuralıyla uyumlu); ağ yoksa dokümante edilip geçilir.
7. **H-18'de canlı veri**: kanban B2B diyaloğu mock satırlar yerine gerçek
   `b2b-assignments` verisini gösterir; veri yoksa boş-durum + B2B modülüne
   yönlendirme.

## Recommended Approach

Önce P0 güvenlik (flows kapısı + secrets + seed), sonra hızlı kazanımlar
(lint/i18n/config/CI/N-07/depcruise/docs/H-18/xlsx), sonra P1 UI/özellik
(H-05, H-08, H-10, H-11) ve veri modeli sıkılaştırma (N-03/N-04). Her adımda
mevcut sözleşmeler (registry, permissions sözlüğü, seed, tests-mini kalıbı)
yeniden kullanılır; yeni soyutlama icat edilmez. Her iş birimi kendi
doğrulama komutuyla kapatılır.

## Work Plan

### Faz P0 — Güvenlik (önce)

- **P0-1 N-01 flows kapısı**: `src/lib/api/permissions.ts` içine
  (`FLOW_ACTION_POLICY` 15 aksiyon, `resolveFlowEdition` kapsam çözümleyici);
  `src/app/api/flows/route.ts` POST başına 401/403 kapısı (bilinmeyen aksiyon
  400 davranışı korunur); `tests-mini/flows-authorization.test.mjs` (eşleme +
  kapsam çözümü + yetki matris beklentileri).
- **P0-2 Seed people/organizations**: `scripts/seed-roles.mjs` +14/+14/+2/+1;
  `tests-mini/seed-roles.test.mjs` 716→747 güncellemesi; 716'ya bağımlı başka
  test varsa onlar da.
- **P0-3 N-02 secrets**: `src/lib/secrets.ts` prod guard + `tests-mini`
  sözleşme testi (NODE_ENV=production + anahtarsız → throw).

### Faz Q — Hızlı kazanımlar

- **Q-1 H-13**: 3 eslint hatası (`inline-editable-cell`, `qr-scanner`, `shell`).
- **Q-2 N-07**: `offline-queue.ts` retry sınırı + dead-letter + 4xx/5xx ayrımı.
- **Q-3 H-17**: `dependency-cruiser` devDep + `lint:arch` scripti; temizse CI'ya
  ekle, değilse ihlalleri takip notu yap.
- **Q-4 H-15**: `docs/Maven_Event_Management_Ortak_Organizasyonel_Mimari.md`
  gerçekle eşitle (model sayısı, kuruş, dinamik tier) veya "superseded" ilan et.
- **Q-5 N-06 kalan**: `ignoreBuildErrors:false`, `reactStrictMode:true`; CI'da
  lint+i18n hard (Q-1 ve H-14 düzeltmesinden sonra).
- **Q-6 H-16**: yerel font denemesi (ağ varsa); yoksa takip notu.
- **Q-7 H-18**: kanban B2B canlı veri / yönlendirme.
- **Q-8 N-05**: 3 istemci parse noktasına dosya boyutu sınırı + CVE notu.

### Faz P1 — Veri modeli + UI/özellik

- **P1-1 H-14**: 39 i18n ihlali sözlüğe taşınır (tr+en), scan 0 olur.
- **P1-2 H-05 UI**: `views/user-admin.tsx` (liste/davet/rol/durum) + settings
  sekmesi + i18n; mevcut `/api/users/*` sözleşmelerine bağlanır.
- **P1-3 N-03** (uygulandı): `login-candidates.ts` (parola-çoklu-eşleşme +
  tenantSlug ipucu + 409 belirsizlik); register kiracı-kapsamlı + P2002;
  `@@unique([tenantId, email])` göçü (`p24`) — dev DB'de 0 çakışma doğrulandı.
- **P1-4 N-04** (kapatıldı — değişiklik yok): portal/public yüzeyler slug'ı
  tenant-bağımsız çözüyor; global unique BY-DESIGN, şemaya not düşüldü.
  Generic 409 mesajı alan-değeri sızdırmıyor (oracle kapalı).
- **P1-5 H-08**: `company-communications` UI modülü (capability yok) + comms
  view'e şirket kipi; API değişmez (zaten tenant-kapsamlı + kapılı).
- **P1-6 H-10**: `/api/export/company-snapshot` (admin kapılı) + settings kartı
  + mevcut export uçlarına toplu bağlantı; yedek tetikleme basitçe mümkünse.
- **P1-7 H-11**: `TenantAnnouncement` model + göç + API + tanıtım kartı UI.

## Validation Plan

- Her P0/Q birimi: `npm run typecheck`, ilgili `tests-mini/*.test.mjs`,
  `npx eslint <dokunulan>`; flows için auth-off regresyonu
  (`tests/phase3-workflow.spec.ts` sözleşmesi — demo bypass korunur).
- H-14 sonrası: `npm run i18n:scan` çıkış 0.
- Faz sonları: `npm run test:unit` tamamı yeşil; `npm run lint` 0 hata.
- Final: `npm run build` (ağ varsa) + CI yml adımlarının yerel karşılığı
  (generate→migrate→typecheck→unit→lint→i18n→build).
- En riskli doğrulama: flows kapısının auth-on altındaki gerçek 403/401
  davranışı — bu ortamda engine kısıtı varsa Playwright ile değil, dual-read
  birim matrisi + kod incelemesiyle kanıtlanır.

## Risks / Rollback

- Flows kapısı yanlış eşlemede meşru personeli 403'e düşürür → önlem: eşleme
  seed-kapsayıcı seçildi; auth-off bypass değişmez; tests-mini matrisi her
  aksiyonu kilitler. Geri alma: tek dosyada kapı bloğu kaldırılır.
- Seed sayısı değişimi (716→747) başka test/digest'e dokunabilir → önlem:
  `716` için repo-taraması yapılır, bağımlılar birlikte güncellenir.
- `reactStrictMode:true` dev çift-effect yüzeyini açar → 완화: E2E smoke ile
  izlenir; sorun çıkarsa tek satır geri alınır.
- Göçler (N-03/N-04/H-11) SQLite `migrate deploy` ile CI'da uygulanır;
  çakışma riski varsa göç bu tura alınmaz.

## Open Questions

- Yok — tüm kararlar repo kanıtıyla kapatıldı.

## Uygulama Sonucu (2026-09-28)

Tüm fazlar uygulandı ve kapılar yeşil: `test:unit` 272/272, `tsc` 0,
`eslint` 0, `i18n:scan` 0 ihlal, `lint:arch` temiz, `next build` exit 0,
canlı standalone sunucuda flows demo-bypass kanıtlandı (200/400/404).

Plana göre sapmalar/kapanışlar:
- P0-1 eşleme ayrı dosya yerine `permissions.ts` içine alındı (node
  testlerinde uzantısız TS import çözülemiyor).
- Envanter/kanıt `28acc8c` tabanından `bf2f5eb` ana hattına re-baseline edildi
  (test main üzerinde zaten kırmızıydı): 126 model, 160 route, 27 modül,
  42 spec, 714 test. `db/` takipsiz olduğu için hijyen iddiası güncellendi.
- `npm run build` Windows uyumlu hale getirildi (`cp` → `node:fs.cpSync`).
- N-04: global slug unique'ler BY-DESIGN korundu (public slug çözümleme
  tenant-bağımsız); şemaya not düşüldü, göç yok.
- H-08 şirket gönderimi (tekil/broadcast) edition-bağlamlı kaldı:
  `/api/notifications/instant` editionId ister; şirket modülü kişi havuzu +
  içe/dışa aktarmayı yeteneksiz açar. Şirket-kapsamlı gönderim API'si takip işi.
- Next 16 `middleware.ts`'i yerleşik Proxy olarak çalıştırıyor (derleme
  çıktısında doğrulandı); middleware→proxy codemod gerekmedi.
- Takip işleri (kapsam dışı): S serisi, xlsx→exceljs tam göçü, middleware
  dosya-adı codemodu (işlevsel gerek yok), şirket-kapsamlı gönderim API'si.