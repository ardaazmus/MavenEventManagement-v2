# Independent Code Review Addendum

**Review baseline:** source checkout `99729c886c2d41d759a603e4d39c128ce2254b83`  
**Review mode:** read-only source/schema/test-definition inspection  
**Purpose:** record independent reviewer evidence that sharpens the delivered roadmap. This document does not claim that target architecture work has been implemented.

## 1. Review outcome

Five independent reviews examined architecture, tenant authorization, UI/UX, business-domain interactions, and quality/performance. The reviewers made no source, schema, configuration, or database changes. No tests or migrations were run by the reviewers.

The target direction remains valid: Firma A controls tenant entitlements; Firma B operates its tenant and work; work/module activation and user permissions remain separate; a modular monolith and additive compatibility migration fit the current application better than early service/database separation.

The roadmap needs several explicit safeguards before coding agents receive implementation tasks. Highest priority is effective authorization scope and trustworthy approval evidence. Next are operational state boundaries for submissions and quotas, then financial query correctness and measurable acceptance gates. The UI source audit confirms the existing shell is not yet the accepted Firma B work-first architecture.

## 2. P1 security and authorization findings

### 2.1 Work-scoped administrator assignment can be broader than intended

The assignment route accepts a tenant or same-tenant edition scope, while the authorization evaluator treats `ORG_OWNER`/`ORG_ADMIN` role keys as full access without proving the assignment itself is tenant-scoped. This can make a role granted for one edition act as a tenant-wide administrator. The review identified these points:

- `src/lib/users/assignments.ts:112`
- `src/app/api/users/[id]/roles/route.ts:69`
- `src/lib/api/permissions.ts:548`

**Roadmap amendment:** P3 must define an invariant that tenant-administrator roles can only be assigned at tenant scope. Every authorization decision must include the assignment scope and reject widening from a work assignment. Add API-level negative tests for a work-scoped administrator role attempting tenant-wide and unrelated-work actions. Menu hiding is not evidence of enforcement.

### 2.2 Scope metadata is not necessarily part of the authorization decision

`RolePermission.scopeType` exists in the schema, but the reviewed evaluator checks module/action and does not include scope type in that decision. Generic item GET/PUT paths also do not pass an explicit scope key to the evaluator:

- `prisma/schema.prisma:2578`
- `src/lib/api/permissions.ts:558`
- `src/app/api/[entity]/[id]/route.ts:59`
- `src/app/api/[entity]/[id]/route.ts:94`

Tenant guards still protect some resources; this finding is specifically that RBAC work/action scope cannot be assumed from the presence of scope fields in storage.

**Roadmap amendment:** P3 exits only after list, item, search/count, export, and background-job paths demonstrably enforce tenant, work, action, and sensitive-field scopes. Include a route-category inventory and one behavioral negative test per access pattern.

### 2.3 Related records can carry independently selected tenant/work parents

The schema stores related IDs on records whose parents also have tenant/work ownership. The review did not find composite ownership constraints covering every such relationship; examples include payment/order, entitlement claim/participation/registration, and form submission/form/edition:

- `prisma/schema.prisma:688`
- `prisma/schema.prisma:824`
- `prisma/schema.prisma:843`

Some API paths validate parent chains, but the review did not prove identical checks across every writer or existing database contents. This finding does not assert that a cross-tenant row currently exists.

**Roadmap amendment:** P0/P4 inventory every linked parent/child pair, scan existing data for tenant/work mismatches before backfill, and reconcile again after migration. Prefer composite constraints when compatible with the current provider/schema; otherwise require full ownership-chain validation on every write path plus migration repair/rollback evidence.

### 2.4 Agreement-limited sponsor access returns broader subresources

The sponsor route narrows agreement records using the token’s agreement filter, but the review found entitlements/claims, orders, and staff queried at organization scope in the same response. This is an intra-organization agreement-scope and data-minimization issue; it is not evidence of cross-tenant exposure:

- `src/app/api/portal/sponsor/route.ts:56`
- `src/app/api/portal/sponsor/route.ts:67`
- `src/app/api/portal/sponsor/route.ts:73`
- `src/app/api/portal/sponsor/route.ts:82`
- `src/app/api/portal/sponsor/route.ts:157`

**Roadmap amendment:** P10 requires a source-to-response scope matrix for every sponsor subresource. Test agreement-scoped and organization-scoped grants separately, including the exact returned fields, quotas, claims, orders/payments, and staff. A filtered agreement list alone is not an acceptable grant-scope test.

### 2.5 Approval actor identity is client supplied in reviewed flows

The flows endpoint accepts `decidedBy` and `enteredBy` values from the request and persists them to decision/activity/payment records. The reviewer also confirmed the high-value manual payment path records `SUCCEEDED` with static `"Tenant Sahibi"` above the configured threshold rather than waiting for a distinct second actor:

