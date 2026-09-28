# Modül / Özellik Ekleme Rehberi

Yeni modül ya da özellik eklerken çekirdek dosyalara dağılmadan, kayıpsız entegrasyon için temas listesi. Her madde `tests-mini/module-coherence.test.mjs` (MC-*) kapısıyla kilitlidir — listeyi atlayan adım testi kırar.

## A. Yeni admin modülü (UI)

1. `src/lib/constants.ts` → `MODULES`: `{ id, label, icon, capability, group, roles }` ekle. Grup 7 sektör grubundan biri olmalı (MC-6).
2. `src/lib/module-components.tsx` → `MODULE_COMPONENTS`: `id: dyn(() => import(...))` ekle (MC-1/MC-2). Ağır modüller `dyn` ile (kod bölme); ilk-boyama kritik modüller statik.
3. `src/i18n/tr.json` + `en.json` → `modules.<id>` görünen adı (MC-3).
4. Yetki gerekiyorsa `src/lib/api/permissions.ts` → `MODULE_IDS` + ilgili entity'ler `ENTITY_POLICY_MAP`'e (MC-4/MC-5). Doğrudan entity'si yoksa (toplayıcı/UI-only) MC-5 izin listesini güncelle.
5. `scripts/seed-roles.mjs` → rollere modül yetkisi (MC-7).

Nav menüsü, yetenek/rol kilitleri, kayıpsızlık testi otomatik türetilir — `page.tsx`/shell'e dokunma.

## B. Yeni API varlığı (entity)

1. `prisma/schema.prisma` model + `prisma migrate dev`.
2. `ENTITY_POLICY_MAP`: `{ module, allowedActions, scopeType }` (deny-by-default: kayıtsız entity reddedilir).
3. `src/lib/api/tenant-guard.ts` → `SCOPES`: kök kapsam (`tenant`/`edition`/`self`/…).
   Alt-varlık (üst üzerinden kapsamlanıyorsa) SCOPES'e girmez; dedicated rotası üst kapsamla `ensureInScope` çağırır.
4. Rota: jenerik `src/app/api/[entity]` otomatik devralır (yetki + kapsam + 409/404 sözleşmeleri). Özel davranış gerekiyorsa dedicated rota + aynı guard'lar.
5. `policy:check` yeni rotayı sınıflandırmalı (161+N — sayı büyür, kapı şekle bakar).

## C. Yeni portal widget'ı

1. `src/app/api/portal/content/route.ts` → `DEFAULT_WIDGETS`: `{ key, enabled, visibility, order }` (tek doğruluk kaynağı).
2. `src/components/maven/portal-app.tsx` → `WIDGET_META`: etiket/ikon/renk/hedef (MC-8 — metasız widget sessiz düşer, test yakalar).
3. Tıklama ölçümü gerekiyorsa `src/app/api/portal/interact/route.ts` → `WIDGET_KEYS` (MC-8).

## D. Yeni portal ekranı

1. `src/lib/portal-nav.ts` → `PORTAL_NAV_SCREENS` (hash + yığın + testler otomatik).
2. `ScreenShell` ile `onBack={goBack}` — geri oku zorunlu (29-portal-back-nav deseni).
3. `src/app/api/portal/config/route.ts` → `CHROME_SCREENS` (MC-9: nav kümesiyle birebir).
   İstisna: `form` bilinçli dışarıda (formda üst-bant gizlenemez).

## Doğrulama (kayıpsızlık)

```bash
npx tsc --noEmit
npx eslint .
npm run test:unit          # MC-* dahil
npm run lint:arch && npm run policy:check && node scripts/i18n-hardcoded-scan.mjs
E2E_SHARED_DEV_DB=1 npx playwright test tests/modules/24-ui-organization.spec.ts tests/modules/29-portal-back-nav.spec.ts --project=demo-auth-off
```

Kural: sayı savları (`toHaveLength(27)`, `length == 26`) YASAK — yeni modül testi kırmamalı; şekil kilitlenir, sayı büyür.
