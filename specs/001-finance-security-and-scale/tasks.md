# Tasks: Finans Güvenlik Semantiği ve Bakiye Doğruluğu (F-01 & F-02)

**Input**: Design documents from `specs/001-finance-security-and-scale/`

## Phase 1: Yetki ve Politika Temeli

- [x] T001 `src/lib/api/permissions.ts`: `FLOW_ACTION_POLICY` içine `finance.approvePayment: { entity: "payments", action: "APPROVE" }` kaydı, `FlowScopePrisma` tip güncellemesi ve `resolveFlowEdition`'a `paymentId` desteği ekleme.

## Phase 2: Arka Plan Akışları ve Güvenlik Semantiği (P1)

- [x] T002 `src/app/api/flows/route.ts`: `finance.manualPayment` içinde ₺50.000 (>5.000.000 kuruş) üzeri ödemelerin `PENDING` statüsünde, `approvedBy: null`, `paidAt: null` ve sipariş bakiyesini etkilemeyecek şekilde oluşturulması.
- [x] T003 `src/app/api/flows/route.ts`: `finance.approvePayment` akışının uygulanması (withLock kilidi, durum makinesi, SoD giren!==onaylayan denetimi, aşım ödeme koruması, sipariş bakiyesinin yeniden hesaplanması ve ActivityLog).
- [x] T004 `tests-mini/finance-approvals.test.mjs`: Sözleşme testlerinin yazılması (FA-1..FA-7) ve `package.json` `test:unit` listesine eklenmesi.
- [x] T005 `tests/phase2-money.spec.ts`: ₺60.000 testinin iki aşamalı (önce PENDING, sonra yetkili onayı ile SUCCEEDED) yeni sözleşmeye uyarlanması.

## Phase 3: Kullanıcı Arayüzü ve Sunucu Agregasyonu (P2)

- [x] T006 `src/components/maven/views/finance.tsx`: PENDING ödemeler için Onayla ve Reddet aksiyonları, SoD uyarı rozeti ve durum rozeti güncellemesi.
- [x] T007 `src/components/maven/views/finance.tsx`: KPI kartlarının 200 siparişlik dizi yerine `/api/accounting?editionId=...` sunucu agregasyonundan beslenmesi.

## Phase 4: Doğrulama ve Kabul Kapıları

- [x] T008 `bun run test:unit`: Tüm birim ve sözleşme testlerinin sıfır hatayla geçtiğinin doğrulanması.
- [x] T009 Statik kalite kapıları: `bun run typecheck`, `bun run lint`, `bun run i18n:scan`, `bun run lint:arch`, `bun run policy:check` doğrulanması.
