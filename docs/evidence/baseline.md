# Maven Event Management v2 — Baseline Envanteri

**Sabit Taban Commit:** `bf2f5eb8f305a189d44fdcb9d2a340dae340cc2a`  
**Oluşturulma Tarihi:** 28 Eylül 2026  
**Amaç:** P00.1 uyarınca çalışma ortamı ve repo envanterinin değişmez olarak sabitlenmesi.

---

## 1. Çalışma Ortamı Bilgileri

| Bileşen | Değer |
|---|---|
| Taban Commit SHA | `bf2f5eb8f305a189d44fdcb9d2a340dae340cc2a` |
| Platform / Mimari | `win32 (x64)` |
| Node.js Sürümü | `v24.18.0` |
| Bun Sürümü | `1.3.14` |
| npm Sürümü | `11.16.0` |
| Git Sürümü | `git version 2.55.0.windows.3` |

---

## 2. Envanter Sayım Özeti

| Kategori | Adet | Not |
|---|---|---|
| Prisma Modelleri | **126** | `prisma/schema.prisma` |
| API Route Dosyaları | **160** | `src/app/api/**/route.ts` |
| UI Modülleri | **27** | `src/lib/constants.ts` `MODULES` |
| Playwright Spec Dosyaları | **42** | `tests/**/*.spec.ts` |
| Playwright Listed Test Sayısı | **714** | `playwright test --list` |

---

## 3. Çalışma Ağacı ve Takipteki Runtime Dosyaları (H-20 / N-04 Hijyen Riski)

Mevcut git durumunda takip edilen ve P00.2 fazında temizlenmesi/takipten çıkarılması gereken runtime dosyaları:

| Dosya | Git Durumu | Açıklama |
|---|---|---|


### Aktif Değişiklikler (`git status --short`):
```text
M .dependency-cruiser.cjs
M .github/workflows/ci.yml
M artifacts/route-policy-report.json
M bun.lock
M docs/Maven_Event_Management_Ortak_Organizasyonel_Mimari.md
M docs/evidence/baseline.md
M next.config.ts
M package.json
M prisma/schema.prisma
M scripts/route-policy.mjs
M scripts/seed-roles.mjs
M src/app/api/auth/login/route.ts
M src/app/api/auth/register/route.ts
M src/app/api/flows/route.ts
M src/app/layout.tsx
M src/components/maven/data-tools/custom-fields-renderer.tsx
M src/components/maven/data-tools/inline-editable-cell.tsx
M src/components/maven/data-tools/quick-add-row.tsx
M src/components/maven/onsite/kiosk-terminal.tsx
M src/components/maven/onsite/session-cme-console.tsx
M src/components/maven/portal/qr-scanner.tsx
M src/components/maven/scientific/peer-review-modal.tsx
M src/components/maven/scientific/timetable-grid.tsx
M src/components/maven/shell.tsx
M src/components/maven/sponsorship/sponsorship-kanban.tsx
M src/components/maven/views/accommodation.tsx
M src/components/maven/views/accounting.tsx
M src/components/maven/views/comms-crm.tsx
M src/components/maven/views/dashboard.tsx
M src/components/maven/views/onsite.tsx
M src/components/maven/views/people.tsx
M src/components/maven/views/registrations.tsx
M src/components/maven/views/scientific.tsx
M src/components/maven/views/sponsorship.tsx
M src/i18n/en.json
M src/i18n/tr.json
M src/lib/api/permissions.ts
M src/lib/constants.ts
M src/lib/module-components.tsx
M src/lib/offline-queue.ts
M src/lib/privacy/export-guard.ts
M src/lib/secrets.ts
M src/lib/users/invites.ts
M src/lib/users/user-list.ts
M tests-mini/inventory-determinism.test.mjs
M tests-mini/seed-roles.test.mjs
M tests-mini/user-list-readonly.test.mjs
M tests/modules/24-ui-organization.spec.ts
?? docs/arena/
?? prisma/migrations/20260928120000_p24_user_email_scoped_unique/
?? prisma/migrations/20260928130000_p25_tenant_announcement/
?? src/app/api/announcements/
?? src/app/api/export/
?? src/app/api/users/roles/
?? src/components/maven/views/announce-card.tsx
?? src/components/maven/views/company-comms.tsx
?? src/components/maven/views/export-hub-card.tsx
?? src/components/maven/views/user-admin-card.tsx
?? src/lib/announcements/
?? src/lib/auth/login-candidates.ts
?? src/lib/exports/company-snapshot.ts
?? src/lib/users/roles.ts
?? tests-mini/announcements.test.mjs
?? tests-mini/company-snapshot.test.mjs
?? tests-mini/flows-authorization.test.mjs
?? tests-mini/login-candidates.test.mjs
?? tests-mini/offline-queue.test.mjs
?? tests-mini/secrets-fail-closed.test.mjs
?? tests-mini/user-roles.test.mjs
```

