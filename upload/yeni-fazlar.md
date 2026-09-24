ork on the existing Maven Event Management v2 source tree. Inspect the actual current source, Prisma schema, package scripts, route callers, and tests before editing. Implement the work in the exact order below. Preserve existing features and compatibility. Do not refer to external worklog, agent-memory, AGENTS, or project-hafizasi files; use only the source files and models named below and the repository's actual structure.


Do not assume a specific operating system, shell, port, database file path, package manager, or external provider. Discover environment-specific commands from the repository itself. Do not perform unrelated dependency upgrades, broad rewrites, speculative abstractions, destructive data resets, or feature removal. Before changing a shared helper, inspect every caller. Every behavior-changing step must add or update the smallest relevant regression test. Never silently change a response field, form payload, export column, status value, route, or database relation used by existing callers.


Preserve these existing contracts throughout the work:


* Person, EventParticipation, Registration, Order, Payment, and Refund remain separate domains.
* Tenant and edition isolation remains enforced for every list, item, aggregate, flow, export, portal, and media operation.
* Existing portal token hashing, expiry, scope, revoke, and one-time response rules remain intact.
* Existing scan history is append-only; rescans remain historical records and are never overwritten.
* Existing registration retry/idempotency behavior remains intact.
* Existing minor-unit money model, accounting totals, refund limits, exports, and payment reconciliation remain exact.
* Existing Turkish/English dictionaries, fallback behavior, maven.lang, JSON import/export, module navigation, auth-off development mode, and 390px responsive flows remain usable unless a specific task below corrects them.
* Existing EventSeries/EventEdition distinction remains: tenant identity is global; event branding and configuration is edition/series scoped.


PHASE 0 — Fix the data-entry blockers first


1. Repair chain-scoped child creation in src/lib/api/tenant-guard.ts.
* Inspect SCOPES, nestedTenantFilter, applyWriteGuard, ensureInScope, and all registry entries using mode: "chain" or mode: "chainOptional".
* The current POST guard checks the child table for an already-existing child using the parent foreign key. This prevents the first child from being created when the parent has no children.
* Validate the parent record through its relation path and tenant/edition chain, not through a child existence query.
* Preserve nullable first-hop behavior for scan-events and floor-objects.
* Test first-child creation and cross-tenant rejection for at least form-fields, decisions, role-assignments, companions, occupancy-slots, program-assignments, social-announcements, and b2b-assignments.
* Do not add duplicated tenant columns to child models to hide the guard defect.
2. Repair chainTenant handling in src/lib/api/tenant-guard.ts.
* OrganizationContact and IntegrationLog do not have a direct tenantId column. The current guard incorrectly queries the child delegate as if it did.
* Validate organization-contacts through Organization.id -> Organization.tenantId.
* Validate integration-logs through IntegrationLog.integration -> ApiIntegration.tenantId.
* Keep the generic guard fail-closed and avoid adding redundant tenant fields to these models.
* Add positive creation/list/item tests and cross-tenant negative tests.


PHASE 1 — Authentication, tenant ownership, and public management surfaces


