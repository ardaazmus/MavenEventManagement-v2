# Quality, Security, Performance and Traceability Gates

## 1. Evidence classes

- `STATIC_PASS`: lint, type, architecture, i18n or policy checks.
- `ISOLATED_TEST_PASS`: deterministic tests on disposable data.
- `LIVE_LOCAL_PASS`: verified local flow against named runtime/database.
- `MIGRATION_REHEARSAL_PASS`: copy/restore/backfill/cutover evidence on representative data.
- `PILOT_PASS`: accepted tenant pilot with monitored rollback window.
- `PRODUCTION_PASS`: real deployment configuration and smoke/monitoring evidence.

Never promote one class as proof of another.

## 2. Feature-preservation matrix

Before each module wave, list every current route, screen, command, export/import, background job, external projection and data model. Mark:

- unchanged and retested;
- adapted with parity test;
- intentionally replaced with acceptance owner;
- deprecated with migration/notice;
- unverified/blocking.

No item may disappear because it was absent from the new navigation.

## 3. Tenant-isolation matrix

For every protected query/command:

- B user and B work: allowed according to policy;
- B user and C work ID: denied without existence leak;
- B user and C child record ID: denied;
- B user with unassigned B work: denied or filtered;
- B limited portfolio scope and unrelated B record: denied/filtered;
- external principal and another organization/agreement/person: denied;
- revoked/expired external grant: denied while records remain;
- counts/search/export contain only authorized records;
- background jobs re-resolve tenant and grant, not trust payload IDs.
- Administrator roles assigned to one work cannot grant tenant-wide access; the API decision includes assignment scope.
- Agreement-limited sponsor grants filter every returned resource and field, not only the agreement list.
- Exercise each route category (list, item, search/count, export, import, integration, background job, external portal); helper-only unit tests are insufficient for cutover.

## 4. Permission tests

- module entitlement missing;
- tenant activation missing;
- work activation missing;
- action denied;
- field denied/masked;
- workflow state invalid;
- department/portfolio/work-set mismatch;
- self-approval prohibited;
- authenticated session actor, not client-supplied `decidedBy`/`enteredBy`, is persisted as approver/actor;
- high-value manual payment stays pending until a separate authorized actor approves;
- permission revoked during session;
- role renamed without permission change;
- disabled module data preserved.

## 5. Approval and data-integrity tests

- duplicate decision/concurrent reviewer conflict;
- correction/resubmission history;
- approval succeeds but outcome fails;
- confirmation retry is idempotent;
- rejected proposal consumes no final quota;
- approval reserves and confirmation consumes quota;
- cancellation releases reservation;
- registration category capacity and partner entitlements share a retry-safe, concurrency-safe reserve/consume/release lifecycle;
- form version and option labels remain historical;
- manual/internal source audit and duplicate checks;
- external/import/integration sources default pending;
- form submission review, ApprovalCase decision and outcome confirmation remain distinct and ordered;
- external submissions cannot become operational registrations, consume final quota or trigger definitive downstream effects before approval/confirmation;
- each import records source/hash, preview result, row outcomes, authenticated actor, approval state, commit result and idempotency key;
- no badge, credential, certificate, final accommodation or definitive send before confirmation.

## 6. Migration tests

- empty database deploy;
- current production-like schema deploy;
- representative copied database backfill;
- rerun backfill;
- interrupted/resumed backfill;
- row/amount/hash reconciliation;
- dual-read mismatch report;
- pre/post backfill scan for tenant/work ownership consistency across every linked parent/child pair, including payment/order, entitlement claim/participation/registration and form submission/form/edition;
- rollback before and after read switch;
- archived work and disabled module preservation;
- SQLite local plus intended production database provider.

## 7. UI/UX regression suite

### Global

- first login/tenant setup;
- single-owner default;
- home work list filtered by access;
- create-work wizard and resume draft;
- tenant settings versus work settings;
- portfolio/global communication permissions.

### Work

- Work Summary current, future and archived states;
- each workflow group hidden/shown by entitlement/activation/permission;
- deep links and command palette preserve context;
- no data from previous work after switch;
- empty/loading/error/offline states.

### External

- event code only sees public content;
- verified participant sees own data;
- B2B button and API both require entitlement;
- partner sees only own proposals/rights/quota;
- travel customer sees only approved itinerary/services;
- revocation and shared-device logout clear local data.

