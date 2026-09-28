# Maven Event Management v2 — Baseline Envanteri

**Sabit Taban Commit:** `28acc8c907c95b6c89ef09be27346811f4bca3b2`  
**Oluşturulma Tarihi:** 28 Eylül 2026  
**Amaç:** P00.1 uyarınca çalışma ortamı ve repo envanterinin değişmez olarak sabitlenmesi.

---

## 1. Çalışma Ortamı Bilgileri

| Bileşen | Değer |
|---|---|
| Taban Commit SHA | `28acc8c907c95b6c89ef09be27346811f4bca3b2` |
| Platform / Mimari | `win32 (x64)` |
| Node.js Sürümü | `v24.18.0` |
| Bun Sürümü | `1.3.14` |
| npm Sürümü | `11.16.0` |
| Git Sürümü | `git version 2.55.0.windows.3` |

---

## 2. Envanter Sayım Özeti

| Kategori | Adet | Not |
|---|---|---|
| Prisma Modelleri | **103** | `prisma/schema.prisma` |
| API Route Dosyaları | **106** | `src/app/api/**/route.ts` |
| UI Modülleri | **26** | `src/lib/constants.ts` `MODULES` |
| Playwright Spec Dosyaları | **36** | `tests/**/*.spec.ts` |
| Playwright Listed Test Sayısı | **204** | `playwright test --list` |

---

## 3. Çalışma Ağacı ve Takipteki Runtime Dosyaları (H-20 / N-04 Hijyen Riski)

Mevcut git durumunda takip edilen ve P00.2 fazında temizlenmesi/takipten çıkarılması gereken runtime dosyaları:

| Dosya | Git Durumu | Açıklama |
|---|---|---|


### Aktif Değişiklikler (`git status --short`):
```text
D  .env
M .gitignore
D  db/custom.db
D  db/custom.db-shm
D  db/custom.db-wal
?? .env.example
?? artifacts/
?? docs/evidence/
?? scripts/inventory.mjs
?? tests-mini/hygiene.test.mjs
?? tests-mini/inventory-determinism.test.mjs
```

---

## 4. Detaylı Varlık Listeleri

### 4.1 Prisma Modelleri (103)
- `ActivityLog`
- `AgencyGroup`
- `ApiIntegration`
- `Authorship`
- `B2bAssignment`
- `B2bPlan`
- `BadgeDesign`
- `BadgeInstance`
- `BadgeProfile`
- `BoothAllocation`
- `BoothUnit`
- `Campaign`
- `CatalogItem`
- `CertificateDefinition`
- `CertificateIssue`
- `Companion`
- `Credential`
- `CustomFieldDefinition`
- `CustomFieldValue`
- `CustomRole`
- `CustomerContact`
- `CvEntry`
- `Decision`
- `Delegation`
- `DelegationMember`
- `Deliverable`
- `DocumentRecord`
- `EmailTemplate`
- `Entitlement`
- `EntitlementClaim`
- `EventCapability`
- `EventEdition`
- `EventOrganizationAssignment`
- `EventParticipation`
- `EventPersonRole`
- `EventPortalConfig`
- `EventProfileSnapshot`
- `EventRoleAssignment`
- `EventSeries`
- `Expense`
- `FloorPlanObject`
- `FormAnswer`
- `FormDefinition`
- `FormField`
- `FormSubmission`
- `HotelProperty`
- `Income`
- `IntegrationLog`
- `InventoryNight`
- `Invitation`
- `JurisdictionProfile`
- `KvkkErasureRequest`
- `MailProviderConfig`
- `MailSuppression`
- `MediaAsset`
- `MediaFolder`
- `NotificationChannelConfig`
- `OAuthAccount`
- `OccupancySlot`
- `Order`
- `OrderLine`
- `Organization`
- `OrganizationContact`
- `OutboxEvent`
- `Passkey`
- `Payment`
- `Person`
- `PortalAnalyticsLog`
- `PortalAnnouncement`
- `PortalBlock`
- `PortalGameProgress`
- `PortalQuestion`
- `PortalSession`
- `PortalSessionRegistration`
- `PortalToken`
- `ProgramAssignment`
- `ProgramRoom`
- `ProgramSession`
- `Refund`
- `Registration`
- `RegistrationCategory`
- `Reservation`
- `Review`
- `ReviewAssignment`
- `RoomBlock`
- `RoomType`
- `RoommateRequest`
- `ScanEvent`
- `ScientificSetup`
- `SessionMaterial`
- `SocialPlan`
- `SocialPlanAnnouncement`
- `SponsorAgreement`
- `SponsorPackage`
- `SponsorTierDefinition`
- `Submission`
- `Task`
- `Tenant`
- `TenantInvoice`
- `TenantSubscription`
- `Track`
- `User`
- `WaitlistEntry`

