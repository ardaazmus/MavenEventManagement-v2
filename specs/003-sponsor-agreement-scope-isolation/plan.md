# Implementation Plan: Sponsor Anlaşma Kapsam İzolasyonu (F-04)

**Branch**: `003-sponsor-agreement-scope-isolation` | **Date**: 2026-10-09 | **Spec**: [spec.md](./spec.md)

---

## 1. Mimari Kararlar ve Tasarım

1. **Scope Helper Geliştirmesi (`src/lib/portal/sponsor-scope.ts`):**
   - `isItemInAgreementScope(item: { restrictions?: string | null; notes?: string | null }, tokenAgreementId: string | null): boolean` fonksiyonu eklenir.
   - `tokenAgreementId === null` ise `true` (kurum geneli serbest).
   - `tokenAgreementId !== null` ise:
     - Eğer öğe başka bir anlaşmaya ait `agreement:<otherId>` etiketi taşıyorsa `false` döner.
     - Eğer öğe hedef anlaşmaya ait `agreement:<tokenAgreementId>` taşıyorsa veya anlaşma kısıtı yoksa `true` döner.
   - `extractAgreementId(text?: string | null): string | null` yardımcı fonksiyonu eklenir.

2. **Sponsor Portalı API Güncellemesi (`src/app/api/portal/sponsor/route.ts`):**
   - `entitlements` dizisine `isItemInAgreementScope(e, token.agreementId)` filtresi uygulanır.
   - `orders` dizisine `isItemInAgreementScope(o, token.agreementId)` filtresi uygulanır.
   - `grant` çıktısı `{ scope: token.agreementId ? "AGREEMENT" : "ORGANIZATION", agreementId: token.agreementId ?? null, isAgreementScoped: Boolean(token.agreementId) }` şeklinde zenginleştirilir.

3. **Geriye Uyum ve Sıfır Kırılma:**
   - Mevcut tüm kurum-geneli testler ve entegrasyonlar olduğu gibi çalışmaya devam eder.
   - Şema değişikliği gerektirmez (mevcut `restrictions` ve `notes` alanları kullanılır).

---

## 2. Doğrulama Kapıları

- `tests-mini/portal-sponsor-scope.test.mjs` içinde A/B anlaşma izolasyon testleri.
- `bun run typecheck`, `bun run lint`, `bun run test:unit`.
