# Implementation Plan: Tenant ve Ürün Entitlement Sözleşmesi (F-05 & CONTEXT.md)

**Branch**: `002-tenant-module-entitlements` | **Date**: 2026-10-09 | **Spec**: [spec.md](./spec.md)

---

## 1. Mimari Tasarım ve Kararlar

### A. Veri Kaynağı ve Depolama (Data Model)
F-05 gereksinimini karşılarken geriye dönük uyumu korumak ve veritabanı kararlılığını riske atmamak için kademeli ve dayanıklı bir yaklaşım seçilir:
1. **Modül Matrisi ve Tipler (`src/lib/tenant-entitlements.ts`):**
   - Plan bazlı (`TRIAL`, `BASIC`, `PRO`, `ENTERPRISE`) varsayılan modül/capability setleri tanımlanır.
   - `CAPABILITY_TO_MODULE` ve `MODULE_TO_CAPABILITIES` ters ve düz eşlemeleri `constants.ts` ile uyumlu tutulur.
2. **Kiracı Özel Tahsisleri (Overrides):**
   - Kiracı abonelik notlarında (`TenantSubscription.notes`) veya kiracı yapılandırmasında JSON tabanlı güvenli override depolanır:
     `{ "entitlementOverrides": { "scientific": false, "b2b": true } }`.
   - Bu sayede mevcut SQLite şemasına yıkıcı bir müdahale yapılmadan, additive ve sıfır veri kaybıyla kiracı bazında modül açma/kapama (`grant` / `revoke`) yeteneği kazanılır.
   - İlerideki kalıcı tablo geçişi için arayüz soyutlanmıştır (`getTenantEntitlements(tenantId)`).

### B. Uç Noktalar ve Politika Sözleşmesi
1. **Süper Yönetici API (`src/app/api/saas/entitlements/route.ts`):**
   - `GET`: Kiracının plan modüllerini, override'larını ve nihai haklarını döner. `requireSuperAdmin` korumalı (`x-super-admin-key`).
   - `PUT`: Belirli bir modül için override kaydeder (`enabled: boolean`). `requireSuperAdmin` korumalı.
   - `scripts/route-policy.mjs`: `src/app/api/saas/entitlements/route.ts` ADMIN sınıfı altında kaydedilir.
2. **Akış Kapısı (`src/app/api/flows/route.ts`):**
   - `case "capability.toggle"`:
     - Yetenek `enabled: true` yapılmak istendiğinde, edisyonun bağlı olduğu kiracının o yetenek için platform hakkı olup olmadığı `assertTenantCapabilityEntitled(tenantId, key)` ile kontrol edilir.
     - Yetkisiz ise `403 Forbidden` (`PLATFORM_MODULE_UNENTITLED`) fırlatılır.

---

## 2. Riskler ve Uyumluluk Kontrolleri

1. **Mevcut Testlerin Korunması:**
   - 371 birim testinin tamamı test kiracılarını `PRO` veya `ENTERPRISE` yetkisiyle kullanır; geriye dönük hiçbir test bozulmaz.
2. **Fail-Closed İlkesi:**
   - Bilinmeyen modül veya kiracı bağlamı çözülemezse istek `deny-by-default` olarak reddedilir.
3. **Route Policy Envanteri:**
   - Yeni uç nokta `scripts/route-policy.mjs` ve `route-policy-parity.test.mjs`'ye eklenerek 165/165 tam uyum sağlanır.

---

## 3. Doğrulama Stratejisi

- `tests-mini/tenant-module-entitlements.test.mjs`:
  - TE-1: Plan bazlı varsayılan modül çözümleme (TRIAL vs PRO).
  - TE-2: Kiracı bazlı override ile modül verme (`grant`) ve geri alma (`revoke`).
  - TE-3: `GET /api/saas/entitlements` süper-admin doğrulaması (503 fail-closed, 404 timing-safe, 200 başarı).
  - TE-4: `PUT /api/saas/entitlements` ile modül override kaydetme ve audit kaydı.
  - TE-5: `capability.toggle` yetkili modülde `200 OK`, yetkisiz modülde `403 Forbidden`.
  - TE-6: Kapama (`enabled: false`) her zaman serbest.
