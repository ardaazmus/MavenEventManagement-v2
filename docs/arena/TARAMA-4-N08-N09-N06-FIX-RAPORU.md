# TARAMA-4 — N-08 / N-09 / N-06 Düzeltme Raporu

TARAMA-3 bulgularının kapatma kanıtı. Baz: `323514a`.

## N-08 — Rota politikası envanter-kod uyumsuzluğu (EN YÜKSEK) → KAPANDI

- Mekanik türetme: `authRequired:true` + kapı belirteci yok → rapordaki 37 yerine **39** bulundu
  (ek: `saas/access-review`, 2× vcard — PII/e-posta sızıntısı, rapora eklendi).
- **36 uca rol kapısı** eklendi (52 handler): 25 dosya `requireStaff()`, 11 dosya `requireAdmin()`
  (compliance×4, custom-fields×2, saas×4, seed). Desen: `mail/send` ile birebir
  (rate-limit → kapı → iş), auth-off'ta `null` (davranış korunur).
- 3 istisna gerekçeli: `bootstrap` + `account/theme` (oturum-özel tasarım, metin iddiasız),
  `bus-authorize` (**envanter metni** gerçeğe çekildi: session + tenant/edisyon sahipliği).
- `saas/access-review`: `hasSession` → `requireAdmin` (401→403/200 matrisi).
- **Eşitlik testi** `tests-mini/route-policy-parity.test.mjs` (3/3): iddia↔kapı + izinli
  liste + tam tarama. Negatif kontrol: HEAD sürümünde kapı yok (kırmızı), düzeltmede yeşil.
- **Canlı matris** (flag-ON derleme, imzalı çerez, gerçek kullanıcı): 7/7 —
  401 çerezsiz, 403 OBSERVER/VIEWER, 200 ORG_ADMIN, by-design'lar 200.
- Yararlanılabilirlik kanıtı: `INVITABLE_ROLES` VIEWER/AUDITOR/OBSERVER içerir (gerçek oturum).

## N-09 — Prod auth-off boot koruması (ORTA) → KAPANDI

- `src/instrumentation.ts`: `validateConfig()` boot'ta çalışır; kritik bulgu —
  **Next.js `register()` hatasını unhandledRejection'a çevirip yaşamaya devam ediyor**,
  bu yüzden açık `process.exit(1)` eklendi (derleme fazı hariç).
- Canlı: prod+auth-off+demo'suz → port kapalı + `[instrumentation] FATAL` ✓;
  +`MAVEN_DEMO_MODE=on` → boot + health 200 ✓.
- Yan etki (bilinçli): yerel prod boot ve CI E2E artık `MAVEN_DEMO_MODE=on` + 32+ secret ister.

## N-06 kalan — eslint 40 (KATILIK FARKI ÇÖZÜLDÜ) → KAPANDI

- Tartışma çözümü: kural iki toolchain'de de var; fark `eslint-config-next`
  16.1.3 (kilitli, 0) vs 16.3.6 (floating, 39E+1W). `1dc7a86` + floating `npm install`
  ile **birebir çoğaltıldı** (39+1).
- 40 bulgunun tamamı düzeltildi (20 dosya): render-fazı sıfırlama (resmî desen),
  tembel başlatıcı, ref→state, microtask/zamanlayıcı tetikleme, geçici-bağlantı indirimi.
- Toolchain katı sete yükseltildi (`bun update`: ecn 16.3.6 + rh 7.1.1 + eslint 9.39.5,
  `bun.lock` 31 satır) → CI artık katı kuralları zorlar. **Katı lint: 0/0.**
- Personel kabuğu duman turu (8 görünüm): 0 pageerror, 0 render döngüsü.
  2 kaynak hatası önceden-var (dokunulmayan uçlar + dev-DB şema kayması).

## CI kırmızısı → KÖK NEDEN DÜZELTİLDİ

- `setup-node` `cache: "bun"` değerini desteklemez → adım düşüyordu. Satır kaldırıldı
  (bun kendi önbelleğini yönetir; frozen-lockfile determinist).
- `MAVEN_DEMO_MODE=on` eklendi (N-09 sonrası E2E boot'u için zorunlu).
- Workflow YAML `js-yaml` ile doğrulandı (15 adım, demo=on, cache yok).

## Kapılar (final)

typecheck 0 · eslint 0/0 (katı) · test:unit **287/287** · i18n 0 · policy 161/161
(STAFF 76/ADMIN 35 — bus-authorize düzeltmesi) · arch temiz · build 0 (auth-off + flag-on).