### 4.2 API Route Dosyaları (106)
- `src/app/api/[entity]/[id]/route.ts`
- `src/app/api/[entity]/route.ts`
- `src/app/api/accounting/export/route.ts`
- `src/app/api/accounting/route.ts`
- `src/app/api/admin/db-migration/route.ts`
- `src/app/api/auth/login/route.ts`
- `src/app/api/auth/logout/route.ts`
- `src/app/api/auth/me/route.ts`
- `src/app/api/auth/mfa/setup/route.ts`
- `src/app/api/auth/mfa/verify/route.ts`
- `src/app/api/auth/passkeys/auth/options/route.ts`
- `src/app/api/auth/passkeys/auth/verify/route.ts`
- `src/app/api/auth/passkeys/options/route.ts`
- `src/app/api/auth/passkeys/verify/route.ts`
- `src/app/api/auth/recovery/use/route.ts`
- `src/app/api/auth/register/route.ts`
- `src/app/api/auth/session/route.ts`
- `src/app/api/badges/print-queue/route.ts`
- `src/app/api/badges/print-sheet/route.ts`
- `src/app/api/bootstrap/route.ts`
- `src/app/api/campaigns/schedule/route.ts`
- `src/app/api/campaigns/send/route.ts`
- `src/app/api/campaigns/tick/route.ts`
- `src/app/api/certificates/print-sheet/route.ts`
- `src/app/api/cme/report/route.ts`
- `src/app/api/cme/route.ts`
- `src/app/api/compliance/documents/route.ts`
- `src/app/api/compliance/jurisdiction/route.ts`
- `src/app/api/compliance/presets/route.ts`
- `src/app/api/compliance/report/route.ts`
- `src/app/api/custom-fields/batch/route.ts`
- `src/app/api/custom-fields/definitions/route.ts`
- `src/app/api/customer-contacts/export/route.ts`
- `src/app/api/customer-contacts/import-participants/route.ts`
- `src/app/api/customer-contacts/import/route.ts`
- `src/app/api/dashboard/route.ts`
- `src/app/api/floor-studio/plan/route.ts`
- `src/app/api/floor-studio/sync/route.ts`
- `src/app/api/flows/route.ts`
- `src/app/api/form-fields/reorder/route.ts`
- `src/app/api/form-stats/route.ts`
- `src/app/api/form-submissions/[id]/route.ts`
- `src/app/api/form-submissions/export/route.ts`
- `src/app/api/health/route.ts`
- `src/app/api/integrations/hook/[token]/route.ts`
- `src/app/api/integrations/run/route.ts`
- `src/app/api/internal/bus-authorize/route.ts`
- `src/app/api/kvkk/erasure/route.ts`
- `src/app/api/mail/send/route.ts`
- `src/app/api/media/export/route.ts`
- `src/app/api/media/system-folders/route.ts`
- `src/app/api/media/upload-linked/route.ts`
- `src/app/api/notifications/channels/reports/route.ts`
- `src/app/api/notifications/channels/route.ts`
- `src/app/api/notifications/instant/route.ts`
- `src/app/api/notifications/route.ts`
- `src/app/api/organizations/[id]/route.ts`
- `src/app/api/organizations/[id]/vcard/route.ts`
- `src/app/api/payments/[id]/process/route.ts`
- `src/app/api/payments/iyzico/callback/route.ts`
- `src/app/api/payments/iyzico/create/route.ts`
- `src/app/api/people/[id]/route.ts`
- `src/app/api/people/[id]/vcard/route.ts`
- `src/app/api/people/duplicates/route.ts`
- `src/app/api/people/merge-preview/route.ts`
- `src/app/api/portal/access/route.ts`
- `src/app/api/portal/action/route.ts`
- `src/app/api/portal/analytics/route.ts`
- `src/app/api/portal/announcements/route.ts`
- `src/app/api/portal/blocks/route.ts`
- `src/app/api/portal/config/route.ts`
- `src/app/api/portal/content/route.ts`
- `src/app/api/portal/game/route.ts`
- `src/app/api/portal/interact/route.ts`
- `src/app/api/portal/magic-links/route.ts`
- `src/app/api/portal/me/route.ts`
- `src/app/api/portal/participant/route.ts`
- `src/app/api/portal/preview-token/route.ts`
- `src/app/api/portal/questions/route.ts`
- `src/app/api/portal/sponsor/route.ts`
- `src/app/api/portal/wallet/apple/route.ts`
- `src/app/api/portal/wallet/google/route.ts`
- `src/app/api/program/import/route.ts`
- `src/app/api/public-forms/[idOrSlug]/results/route.ts`
- `src/app/api/public-forms/[idOrSlug]/route.ts`
- `src/app/api/public-register/route.ts`
- `src/app/api/public/tenant/route.ts`
- `src/app/api/reconciliation/route.ts`
- `src/app/api/registrations/approval-mail/route.ts`
- `src/app/api/registrations/export/route.ts`
- `src/app/api/registrations/import/route.ts`
- `src/app/api/registrations/manual/route.ts`
- `src/app/api/reservations/export/route.ts`
- `src/app/api/reservations/import/route.ts`
- `src/app/api/reservations/manual/route.ts`
- `src/app/api/room-stock/route.ts`
- `src/app/api/route.ts`
- `src/app/api/saas/access-review/route.ts`
- `src/app/api/saas/onboarding/route.ts`
- `src/app/api/saas/provision/route.ts`
- `src/app/api/saas/subscription/route.ts`
- `src/app/api/saas/uptime-report/route.ts`
- `src/app/api/saas/usage/route.ts`
- `src/app/api/scan/route.ts`
- `src/app/api/seed/route.ts`
- `src/app/api/waitlist/route.ts`