Run desktop and representative mobile widths. Capture accepted screenshots for each primary flow.

## 8. Accessibility gates

- automated axe on primary screens and dialogs;
- keyboard-only completion of setup, approval, registration and external login;
- visible focus and focus restoration;
- semantic headings/landmarks/table headers;
- labels, help and errors linked to fields;
- 200% zoom and narrow reflow;
- contrast validation for custom tenant/work colors;
- reduced motion;
- screen-reader spot checks for navigation, cards, charts, statuses and live messages.

## 9. Performance budgets

Budgets must be measured on agreed hardware/data fixtures; values below are initial targets, not claims:

- authorized work-home API p95 under 500 ms for 1,000 works with pagination;
- first 30-card/list response under 250 KB compressed;
- Work Summary p95 under 800 ms with cached/read-model modules and freshness shown;
- common server query count bounded and regression-tested;
- list/filter/search endpoints always paginated and indexed;
- finance totals are independent of the current page; accounting APIs do not load unbounded financial collections into application memory;
- import preview streams/processes bounded batches rather than whole-file memory spikes;
- onsite scan decision p95 under 200 ms locally connected, with offline queue behavior measured separately;
- module JS is lazy-loaded and unused work modules do not inflate the initial home bundle;
- external mobile primary route has a separate bundle/performance budget from admin.

Before a gate is evaluated, freeze fixture size, hardware/runtime, p95/query/bundle thresholds, measurement window and saved evidence artifact. Terms such as “bounded query count” or “appropriate load” are not PASS criteria until assigned measurable values.

## 10. Security gates

- production rejects auth-off/demo configuration;
- secrets never returned to client/log/export;
- session and external token audience, expiry, revocation and rotation tested;
- CSRF/origin policy for cookie-auth mutations;
- rate limits by actor/tenant/IP where appropriate;
- file type, size, malware/containment and signed download rules;
- SSRF protection for outbound media/integration fetches;
- formula injection protection in exports;
- webhook signatures, replay window and idempotency;
- audit logs are append-oriented and access-controlled;
- personal/sensitive fields minimized in logs, analytics and external projections.

## 11. Observability and rollback

Every phase declares:

- feature flag and tenant cohort;
- old/new decision or read comparison metric;
- error/latency/saturation dashboards;
- migration progress and mismatch counts;
- rollback command/procedure and data compatibility statement;
- owner and severity threshold.
- named backup/restore point, forward/resume/rollback steps, compatibility-write behavior, data reconciliation proof and recovery owner.

Rollback must not require deleting newly collected data. Compatibility writes continue until the rollback window closes.

## 12. Traceability table

| Requirement | Primary phase | Evidence |
|---|---|---|
| Firma A controls Firma B modules | P2 | entitlement schema/API/negative tests/audit |
| B/C strict isolation | P3/P14 | query/command/export/background-job matrix |
| One-person company defaults | P3/P9 | onboarding and first-work tests |
| Global portfolio plus work isolation | P5 | identity/relationship/scoped-search tests |
| Custom role/category labels | P3/P5 | label-without-permission-effect tests |
| External approval by default | P6 | source policy and outcome state tests |
| Partner proposals and quota | P10 | capability/quota/reservation tests |
| Distinct mobile/personal/B2B/partner/travel | P10/P11 | separate sessions/routes/navigation tests |
| Event logo/header separate from tenant | P8/P9 | branding fallback and card/external tests |
| Work supports congress/expo/travel | P4/P11 | template and module activation tests |
| New module without broad rewrites | P7 | manifest contract and fixture module test |
| Feature preservation | all | phase-specific preservation matrix |
| Polished two-level navigation | P8 | screenshot, keyboard, reflow and role-visibility evidence |

## 13. Current baseline caveats

Historical note from the initial roadmap pass: its interactive browser capture was unavailable and its mini-test baseline was incomplete. The newer `11-LIVE-ENVIRONMENT-AND-SECTOR-VERIFICATION.md` supersedes this evidence: it records successful live browser access, current static gates, successful migrations on a disposable database, and unresolved DB-template-dependent tests. Do not use this historical section as the current test or UI status. No result here proves implementation completion, production behavior, or tenant isolation.