3. Make auth-on tenant resolution real while preserving local demo mode.
* Inspect src/middleware.ts, src/lib/auth/session.ts, src/lib/auth/edge.ts, src/lib/auth-flag.ts, src/app/api/auth/*, and src/lib/api/tenant-guard.ts.
* When authenticated mode is enabled, resolve the tenant from the verified session tenantId, not db.tenant.findFirst().
* Reject a missing/invalid session or session tenant mismatch with the existing fail-closed response contract.
* Apply role/permission checks to management operations according to existing user roles and MFA policies; do not pretend that a role string is authorization unless the route enforces it.
* Preserve MAVEN_AUTH=off for controlled local/demo development, but do not allow that mode to be an acceptable production posture.
* Keep the auth flag and environment behavior discoverable from existing configuration; do not invent a fixed OS path or port.
4. Close management routes that are incorrectly public.
* Inspect src/middleware.ts, src/app/api/kvkk/erasure/route.ts, src/app/api/portal/preview-token/route.ts, and src/app/api/portal/blocks/route.ts.
* Keep public KVKK request intake as a separate public operation, but require authenticated authorized staff for KVKK GET/PATCH list/verify/complete/reject operations.
* Require an authenticated authorized administrator for management preview-token issuance/list/revoke.
* Require an authenticated authorized administrator for portal block CRUD. Participant/sponsor portal data may remain token-protected, but editor CRUD must not rely only on resolveEditionContext.
* Preserve tenant and edition checks after authentication.
* Add unauthenticated, wrong-role, same-tenant, and cross-tenant tests.
5. Remove predictable/fallback secret behavior from production paths.
* Inspect src/lib/auth/session.ts and src/lib/auth/edge.ts.
* Require MAVEN_SECRET_KEY for authenticated production/production-like startup or fail closed before issuing/verifying sessions.
* Keep local development ergonomics only when the environment explicitly indicates non-production; never silently use the documented development secret in production.
* Preserve session cookie names, HMAC format, sliding TTL, absolute TTL, MFA-pending behavior, and Edge-compatible signing.
* Replace the Edge middleware Buffer use with an Edge-safe encoding path if the current runtime does not provide Buffer.
6. Close Caddy/live-bus exposure.
* Inspect Caddyfile and mini-services/live-bus/index.ts.
* Remove the client-controlled arbitrary XTransformPort=* reverse-proxy behavior. Allow only an explicit server-owned route/port mapping for the intended live-bus service.
* Protect the live-bus publish endpoint so only the trusted Next.js server path can publish.
* Validate socket subscription identity and edition authorization before joining an edition room; do not expose tenant/edition activity to arbitrary sockets.
* Preserve the live-bus payload size and persistence responsibility, but do not rely on CORS * as security.
* Keep the independent mini-service dependency boundary intact.


PHASE 2 — Payment and financial integrity


7. Separate test payment simulation from production payment handling.
* Inspect src/app/api/payments/[id]/process/route.ts, src/app/api/payments/iyzico/create/route.ts, src/app/api/payments/iyzico/callback/route.ts, src/lib/iyzico.ts, and existing payment UI callers.
* The card-number endpoint is a simulation and accepts raw PAN/CVC. Make it unavailable in production and production-like environments, or keep it strictly behind an explicit test-only guard. Do not store or log raw PAN/CVC.
* Preserve the local test fixture behavior only in an explicit non-production test path.
* In the iyzico callback, retrieve and verify provider status, paid amount, currency, payment reference, and the local payment/order relation before marking success.
* Recalculate the order using the existing money logic after a successful callback; do this idempotently so repeated callbacks do not create a second financial movement.
* Use the provider-returned checkout URL/token rather than constructing a guessed URL.
* Do not assume the provider signature claim from a report. Validate the current implementation against the provider's official sandbox contract and fix only the verified mismatch.
* Preserve the current minor-unit model and multi-currency contract; do not hardcode TRY for non-TRY orders.
* Prevent duplicate checkout creation for the same pending order/payment using a transaction/idempotency policy.
* Add a real UI path for supported payment and refund operations only when the corresponding server contract is production-safe. Do not expose a fake success path as a real checkout.
8. Fix manual payment threshold and generic write authorization.
* Inspect src/app/api/flows/route.ts, src/lib/money.ts, src/lib/api/registry.ts, src/app/api/[entity]/route.ts, and src/app/api/[entity]/[id]/route.ts.
* Convert the manual payment amount once to amountMinor and compare the approval threshold in the same unit. Preserve the intended business threshold of 5,000,000 minor units (TRY 50,000) if that is the existing contract.
* Validate order currency, positive safe integer amounts, overpayment, and duplicate submission/idempotency.
* Replace global sanitize as the only write boundary with entity-specific writable-field allowlists and flow-owned status transitions. Generic PUT must not change payment status, registration status, order totals, entitlement counters, or other state-machine fields when a dedicated flow owns that transition.
* Preserve valid generic edits used by existing UI and tests.


PHASE 3 — Workflow state, transactions, and data integrity


9. Harden registration decisions and sponsor entitlements.
* In src/app/api/flows/route.ts, validate registration.decide input against the allowed decisions and legal current-state transitions.
* Prevent confirmation of cancelled/rejected records unless an explicit supported transition exists.
* When rejecting a sponsor-funded registration, release RESERVED entitlement claims and recompute the entitlement in the same transaction.
* Keep portal token issuance only on the valid confirmation transition.
* Validate sponsor.guest email/name inputs before database queries. Do not allow undefined email to become an accidental lookup or runtime Prisma behavior.
* Make entitlement capacity reservation atomic under concurrent requests. Preserve Person -> Participation -> Registration -> Claim separation and existing audit events.
10. Make reservation confirmation idempotent and transactional.
* In src/app/api/flows/route.ts, inspect reservation.confirm and related reservation/inventory models in prisma/schema.prisma.
* Reject an already confirmed reservation without consuming inventory again.
* Perform stock validation, inventory increments, reservation status update, and the committed audit event in one transaction or equivalent serialized operation.
* Define cancellation/rollback behavior so inventory is not permanently consumed by a failed or repeated transition.
11. Repair registration capacity and certificate eligibility.
* In src/lib/api/registration-chain.ts, apply the active RegistrationCategory.capacity rule atomically before creating a new registration. Keep waitlist behavior consistent with src/lib/api/waitlist-engine.ts.
* Do not allow a paid/full category to overbook because the capacity was checked outside the transaction.
* In certificate.generate and src/app/api/certificates/print-sheet/route.ts, select the effective registration deterministically. Do not use registrations[0] without status/time ordering. An old cancelled/rejected registration must not hide a current confirmed registration.
* Preserve existing certificate types, speaker role rules, attendance rules, and issue status lifecycle.
12. Complete person merge coverage without losing existing history.
* Inspect the full person.merge transaction in src/app/api/flows/route.ts and all Person relations in prisma/schema.prisma.
* Preserve the existing conflict-resolution behavior for edition participations and unique child records.
* Add safe handling for currently unaddressed relationships such as CV entries, session materials, B2B assignments, social announcements, dependent/guardian links, portal tokens, and any other Person relation discovered in the schema.
* Do not silently delete history. If a unique conflict cannot be merged, use an explicit deterministic resolution and audit it.
* Add a fixture containing every relevant relation and verify that the target person retains the complete history.
13. Fix event publish and readiness semantics.
* Inspect src/app/api/flows/route.ts (edition.publish) and src/app/api/dashboard/route.ts.
* Do not perform an internal HTTP self-request that loses the authenticated context. Reuse a server-side readiness function or pass a verified internal context so publish checks cannot fail open.
* Keep blockers blocking. Warnings must not be treated as blockers.
* Do not force an already ONSITE, COMPLETED, or other later lifecycle status back to REGISTRATION without an explicit supported transition.
* Count only the intended session statuses for publish conflict checks; do not treat every draft session as an approved conflict.
* A positive sponsor agreement count must not reduce readiness score as a warning.


PHASE 4 — API, security, HTML, URL, media, and audit boundaries


14. Make generic pagination strict.
* In src/app/api/[entity]/route.ts, accept only integer limits from 1 through 500.
* Return a controlled validation error for zero, negative, fractional, NaN, empty, and malformed values. Preserve cursor/keyset pagination, ordering, tenant filtering, and valid response shapes.
* Add tests for valid limits, invalid limits, malformed cursors, and continuation cursors.
15. Correct audit ownership.
* In src/app/api/[entity]/route.ts and src/app/api/[entity]/[id]/route.ts, preserve the existing audit event types but populate tenantId/editionId and the authenticated actor identity from the trusted context.
* Do not use a fixed actor name such as Yönetici when an authenticated actor is available.
* Ensure activity list filtering does not expose tenantless or foreign-tenant audit records.
16. Harden certificate, preview, and media output.
* In src/app/api/certificates/print-sheet/route.ts, escape every user-controlled value in HTML text/attribute/style context, including body template replacements, design text, names, companies, roles, edition/series names, background URLs, and data URLs. Keep the template feature but constrain it to a safe allowlist/sanitized output model.
* Fix the literal < br/> typo in the certificate fallback without changing intended line-break behavior.
* In src/components/maven/views/onsite.tsx, sanitize preview HTML with the same trusted boundary before dangerouslySetInnerHTML.
* In src/app/api/media/upload-linked/route.ts, verify the edition belongs to the active tenant before creating folders/assets. Validate external URL schemes strictly as http: or https: and reject ambiguous values.
* In src/app/api/media/export/route.ts, revalidate external URL destinations, block loopback/private/link-local/multicast/metadata networks, validate redirects, enforce timeout/size/content-type limits, and normalize every ZIP entry name to a safe basename. Preserve media magic-byte, quota, thumbnail, and export behavior.
17. Protect scan semantics.
* In src/middleware.ts and src/app/api/scan/route.ts, decide and document the intended device-auth boundary. If scan remains public for controlled QR devices, require a signed/device-bound capability rather than treating a browser request as a trusted operator.
* forceReason must not let an unauthenticated caller manufacture check-in/CME/certificate evidence.
* Validate credential/participation/edition consistency, registration status, badge status, door/session context, and operator/device context.
* Preserve append-only scan history and rescan warnings.


PHASE 5 — Build, type, lint, i18n, pagination consumers, and performance


18. Restore an honest quality boundary.
* Inspect next.config.ts, tsconfig.json, eslint.config.mjs, scripts/i18n-hardcoded-scan.mjs, and mini-services/live-bus/package.json.
* Do not use ignoreBuildErrors: true as the permanent quality gate. First fix the real errors, then make production build/type checks report them.
* Keep root application type boundaries separate from the independently owned live-bus package while preserving live-bus runtime behavior.
* Re-enable or replace disabled critical rules such as unused variables, exhaustive hook dependencies, unreachable code, fallthrough, and React purity where doing so does not create unrelated churn.
* Make i18n scanning detect new hardcoded UI strings rather than declaring success solely because the existing baseline is high. Add missing Turkish/English keys for all user-visible UI strings; API internal errors may remain machine contracts but user-facing translations must be mapped at the UI boundary.
19. Fix pagination consumers and race conditions.
* Inspect src/lib/client.ts, src/components/maven/bits.tsx, src/components/maven/views/onsite.tsx, and all list consumers.
* Scope onsite scan queries by currentEditionId and compute KPIs from the intended complete/cursor-paged dataset, not an arbitrary last-60 cross-edition sample.
* Cancel or identity-check append requests when dependencies, filters, or edition change so old pages cannot enter a new list.
* Preserve loading/error/empty states and existing response contracts.
20. Apply measured performance improvements only after response equivalence is recorded.
* Inspect src/app/api/accounting/route.ts, src/app/api/reconciliation/route.ts, src/lib/api/registry.ts, and src/app/api/scan/route.ts.
* Move large summary work to database-side aggregate/groupBy where the result is mathematically equivalent.
* Reduce unnecessary relation loading with focused selects only when current consumers receive every field they use.
* Do not add a generic cache or broad database migration without a measured need.
* Replace import * as Icons in hot shell/view paths with existing targeted imports only if the build/runtime remains correct.
* Split oversized modules incrementally only when it reduces real coupling; preserve module exports and route behavior.


PHASE 6 — UI/UX and responsive corrections


21. Fix language, shell identity, navigation, and destructive actions.
* In src/app/layout.tsx, make the initial HTML lang match the default language and synchronize it with the selected language without hydration regressions.
* Replace the external favicon dependency with a repository-owned/local asset or an existing project-safe fallback.
* In src/components/maven/shell.tsx, show the authenticated user identity/role and provide an appropriate logout/profile action when auth is enabled. Keep tenant identity separate from the current user avatar.
* Keep development seed available only in its explicit non-production mode, but require a clear confirmation before a destructive seed/reset action. Do not present it as the first response to a transient network error.
* Add confirmation and, where possible, undo/soft-delete behavior before cascade deletes in form fields, CV entries, custom roles, portal blocks, session materials, program assignments, and floor geometry. Explain irreversible child deletion before confirmation.
* In src/app/page.tsx and src/lib/store.ts, validate persisted module/edition values against current editions, capabilities, and known modules; route to a valid fallback instead of rendering an inconsistent blank/default state.
* Replace Turkish string matching such as message.includes("bulunamadı") with stable response error codes or typed result values so English mode does not change control flow.
22. Fix responsive layout and existing event setup UX without feature loss.
* Inspect src/components/maven/views/form-center.tsx, media.tsx, integrations.tsx, sponsorship.tsx, people.tsx, and the shell toolbar.
* Remove 390px horizontal overflow and clipping by using min-w-0, wrapping, bounded text, responsive toolbars, and accessible overflow patterns. Verify desktop and 390px layouts.
* Keep destructive actions reachable but not visually dominant.
* Preserve existing event cards, dates, status, city, counts, actions, and capability behavior.
23. Correct global tenant/language identity and event branding/setup.
* In src/components/maven/views/onsite.tsx, move tenant-wide identity editing out of event-specific settings while keeping the full form accessible from a global workspace control.
* Keep the primary language selector in the global shell; keep advanced language import/export in settings.
* In src/components/maven/views/editions.tsx, keep the fast three-step draft wizard. Do not turn it into a blocking nine-step wizard.
* Use EventSeries.logoUrl from prisma/schema.prisma for event-series cards and branding. Fall back to tenant logo and then accessible text/initials. Do not add an edition-logo column unless source inspection proves a real per-edition logo contract is required.
* Expose existing edition fields after creation: country, timezone, format, languages, coverColor, portal header fields, capabilities, and organization assignments.
* Reuse the existing Organization data and EventOrganizationAssignment role VENUE for venue address/contact/location information instead of duplicating venue data into EventEdition.
* Fix wizard tenant retrieval (/api/bootstrap returns tenant.id, not tenant.tenantId), honor existing-versus-new series intent, make series/edition/capability creation recoverable and idempotent, and persist the selected edition through the existing store/localStorage contract.


PHASE 7 — Add the approved K1–K9 product capabilities in module-owned increments


Do not create a generic “Competitor Features” top-level module. Reuse the current module owners and current Prisma conventions (cuid, editionId, indexed String status values, minor-unit Int money). Add custom domain routes/services for non-CRUD workflows; do not rely on generic registry CRUD for business transitions.


K1 — Lead Retrieval Native — P1


* Owner: Sponsor & Fuar lead-management subsection, with a controlled scan adapter in Sahada and sponsor-portal read/export surface.
* Inspect and reuse prisma/schema.prisma models EventParticipation, Credential, BadgeInstance, ScanEvent, BoothUnit, BoothAllocation, Organization, SponsorAgreement; src/app/api/scan/route.ts; src/components/maven/views/sponsorship.tsx; src/components/maven/views/onsite.tsx; src/app/api/portal/sponsor/route.ts; and src/components/maven/views/portals.tsx.
* Add a dedicated LeadCapture domain record rather than stuffing lead data into ScanEvent. Link scanner and subject to edition-scoped participation and optionally link the booth.
* Derive sponsor/booth ownership server-side; never trust a client-supplied boothUnitId to decide data visibility.
* Preserve normal ENTRY/SESSION scan semantics and append a lead event through the same trusted scan boundary. Add idempotency/repeat policy.
* Record lead-purpose consent/notice version/recipient organization as required by the existing privacy model. Do not assume generic event entrance consent automatically authorizes sponsor lead sharing.
* Add sponsor lead list, note/rating/follow-up state, scoped CSV export, and export audit. Add scoring/reminders only after the base flow is stable.


K8 — Promo Code and Discount Engine — P1 with finance gate


* Owner: registration pricing/catalog flow, with accounting/reconciliation reporting.
* Inspect prisma/schema.prisma models RegistrationCategory, CatalogItem, Order, OrderLine, Payment, Refund, Entitlement; src/lib/api/registration-chain.ts; src/app/api/public-register/route.ts; src/app/api/flows/route.ts; src/app/api/accounting/route.ts; and src/app/api/reconciliation.ts.
* Add a dedicated edition-scoped PromoCode model and a redemption/usage record if needed to enforce one-per-participant, max uses, concurrency, and audit. Do not overload Entitlement merely because it has PROMO/DISCOUNT values.
* Normalize code, validate active/validity/category/currency/value boundaries, and perform validation, redemption, order-line/discount calculation, and counter update transactionally.
* Preserve minor-unit integers, never produce a negative payable total, and keep gross/discount/net/tax/accounting export semantics explicit.
* Do not assume a negative OrderLine is safe until all current order/payment/refund/reconciliation consumers are checked. Choose the smallest compatible representation.


K2 — Self-service Kiosk and Offline Check-in — P2


* Owner: separate full-screen Kiosk mode under Sahada; do not mix offline controls into the normal admin desk.
* Reuse src/app/api/scan/route.ts, ScanEvent, Credential, BadgeInstance, and EventParticipation as the authoritative online contract.
* Add device/session and offline queue persistence only after the online scan command is idempotent. Each offline event needs a stable client event id/nonce, device identity, edition/door context, signature or trusted device capability, attempts, and explicit conflict state.
* Sync idempotently, preserve rescan history, prevent replay/time-skew abuse, and make printer failure independent from successful check-in.
* Keep kiosk search PII-minimal and rate-limited. Mobile app is out of this scope; browser/PWA kiosk is the target only if the current repository can support it without a new unrelated platform.


K5 — Live Poll and Q&A — P2


* Owner: Program/ProgramSession management with participant voting in Dış Portal.
* Add LivePoll/LiveVote tied to ProgramSession, preserve one vote per participation at the database level, validate edition ownership and LIVE state server-side, and return only aggregate results.
* Keep database state authoritative. Use live-bus only as a notification/update transport after authorization is fixed.
* Add moderator create/open/close and participant accessible voting. Keep Q&A as a separate later model with moderation and upvotes.
* Do not reuse form QA_QUIZ for session-live polling.


K3 — Matching and Meeting Planning — P2


* Owner: existing B2B Planı (B2bPlan, B2bAssignment) with profile/suggestion/meeting subviews; do not create a new top-level module.
* Add participation-scoped MatchProfile and separate MeetingSlot only after inspecting all current B2B callers.
* Preserve current B2bAssignment.personId, mutual approval, feedback, and existing records; do not replace it abruptly with participationId.
* Implement deterministic explainable scoring first, opt-out first-class, mutual consent, slot conflicts with ProgramSession/ProgramAssignment, and server-side confirmed-slot conflict prevention.
* Show users why a match was suggested. Do not add an external LLM as a prerequisite.


K4 — Gamification — P3


* Owner: participant/portal engagement surface initially; no new top-level module until actual scale requires it.
* Add edition-scoped GameRule/GamePoint only with idempotent source-event keys, daily caps enforced transactionally, and explicit audit for manual adjustments.
* Reuse stable events from ScanEvent, registration/quiz, meetings, and live polls; do not add a generic event-bus abstraction before a real trigger requires it.
* Public leaderboard must be opt-in/anonymous-by-default and must not expose lead/privacy-sensitive activity without an explicit policy.


K6 — Community — P3


* Owner: participant portal Community/Pano surface, with moderation under Operations/portal administration. Do not store user posts in PortalBlock.
* Add edition-scoped participation-authored posts, moderation state, report/hidden/delete behavior, rate limit, content-size/HTML sanitization, and audit.
* Preserve user deletion/retention behavior and tenant/edition boundaries. Keep one-to-one chat out of this phase.


K7 — CRM Connectors — P4


* Owner: API Gateway/Integrations. Reuse ApiIntegration, IntegrationLog, src/app/api/integrations/run/route.ts, src/app/api/integrations/hook/[token]/route.ts, and src/components/maven/views/integrations.tsx.
* Add mapping and connector boundaries only after K1 lead consent/data contracts exist. Start with one outbound provider/entity path; do not claim generic CRM support from a config card.
* Add validated field mapping, consent filtering, durable retry/idempotency/external key, partial failure/dead-letter visibility, and provider-safe secret handling.
* Keep inbound webhook token generation server-side and unpredictable; do not generate it with client Math.random().


K9 — Virtual/Hybrid Streaming — P4


* Owner: Program session + portal access + Integrations. Do not build an embedded streaming product first.
* Add session-scoped StreamLink and attendance import/recording only after EventEdition.format, ProgramSession, ApiIntegration, IntegrationLog, and src/app/api/cme/route.ts are understood.
* Start with link access and manual CSV import or one provider. Add import batch/provider event id/idempotency, safe identity matching, join-minute validation, and manual review for ambiguous matches.
* Do not treat an online join as a physical ScanEvent automatically. Define an explicit session/accreditation policy before allowing online attendance to contribute to CME/80-percent rules.
* Keep join URLs, meeting keys, and recording links behind the correct portal access boundary.


PHASE 8 — Verification and feature-loss gate


Use the repository's own package scripts and test configuration discovered from package.json; do not invent fixed commands, ports, database paths, or shell assumptions.


Verify, at minimum:


* first-child POST creation and cross-tenant rejection for every repaired guard path;
* auth-on tenant/session/role checks and public-vs-management portal/KVKK boundaries;
* secret-required production behavior and Edge-compatible session verification;
* payment simulation disabled outside test mode, iyzico callback idempotency, amount/currency/order reconciliation, manual payment threshold, and refund behavior;
* registration decision transitions, entitlement release, sponsor quota concurrency, reservation idempotency/stock, capacity, and certificate effective-registration selection;
* person merge retention across every discovered Person relation;
* scan edition scoping, device/operator boundary, rescan preservation, and CME/certificate evidence integrity;
* strict pagination, cursor continuation, audit ownership, HTML/URL/SSRF/ZIP safety, and media tenant ownership;
* build/type/lint/i18n boundaries with no hidden TypeScript errors;
* Turkish/English UI, HTML lang, fallback, language persistence, no hardcoded user-facing strings, and no error-control-flow dependence on localized text;
* desktop and 390px responsive layouts, destructive confirmations, shell identity, invalid persisted navigation fallback, event cards, event branding, and event setup fields;
* every new K1–K9 flow with tenant/edition negative tests, idempotency/concurrency tests where applicable, and the smallest end-to-end/UI regression proving the feature is reachable.


Completion requires: no existing feature, route, response field, status transition, export field, relation, or UI flow is removed; all P0/P1 verified defects are corrected; financial and scan semantics remain equivalent unless explicitly specified; K1–K9 are placed under the correct existing module owners; the project builds and typechecks honestly; security boundaries fail closed; and desktop/mobile regression evidence is recorded.