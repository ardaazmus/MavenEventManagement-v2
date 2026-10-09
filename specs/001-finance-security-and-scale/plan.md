# Implementation Plan: Finans Güvenlik Semantiği ve Bakiye Doğruluğu (F-01 & F-02)

**Branch**: `001-finance-security-and-scale` | **Date**: 2026-10-09 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/001-finance-security-and-scale/spec.md`

## Summary

Bu plan, P1 bulgusu F-01 (manuel tahsilatta ikinci onay semantiğinin eksikliği ve sahte sabit "Tenant Sahibi" onayı) ile P2 bulgusu F-02'yi (finans KPI'larının 200 siparişle sınırlı olması) kalıcı olarak çözer.
50.000 TL üzeri tahsilatlar için gerçek bir `PENDING` durum makinesi kurulur; `finance.approvePayment` yetkili akışı eklenir; SoD (giren kişinin kendi kaydını onaylayamaması) kuralı uygulanır ve finans ekranı sunucu agregasyonuna bağlanır.

## Technical Context

- **Framework / Runtime**: Next.js 16 (App Router), Bun 1.3, TypeScript 5.8
- **Veritabanı / ORM**: SQLite (`db/custom.db`), Prisma 6.11
- **Mevcut İzin Sistemi**: Dual-read RBAC (`permissions.ts`, `FLOW_ACTION_POLICY`, `seed-roles.mjs`)
- **Para Birimi Disiplini**: Kuruş (minor unit, int), 50.000 TL = 5.000.000 kuruş eşik
- **Test Altyapısı**: `tests-mini` (Node.js test runner) sözleşme testleri + Playwright API/E2E

## Constitution & Architecture Gates

- **Gate 1 (Zero Regression)**: 364/364 birim testi, typecheck, lint, i18n ve depcruise temiz kalmalı.
- **Gate 2 (Tek Karar Merkezi)**: `finance.approvePayment` merkezi `FLOW_ACTION_POLICY`'ye eklenmeli ve `assertFlowPolicyIntegrity()` doğrulanmalı.
- **Gate 3 (Transaction & Lock Disiplini)**: Onay işlemi `withLock("order:" + orderId)` ve `db.$transaction` içinde atomik çalışmalı; bakiye çift ödeme ile aşılamamalı.
- **Gate 4 (Geriye Uyum)**: 50.000 TL altı tahsilatlar kesintisiz doğrudan `SUCCEEDED` olarak kalmalı.

## Planned Changes by Module

### 1. Yetki ve Politika Kayıt Defteri (`src/lib/api/permissions.ts`)
- `FLOW_ACTION_POLICY` içine `finance.approvePayment: { entity: "payments", action: "APPROVE" }` eklenmesi.
- `resolveFlowEdition` fonksiyonuna `paymentId` üzerinden edisyon çözümleme eklenmesi.
- `FlowScopePrisma` tipine `payment: { findUnique: ... }` eklenmesi.

### 2. Akış Uç Noktası (`src/app/api/flows/route.ts`)
- `case "finance.manualPayment"`:
  - `amountMinor > 5_000_000` durumunda `status: "PENDING"`, `approvedBy: null`, `paidAt: null` üretimi.
  - Sipariş bakiye ve durum hesabında PENDING ödemenin hariç tutulması.
  - `ActivityType.PAYMENT_RECEIVED` günlüğüne onay bekliyor notu düşülmesi.
- `case "finance.approvePayment"`:
  - Yeni vaka: `paymentId`, `approved: boolean`, `reason?: string` parametreleri.
  - Edisyon/kiracı doğrulaması, kilit (`withLock`) ve transaction.
  - Durum makinesi: Yalnızca `status === "PENDING"` ödemeler onaylanabilir/reddedilebilir.
  - SoD kontrolü: `payment.enteredBy !== actorName` (auth-on ortamında).
  - Onay (`approved: true`):
    - Aşım ödeme (`paidSum + payment.amount > order.totalAmount`) kontrolü.
    - `status: "SUCCEEDED"`, `approvedBy: actorName`, `paidAt: new Date()`.
    - Sipariş durumunu yeniden hesaplama (`PAID` veya `PARTIALLY_PAID`).
  - Ret (`approved: false`):
    - `status: "FAILED"`, `reason`, `approvedBy: actorName + " (RED)"`.
    - Sipariş durumu değişmez.

### 3. Finans Görünümü (`src/components/maven/views/finance.tsx`)
- PENDING durumundaki ödemeler için "Onayla" ve "Reddet" butonları/aksiyonları.
- KPI kartlarının `/api/accounting?editionId=...` sunucu agregasyon verisinden beslenmesi.

### 4. Testler (`tests-mini/finance-approvals.test.mjs` ve `tests/phase2-money.spec.ts`)
- Yeni mini test süiti `tests-mini/finance-approvals.test.mjs`:
  - FA-1: 50.000 TL altı doğrudan SUCCEEDED (geriye uyum)
  - FA-2: 50.000 TL üstü PENDING oluşturur, sipariş OPEN kalır
  - FA-3: İkinci yetkili onayı ile SUCCEEDED + bakiye kapanışı
  - FA-4: İkinci yetkili reddi ile FAILED + bakiye açık
  - FA-5: Kendi kaydını onaylama engeli (SoD)
  - FA-6: Aşım ödeme koruması (arada başka ödeme geldiyse)
  - FA-7: `FLOW_ACTION_POLICY` bütünlük testi
- `tests/phase2-money.spec.ts` ₺60.000 testinin yeni gerçekçi akışa hizalanması.
