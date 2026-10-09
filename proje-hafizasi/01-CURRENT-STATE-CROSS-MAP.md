# Current-State to Target Cross-Map

## 1. Verified baseline

The current application is a Next.js single-page administration shell backed by Prisma and a large generic/entity API surface. The audited checkout contains:

- a tenant root with users, portfolio people/organizations, event series/editions and subscriptions;
- 27 internal UI registry entries grouped into seven sidebar sections; the server-side `MODULE_IDS` list contains 26 entries, so the baseline explicitly records a one-entry UI/API catalog mismatch;
- 164 classified API routes;
- persistent RBAC definitions and tenant/edition assignments;
- edition capability activation;
- public forms, registration chains, portals, sponsor access, PWA configuration and offline support;
- financial, accounting, scientific, program, sponsor, accommodation, onsite and compliance features;
- entity manifests for seven domains, an outbox and broad dependency checks.

Fresh static verification passed at roadmap creation: lint, no-emit typecheck, i18n scan, route policy, dependency rules and mini tests.

## 2. Structural conflict map

| Current location | Current behavior | Target decision | Treatment |
|---|---|---|---|
| `src/app/page.tsx` | One SPA chooses a module; portal/form query parameters bypass shell | Introduce explicit internal and external product shells | Retain compatibility routes, add route/context seam, migrate gradually |
| `src/components/maven/shell.tsx` | All visible modules share one long sidebar and edition selector | Firma B home first; global rail plus contextual work sidebar | Split shell responsibilities, preserve keyboard palette and theme/language behavior |
| `src/lib/constants.ts` | UI groups, roles, modules, capabilities and labels coexist | One module manifest plus separate domain vocabularies | Adapt first, then remove duplicates after parity tests |
| `src/lib/module-components.tsx` | Component registry and code splitting | Manifest-provided navigation/view contribution | Reuse dynamic imports through a manifest adapter |
| `src/lib/api/permissions.ts` | Server module/action dictionary and DB/legacy role resolution | Central policy evaluator with explicit scope dimensions | Deepen, do not layer a second independent authorization system |
| `src/lib/api/tenant-guard.ts` | Entity-to-tenant/edition scope registry | Resource ownership resolver used by policy evaluator | Retain and generalize edition scope to Work scope |
| `EventCapability` | Edition-level module enablement | Work activation layer | Migrate as compatibility source, not as platform entitlement |
| `Tenant.plan` / `TenantSubscription` | Commercial plan/status | Commercial lifecycle separate from module grants | Retain; add explicit entitlement records |
| `RoleDefinition` / `RolePermission` / `UserRoleAssignment` | Tenant/custom role, module/action and tenant/edition scope key | Policy bundles plus typed scopes and grants | Additive migration with dual evaluation and decision comparison |
| `Person`, `Organization` | Tenant canonical records | Canonical portfolio | Retain as master records |
| `CustomerContact` | Campaign-oriented contact pool with source edition | Portfolio segment/contact-point projection | Do not maintain as a competing person identity; define linking/dedup policy |
| `EventParticipation` / `Registration` | Person's edition relationship and registration | Work relationship and registration module record | Retain and rename at interface level before physical schema changes |
| `EventOrganizationAssignment` | Organization's event role | Work organization relationship | Retain and extend with custom display labels and client/organizer semantics |
| `FormDefinition` / `FormField` | Mutable form and fields | Versioned template/publication/runtime | Add version layer and immutable published definitions |
| `FormSubmission` | PENDING/APPROVED/REJECTED/SPAM; optional registration link | Source-neutral proposal + approval case + typed outcome | Split review state from generated outcome and operational confirmation |
| `PortalToken` | Participant or sponsor token; optional agreement scope | External principal/session/capability grant | Replace broad role assumptions with explicit capability grants; preserve token revocation |
| `EventPortalConfig` | One heavily JSON-configured participant/sponsor PWA | Shared external-experience core with surface-specific configs | Migrate JSON with schema versions; separate surfaces and preview contracts |
| `DOMAIN_MANIFESTS` | Seven entity impact/UI manifests | Full module contract | Expand through adapters, not a big-bang registry rewrite |
| Large `views/*.tsx` files | UI, state, queries and workflows concentrated in pages | Deep feature modules with small public interfaces | Extract by workflow seams; preserve observable behavior and tests |

## 3. Feature assets to preserve

### Identity and governance

- tenant-scoped email uniqueness;
- passkeys, MFA, recovery, session revocation and login lockout;
- role definitions, invitations and permission trace tests;
- tenant guards, IDOR protections and route classification;
- compliance, consent, DSAR, erasure and audit history.

### Registration and people

- canonical person and organization records;
- duplicate detection/merge preview, vCard, quick add and imports;
- participation snapshot, categories, invitations, delegations, companions and custom roles;
- idempotent form-to-registration chain and pending payment creation.

### Revenue and operations

- minor-unit money rules, refunds, catalog/order/payment relationships;
- sponsor tiers, packages, agreements, deliverables, booth allocations, entitlements and claims;
- accommodation inventory, reservations, occupancy and roommate workflows;
- program, scientific review, B2B, social plans, credentials, scan events, badges and certificates.

### External and integration

- public forms, portal manifest, service worker/offline queue, dynamic branding and wallet endpoints;
- partner/sponsor leads, meetings, ROI and revocable tokens;
- media ingestion/export containment, outbox, webhook delivery and integration logs;
- i18n, theme, accessibility fixtures and command palette.

## 4. Confirmed deficits

1. No explicit Firma A `TenantModuleEntitlement` source of truth.
2. No Firma A administration product surface for tenant lifecycle and module grants.
3. No separate Firma B tenant activation layer between platform entitlement and work activation.
4. Role scope is effectively tenant or edition; department, portfolio segment, work-set, record and sensitive-field scopes are not first-class.
5. The main shell shows work modules before establishing the Jobs/Home context.
6. The canonical aggregate name and data model cannot yet represent non-event work cleanly.
7. Travel exists as labels/capabilities/catalog items, not an itinerary/booking/service domain.
8. Form publication is not versioned; form approval is coupled to registration creation for one outcome.
9. External actors are modeled primarily as participant/sponsor token scopes instead of a general external principal and capability grant.
10. Module metadata has several sources of truth and only seven domain manifests.
11. Current dependency rules do not enforce feature ownership or ban direct cross-feature table access.
12. Large view files create broad change blast radius and make workflow-specific testing difficult.

## 5. Known defects that remain roadmap inputs

These findings must be revalidated during the named phase, not assumed fixed because static gates pass:

- manual payments above the threshold are persisted as `SUCCEEDED` with a static approver label instead of a genuine second-person approval;
- agreement-scoped sponsor tokens filter agreements but some related rights/orders/staff queries remain organization-wide;
- generic/public form auto-approval can create a downstream registration immediately; the target policy requires source-aware approval;
- route policy classification describes intended enforcement and must be paired with behavioral negative tests;
- auth-off demo mode is acceptable only in isolated development and must be impossible in production configuration;
- global slugs are compatible with the current single database but must remain tenant-safe at every lookup.

## 6. Reuse strategy

Do not rewrite the application. Build four compatibility seams:

1. `WorkIdentity` adapter over `EventEdition` and `EventSeries`.
2. `ModuleCatalog` adapter over current module/capability/permission registries.
3. `AuthorizationPolicy` adapter that can compare legacy and target decisions.
4. `ExternalExperience` adapter over portal configuration, tokens and content APIs.

Once each seam has two verified adapters—legacy and target—the callers migrate. Delete legacy code only after parity and rollback windows close.