### 4.3 UI Modülleri (26)
- `accommodation`
- `accounting`
- `archive`
- `b2b`
- `badges`
- `certificates`
- `communications`
- `compliance`
- `dashboard`
- `editions`
- `finance`
- `floors`
- `forms`
- `integrations`
- `media`
- `onsite`
- `operations`
- `organizations`
- `people`
- `portals`
- `program`
- `registrations`
- `scientific`
- `settings`
- `social`
- `sponsorship`

### 4.4 Playwright Spec Dosyaları (36)
- `tests/auth.spec.ts`
- `tests/corrections.spec.ts`
- `tests/flow.spec.ts`
- `tests/goldens.spec.ts`
- `tests/middleware-boundary.spec.ts`
- `tests/modules/01-auth-login.spec.ts`
- `tests/modules/02-dashboard.spec.ts`
- `tests/modules/03-bottom-nav.spec.ts`
- `tests/modules/04-program-ics.spec.ts`
- `tests/modules/05-program-capacity-409.spec.ts`
- `tests/modules/06-sponsors.spec.ts`
- `tests/modules/07-floor-plan.spec.ts`
- `tests/modules/08-profile.spec.ts`
- `tests/modules/09-forms.spec.ts`
- `tests/modules/10-gamification.spec.ts`
- `tests/modules/11-qa.spec.ts`
- `tests/modules/12-announcements.spec.ts`
- `tests/modules/13-notification-center.spec.ts`
- `tests/modules/14-channels-admin.spec.ts`
- `tests/modules/15-admin-cards.spec.ts`
- `tests/modules/16-pwa-offline.spec.ts`
- `tests/modules/17-i18n.spec.ts`
- `tests/modules/18-registrations-manual-io.spec.ts`
- `tests/modules/19-accommodation-manual.spec.ts`
- `tests/modules/20-comms-crm.spec.ts`
- `tests/modules/21-campaign-scheduling.spec.ts`
- `tests/modules/22-customer-contacts-import.spec.ts`
- `tests/modules/23-reservation-import.spec.ts`
- `tests/modules/24-ui-organization.spec.ts`
- `tests/modules/25-approval-mail-waitlist.spec.ts`
- `tests/phase0-chain-writes.spec.ts`
- `tests/phase1-auth-boundaries.spec.ts`
- `tests/phase2-money.spec.ts`
- `tests/phase3-workflow.spec.ts`
- `tests/phase4-boundaries.spec.ts`
- `tests/ui-corrections.spec.ts`