- `src/app/api/flows/route.ts:54`
- `src/app/api/flows/route.ts:79`
- `src/app/api/flows/route.ts:243`
- `src/app/api/flows/route.ts:261-271`
- `src/components/maven/views/finance.tsx:46-55`
- `tests/phase2-money.spec.ts:90-123`

**Roadmap amendment:** P0.2 keeps this as a separately tracked, revalidated defect. P6/P12 require the authenticated session actor to be the source of approval identity, high-value payment to remain pending until an authorized distinct reviewer decides, and audit records to preserve both actors and timestamps. Update the existing money test so it proves two-actor behavior rather than accepting a populated display string.

## 3. P1 workflow and data-integrity findings

### 3.1 Form review state, operational registration, and confirmation are not yet one safe sequence

The reviewed public-registration path may mark a submission `APPROVED` using `autoApprove`; the same request constructs a registration chain. The review route also constructs that chain before its approval decision. The registration chain has its own category-dependent `SUBMITTED`/`PENDING_APPROVAL` state:

- `src/app/api/public-register/route.ts:120`
- `src/app/api/public-register/route.ts:172`
- `src/lib/api/registration-chain.ts:105`
- `src/lib/api/registration-chain.ts:119`
- `src/app/api/form-submissions/[id]/route.ts:49`

**Roadmap amendment:** P6 must state and test three independent facts: `FormSubmission review status`, `ApprovalCase decision`, and typed outcome confirmation. Define their allowed transition ordering; an external source must not produce an operational registration, final quota use, payment/order side effect, badge, accommodation confirmation, or definitive communication before the configured Firma B approval and confirmation gates. Preserve old API response compatibility during the transition. Auto-approval can remain only as an explicit, source-aware tenant policy that cannot override the user-approved default of external submissions requiring review.

### 3.2 Category capacity and partner entitlements need a shared reservation lifecycle

Registration category capacity and sponsor/partner entitlements are separate models and counters. The registration chain checks category capacity, while partner quota is managed separately:

- `prisma/schema.prisma:510`
- `prisma/schema.prisma:798`
- `prisma/schema.prisma:824`
- `src/lib/api/registration-chain.ts:105`

**Roadmap amendment:** P6/P10/P12 must define one reservation lifecycle across applicable quotas: reserve, approve, confirm/consume, reject/release, cancel/release, retry/idempotency, and concurrent requests. A record must not consume both a category seat and partner entitlement twice, nor retain a reservation after rejection/cancellation.

### 3.3 Portfolio communication consent has competing representations

`Person` and `CustomerContact` both carry person/contact information. `CustomerContact.commsOptIn` defaults to true while purpose/channel consent is separately represented by `ContactConsent`:

- `prisma/schema.prisma:230`
- `prisma/schema.prisma:1612`
- `prisma/schema.prisma:1630`
- `prisma/schema.prisma:2727`

**Roadmap amendment:** P5/P6 designate canonical Person/Organization identity separately from contact points and campaign projections. Campaign audience eligibility must resolve from the purpose/channel consent ledger, not a permissive legacy boolean. Backfill must preserve evidence and must not infer opt-in from missing values. Imports must not blank out existing consent or identity fields when a source cell is empty.

### 3.4 Import workflows are separate and need a common minimum audit receipt

Registration, reservation, and customer-contact imports use separate preview/commit paths. Existing paths include validation and partial-row outcomes, but the review did not find one common import receipt/approval record tying source, preview and committed rows together:

- `src/app/api/registrations/import/route.ts:1`
- `src/app/api/registrations/import/route.ts:207`
- `src/app/api/reservations/import/route.ts:1`
- `src/app/api/customer-contacts/import/route.ts:1`

**Roadmap amendment:** P6.4 does not require a single shared import engine. It requires each import type to persist the same minimum evidence: source identity/file hash, preview validation result, row-level accepted/rejected/skipped outcome, authenticated actor, approval status when externally sourced, commit result, and retry/idempotency key. External rows remain proposals until Firma B approves them.

## 4. Module boundary and domain dependency amendments

### 4.1 Correct module catalog baseline and sequencing

The UI module registry contains 27 entries; the server `MODULE_IDS` list contains 26. `company-communications` is the identified UI-only entry. The entity manifest contains seven entity/domain entries and is not a complete product-module manifest:

- `src/lib/constants.ts:460`
- `src/lib/constants.ts:475`
- `src/lib/module-components.tsx:31`
- `src/lib/api/permissions.ts:19`
- `src/lib/manifest/index.ts:10`
- `src/lib/manifest/types.ts:30`

