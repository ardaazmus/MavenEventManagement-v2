# Task ID: TASK-B/25-26 — portal-builder (portal+)

## Özet
TASK-B fazları 25-26 tamamlandı: otel kompakt alanları, Portal Blokları (API + düzenleyici UI + her iki portal yüzeyi), kişisel sayfa zenginleştirme (badgePreview / cv / balanceTotal), sponsor sayfası (booths, entitlements total/claimed), i18n parçaları. Tüm kapılar yeşil; lint 0, dokunulan dosyalarda tsc 0.

## Oluşturulan dosyalar
- `src/app/api/portal/blocks/route.ts` — GET/POST/PATCH/DELETE; resolveEditionContext(required) + enforceRateLimit (okuma 60/dk, yazım 30/dk); payloadJson nesne zorunlu; PATCH/DELETE kaydın kendi editionId'siyle bağlam (IDOR kapalı); ActivityLog PORTAL_BLOCK_SAVED (editionId set, PII yok).
- `src/i18n/_new/portal.tr.json` / `portal.en.json` — 37 yaprak çift dilli (blok yönetimi + portal önizleme stringleri).
- `src/i18n/_new/accommodation-plus.tr.json` / `accommodation-plus.en.json` — 5 yaprak (4 otel alanı + ipucu).

## Değiştirilen dosyalar
- `src/app/api/portal/participant/route.ts` — üst-seviye `blocks` (PARTICIPANT|BOTH, isVisible, order asc, select {id,type,title,payloadJson,order}); `badgePreview` (ISSUED|PRINTED|REPRINTED → {badgeNo,status,profileName,profile{id,name}}); `cv` (SPEAKER/REVIEWER rolü varsa kendi CvEntry'leri, personId tokened kişi); `balanceTotal` (tek reduce, Σ max(0, total−SUCCEEDED-paid)).
- `src/app/api/portal/sponsor/route.ts` — `blocks` (SPONSOR|BOTH); üst-seviye `booths` düz listesi; entitlements'e `total` + `claimed` (=consumed+reserved) eklendi (mevcut alanlar korundu).
- `src/components/maven/views/accommodation.tsx` — otel diyaloğuna 4 alan (h-maps url, h-transport textarea, h-localphone, h-power) + useLang/t; hotelForm/openCreate/openEdit/saveHotel payload genişletildi; SIFIR hardcode.
- `src/components/maven/views/portals.tsx` — PortalBlocksManager (liste + oluştur diyaloğu + görünürlük Switch + sil); PortalBlocks önizleme şeridi her iki portal gövdesinin tepesinde; kalan bakiye bandı, yaka kartı önizleme kartı, CV bölümü, "Kalan hak" göstergesi; tipler (PortalBlockPublic/PortalBlockRow/BlockPayload) + ParticipantData/SponsorData genişletildi.
- `src/lib/i18n.ts` — FRAGMENTS'e portal + accommodation-plus parçaları (tr.json/en.json DOKUNULMADI).
- `src/lib/client.ts` — apiSend metod birliğine "PATCH" (additive).
- `src/components/maven/views/compliance.tsx` — EKSİK import { Badge } eklendi (başka oturumdan kalan lint bloklayıcısı; tek satır).
- `worklog.md` — TASK-B/25-26 bölümü EKLENDİ (append-only).

## Kapı kanıtları (numaralarla)
- lint 0 problem; tsc dokunulan dosyalar 0 hata (kalan 12 pre-existing: examples/, skills/, media/upload-linked, payments/iyzico).
- blocks POST → 201, 201; dizi payloadJson → 400; bogus edition → 404; editionsiz → 400. GET → [(0,Kongre Web Sitesi,BOTH,true),(1,Karşılama Duyurusu,PARTICIPANT,true)].
- PATCH isVisible=false → portaldan düştü (admin listede kaldı); order=0 reorder 200; DELETE 200 → 2. DELETE 404; idsiz → 400.
- participant portal (preview-token + x-portal-token): blocks 2; Mehmet badgePreview {BDG-2026-0002, PRINTED, Speaker}; cv 1 kayıt (SPEAKER+REVIEWER); Ahmet cv 0 (boş dizi — biçim kanıtı); Gizem balanceTotal 300000 kuruş (=remaining).
- sponsor portal: entitlements total/claimed 20/16, 10/6, 1/1, 30/11, 4/0 (seed havuzlarından — kalan 4 seed yorumuyla birebir); booths [A24, 12m², CONTRACTED]; blocks yalnız BOTH (PARTICIPANT bloğu sızmadı).
- Body-scan: participant+sponsor yanıtlarında `portalToken|pt_[0-9a-f]{24,}` → 0 eşleşme; "token" adlı anahtar → 0.
- ActivityLog 5/5: editionId dolu, PII yok. Hotel PUT 4 alan 200 → GET birebir (registry allowlist YOK, sanitize geçirir — registry değişmedi).
- Tarayıcı (agent-browser): Portal Blokları bölümü + diyaloğu render; blok şeridi, badgePreview+CV (Mehmet) görünür; TR/EN konsolunda eksik-anahtar uyarısı SIFIR. Ekran görüntüleri: tool-results/b26-portals-tr.png, b26-hotel-fields.png.

## Sonraki ajan için notlar
- PortalBlock yönetim yüzeyi bilinçli olarak generic `[entity]` registry'sine EKLENMEDİ (admin-only özel uçta) — registry/SCOPES'a eklemeyin; eklerseniz ayrıca SCOPES girişi gerekir.
- badgePreview'da designJson/designPreviewUrl YOK: BadgeProfile'da böyle alan yok (kontrol edildi); istenirse BadgeDesign.frontElements'ten ayrı bir preview imzasi tasarlanmalı — bu görev kapsamı dışı.
- apiSend artık PATCH kabul eder; eski raw-fetch PATCH desenli kod (form-center, compliance) dokunulmadan çalışır.
- Belirteç disiplini KORUNDU: blok uçları belirteçsiz yönetim yüzeyidir (rate-limit + edition bağlamı); portal veri uçlarında token-scan 0 eşleşme.