---

## 4. Detaylı Varlık Listeleri

### 4.1 Prisma Modelleri (126)
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
- `BrandAsset`
- `Campaign`
- `CatalogItem`
- `CertificateDefinition`
- `CertificateIssue`
- `Companion`
- `ContactConsent`
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
- `EditionArchive`
- `EditionBrandRef`
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
- `ExportDownload`
- `ExportJob`
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
- `IysOutbox`
- `JurisdictionProfile`
- `KvkkErasureRequest`
- `LeadCapture`
- `MailProviderConfig`
- `MailSuppression`
- `MediaAsset`
- `MediaExportDownload`
- `MediaExportJob`
- `MediaFolder`
- `MeetingRequest`
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
- `PromoUsage`
- `Refund`
- `Registration`
- `RegistrationCategory`
- `Reservation`
- `Review`
- `ReviewAssignment`
- `RoleDefinition`
- `RolePermission`
- `RoomBlock`
- `RoomType`
- `RoommateRequest`
- `ScanEvent`
- `ScientificSetup`
- `SendDecision`
- `SessionMaterial`
- `SocialPlan`
- `SocialPlanAnnouncement`
- `SponsorAgreement`
- `SponsorAvailability`
- `SponsorFavorite`
- `SponsorPackage`
- `SponsorTierDefinition`
- `Submission`
- `Task`
- `Tenant`
- `TenantAnnouncement`
- `TenantInvoice`
- `TenantMailTemplate`
- `TenantSubscription`
- `Track`
- `User`
- `UserInvite`
- `UserRoleAssignment`
- `UtmTerm`
- `WaitlistEntry`
- `WebhookDelivery`