**Roadmap amendment:** the baseline inventory is corrected in `01-CURRENT-STATE-CROSS-MAP.md`. Add a lightweight `ModuleCatalog` adapter and exact UI/API/capability parity inventory to P1, before P2 creates entitlement rows. Keep P7 as the later full manifest and enforceable feature-dependency migration. Do not silently remove or invent a server permission for the UI-only entry; decide its intentional policy and cover it with parity tests.

### 4.2 Work scope migration must bind to the P1 identity adapter

`EventEdition` is still the operational aggregate. The Work roadmap correctly favors an additive `WorkIdentity` adapter and delayed command cutover.

**Roadmap amendment:** P3 scope backfill must consume the exact P1.2 `WorkIdentity` mapping and its tenant/date/status/capability parity evidence. No second permanent work identifier or parallel scope mapping may be introduced between P1 and P4.

### 4.3 Module waves need producer/consumer order

The current module waves identify features but do not fully state which module owns a fact and which module consumes its projection. Preserve separate ownership already present in the schema: finance orders/payments/refunds; accommodation stock and reservations; scientific submissions/reviews versus program sessions; floor geometry versus booth identity; participation versus badge/onsite check-in.

**Roadmap amendment:** before each wave, publish a small dependency table and contract tests. Suggested ordering: registration owns approved participation; finance consumes billable outcomes; sponsorship owns agreement/benefit/entitlement; accommodation owns room inventory/reservation; scientific review owns acceptance decisions while program owns scheduled sessions; floor plan owns geometry while sponsor/exhibitor owns booth identity; confirmed participation feeds badge/onsite. Producers publish stable IDs/events/read models; consumers must not directly mutate another module’s tables.

### 4.4 Partner role labels do not imply capabilities or sponsor quotas

`EventOrganizationAssignment.role` can describe sponsor, exhibitor, supporter, organizer and other relationships. `Entitlement` stores quotas separately. A sponsor portal grant with no agreement identifier may have organization-wide scope:

- `prisma/schema.prisma:412`
- `prisma/schema.prisma:2234`
- `src/app/api/portal/sponsor-grants/route.ts:43`

**Roadmap amendment:** P10 defines organization-wide versus agreement-scoped grants, and separately grants view/propose/edit/claim/deliverable/seating actions. A custom display label or relationship type never implies access, quota, sponsor benefits, or publication rights. Firma B explicitly controls each grant and can revoke it without deleting records.

### 4.5 Customer travel is a target-domain gap, not a current feature to remove

The current schema/API inventory did not show itinerary, booking, service request, fulfillment, or travel-document domain records. The roadmap correctly adds Customer Travel later as an optional Work profile/module, with no external booking-provider integration assumed.

**Roadmap amendment:** P11 names the owner for itinerary, manually entered ticket/hotel, transfer/shuttle/taxi/translator requests, service fulfillment, expense categories, payer/customer visibility, and finance linkage. External customer screens expose only Firma B-approved itinerary and service projections. Existing conference/expo flows must remain unaffected when this module is off.

## 5. Firma B information architecture evidence

The accepted target is not present in the current admin shell. Current code uses a long one-level module sidebar and event-edition selector. The dashboard has portfolio and edition scopes, but selecting an event card leads to the dashboard again. A three-step event wizard exists, but source inspection did not establish the accepted general Work types, customer relation, module setup choices, owner assignment, or resumable draft behavior:

- `src/components/maven/shell.tsx:76`
- `src/lib/constants.ts:444`
- `src/lib/constants.ts:460`
- `src/components/maven/shell.tsx:228`
- `src/components/maven/shell.tsx:353`
- `src/components/maven/views/dashboard.tsx:15`
- `src/components/maven/views/dashboard.tsx:50-71`
- `src/components/maven/views/dashboard.tsx:177-189`
- `src/components/maven/views/editions.tsx:256`
- `src/components/maven/views/editions.tsx:430-454`

The participant portal is a distinct route surface at `?portal=<slug>` with mobile bottom navigation and 52px controls, but this does not prove separate Personal Participant, B2B, External Partner, or Customer Travel experiences:

- `src/app/page.tsx:33-66`
- `src/components/maven/portal-app.tsx:1230`
- `src/components/maven/portal-app.tsx:1554`

**Roadmap amendment:** P8 acceptance tests must cover the current seven groups transitioning into the global Firma B home and work-context sidebar; authorized portfolio cards; empty, many, archived, and permission-filtered work lists; a role-sensitive Work Summary; and Work wizard draft/resume. P10/P11 must prove the five external surfaces as separate identity/navigation/capability experiences, without requiring separate deployment. Add desktop and mobile screenshots, keyboard path, contrast, 200% zoom, reduced motion, and 44px minimum touch targets for admin controls as well as participant controls.

### Live UI evidence limitation

The user’s browser currently retained an offline page for `http://127.0.0.1:3015/`. A new development server started on loopback, but the in-app and desktop browser environments timed out when reaching the local port. Therefore this addendum includes source evidence only; it does not claim a live screenshot, functional browser flow, or screen-reader result. Browser review must be repeated when the runtime is reachable from the browser host.

## 6. Quality and performance gates to make executable

The roadmap’s isolation matrix, feature-preservation matrix, performance targets, and migration controls are directionally strong. Independent review identified limits to current proof:

- Generic entity list routes have tenant filtering and cursor pagination, but this does not prove every custom route, item ID, search/count, export, job, or partner grant path.
- `tests-mini/test-db-isolation.test.mjs` proves test worker database separation, not cross-tenant API isolation.
- `tests-mini/portal-sponsor-scope.test.mjs` exercises scope helpers, not all data returned by the sponsor endpoint.
- Finance accounting loads unbounded collections in application memory; Finance UI derives KPI values from its first 200 orders.
- Current UI/API inventory is broad; files such as `portal-app.tsx`, `onsite.tsx`, `form-center.tsx`, and `people.tsx` are large. File size alone is not a defect, but each migration package needs narrower ownership and test boundaries.
- Health endpoint verifies liveness and a database query; this review did not find proof of systematic request/tenant correlation, operational metrics, or alert thresholds.
- Performance targets rely on an agreed environment/fixture that is not yet fixed; vague terms such as “bounded query count” are not executable gates.
- Migration rollback is a requirement, but each migration still needs a concrete backup point, forward/rollback operation, compatibility-write rule, reconciliation proof, and recovery owner.

**Roadmap amendment:** P0 creates a route-category coverage inventory for list, item, search/count, export, background job, import, integration, and external portal operations. P3 exit requires API behavior tests for foreign tenant/work/child IDs, unassigned work, restricted portfolio, counts/search/export, and revoked/expired grants. P10 sponsor acceptance checks every returned subresource and field. P12 performance acceptance computes financial totals independently of pagination and bounds query/memory use. Before each performance gate can pass, freeze fixture size, hardware/runtime, p95/query/bundle thresholds, measurement window, and evidence artifact. Before each risky migration starts, freeze backup and restore location, compatibility-write behavior, forward/resume/rollback procedure, row/value reconciliation, interruption test, and named recovery owner.

## 7. Ordered roadmap amendments

Apply these clarifications to the existing phase chain; keep its broad P0–P15 order:

1. **P0.2:** revalidate the administrator scope escalation, sponsor subresource scope, client-supplied approval actor, high-value payment behavior, public form auto-approval, and finance KPI pagination. Give each defect a separate implementation package after evidence review.
2. **P1.1/P1.2:** establish the 27-entry UI vs 26-entry API module catalog parity, then `WorkIdentity` read mapping.
3. **P2:** create entitlements only against the P1 module catalog; keep commercial subscription separate.
4. **P3:** map edition assignments through the P1 `WorkIdentity`; make assignment scope part of every decision; ensure administrator roles cannot be issued at work scope while granting tenant-wide access.
5. **P5/P6:** establish canonical identity/contact/consent source of truth; then separate form review, approval decision, and typed outcome confirmation; bind imports and quota reservations to that lifecycle.
6. **P6/P12:** only allow downstream registration, finance, sponsor entitlement, accommodation, badge and communication consumers after their source module’s approved outcome contract is stable.
7. **P7:** keep unified feature manifest after the early parity catalog; enforce feature ownership and dependency rules incrementally.
8. **P8:** migrate current admin shell to the agreed Firma B work-first two-level information architecture and validate role-filtered summaries.
9. **P10:** test exact partner grant scope and data minimization for each resource; no role label automatically grants quota or access.
10. **P11:** add the missing customer travel/service request domain as optional Work capability, without external booking integration.
11. **Every phase:** freeze acceptance owner, deterministic fixture, measurable pass threshold, proof artifact, backup/recovery point, and rollback/reconciliation procedure before implementation begins.

## 8. Preservation and review limits

These findings are planning inputs, not authorization to change application code. Existing working features, stored records, permission semantics, imports, consent, money, portals, offline behavior, and exports remain subject to the feature-preservation matrix. A change is not complete because the new screen hides old functionality; every current route, action, output and data relationship must be mapped to an equivalent or explicitly approved retirement.

**Not verified in this review:** live browser interactions, mobile hardware behavior, screen-reader behavior, production secrets/configuration, test suite results, performance measurements, provider delivery, migration rehearsal/restore, and end-to-end tenant isolation across every custom route. No tests or migrations were run and no source/data files were modified by the reviewers.