### 4.2 API Route Dosyaları (160)
- `src/app/api/[entity]/[id]/route.ts`
- `src/app/api/[entity]/route.ts`
- `src/app/api/account/theme/route.ts`
- `src/app/api/accounting/export/route.ts`
- `src/app/api/accounting/route.ts`
- `src/app/api/admin/db-migration/route.ts`
- `src/app/api/admin/iys/drain/route.ts`
- `src/app/api/admin/iys/reconcile/route.ts`
- `src/app/api/admin/outbox/drain/route.ts`
- `src/app/api/admin/outbox/route.ts`
- `src/app/api/admin/theme/route.ts`
- `src/app/api/analytics/benchmark/route.ts`
- `src/app/api/analytics/catalog/route.ts`
- `src/app/api/analytics/cockpit/route.ts`
- `src/app/api/analytics/cohorts/route.ts`
- `src/app/api/analytics/funnel/route.ts`
- `src/app/api/analytics/portfolio/route.ts`
- `src/app/api/analytics/segments/route.ts`
- `src/app/api/analytics/templates/route.ts`
- `src/app/api/announcements/[id]/route.ts`
- `src/app/api/announcements/route.ts`
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
- `src/app/api/campaigns/approval/route.ts`
- `src/app/api/campaigns/schedule/route.ts`
- `src/app/api/campaigns/send/route.ts`
- `src/app/api/campaigns/tick/route.ts`
- `src/app/api/certificates/print-sheet/route.ts`
- `src/app/api/cme/report/route.ts`
- `src/app/api/cme/route.ts`
- `src/app/api/comms/consents/route.ts`
- `src/app/api/comms/send-decisions/route.ts`
- `src/app/api/comms/templates/[id]/route.ts`
- `src/app/api/comms/templates/route.ts`
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
- `src/app/api/editions/[id]/archive/route.ts`
- `src/app/api/export/company-snapshot/route.ts`
- `src/app/api/exports/[id]/file/route.ts`
- `src/app/api/exports/[id]/route.ts`
- `src/app/api/exports/route.ts`
- `src/app/api/floor-studio/plan/route.ts`
- `src/app/api/floor-studio/sync/route.ts`
- `src/app/api/flows/route.ts`
- `src/app/api/form-fields/reorder/route.ts`
- `src/app/api/form-stats/route.ts`
- `src/app/api/form-submissions/[id]/route.ts`
- `src/app/api/form-submissions/export/route.ts`
- `src/app/api/health/liveness/route.ts`
- `src/app/api/health/readiness/route.ts`
- `src/app/api/health/route.ts`
- `src/app/api/integrations/hook/[token]/route.ts`
- `src/app/api/integrations/run/route.ts`
- `src/app/api/internal/bus-authorize/route.ts`
- `src/app/api/kvkk/dsar/route.ts`
- `src/app/api/kvkk/erasure/route.ts`
- `src/app/api/mail/send/route.ts`
- `src/app/api/media/export-jobs/[id]/file/route.ts`
- `src/app/api/media/export-jobs/[id]/route.ts`
- `src/app/api/media/export-jobs/[id]/token/route.ts`
- `src/app/api/media/export-jobs/route.ts`
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
- `src/app/api/people/attach/route.ts`
- `src/app/api/people/directory/route.ts`
- `src/app/api/people/duplicates/route.ts`
- `src/app/api/people/event/route.ts`
- `src/app/api/people/merge-preview/route.ts`
- `src/app/api/people/quick-add/route.ts`
- `src/app/api/portal/access/route.ts`
- `src/app/api/portal/action/route.ts`
- `src/app/api/portal/analytics/route.ts`
- `src/app/api/portal/announcements/route.ts`
- `src/app/api/portal/availability/route.ts`
- `src/app/api/portal/blocks/route.ts`
- `src/app/api/portal/config/route.ts`
- `src/app/api/portal/content/route.ts`
- `src/app/api/portal/game/route.ts`
- `src/app/api/portal/interact/route.ts`
- `src/app/api/portal/leads/route.ts`
- `src/app/api/portal/magic-links/route.ts`
- `src/app/api/portal/me/route.ts`
- `src/app/api/portal/meetings/route.ts`
- `src/app/api/portal/participant/route.ts`
- `src/app/api/portal/preview-token/route.ts`
- `src/app/api/portal/questions/route.ts`
- `src/app/api/portal/sponsor-grants/route.ts`
- `src/app/api/portal/sponsor/roi/route.ts`
- `src/app/api/portal/sponsor/route.ts`
- `src/app/api/portal/wallet/apple/route.ts`
- `src/app/api/portal/wallet/google/route.ts`
- `src/app/api/program/import/route.ts`
- `src/app/api/promo/assets/[id]/route.ts`
- `src/app/api/promo/assets/route.ts`
- `src/app/api/promo/refs/route.ts`
- `src/app/api/promo/usage/route.ts`
- `src/app/api/promo/utm-links/route.ts`
- `src/app/api/promo/utm-terms/route.ts`
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
- `src/app/api/users/[id]/roles/route.ts`
- `src/app/api/users/[id]/status/route.ts`
- `src/app/api/users/invites/accept/route.ts`
- `src/app/api/users/invites/route.ts`
- `src/app/api/users/roles/route.ts`
- `src/app/api/users/route.ts`
- `src/app/api/waitlist/route.ts`

### 4.3 UI Modülleri (27)
- `accommodation`
- `accounting`
- `archive`
- `b2b`
- `badges`
- `certificates`
- `communications`
- `company-communications`
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

### 4.4 Playwright Spec Dosyaları (42)
- `tests/auth-matrix.spec.ts`
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
- `tests/modules/26-sponsor-portal.spec.ts`
- `tests/modules/27-event-analytics.spec.ts`
- `tests/modules/28-integration-outbox.spec.ts`
- `tests/phase0-chain-writes.spec.ts`
- `tests/phase1-auth-boundaries.spec.ts`
- `tests/phase2-money.spec.ts`
- `tests/phase3-workflow.spec.ts`
- `tests/phase4-boundaries.spec.ts`
- `tests/smoke.spec.ts`
- `tests/theme.spec.ts`
- `tests/ui-corrections.spec.ts`
