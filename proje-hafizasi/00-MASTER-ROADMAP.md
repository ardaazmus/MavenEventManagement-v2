# Maven Event Management V2 — Master Architecture and Delivery Roadmap

## 1. Objective

Transform the current event-edition-centric product into a sustainable multi-tenant work-management platform for PCOs and related operators while preserving the current congress, expo, registration, scientific, sponsorship, finance, accommodation, onsite, media, communication, portal, and compliance capabilities.

The product must support Firma B running:

- congresses, medical congresses, conferences and scientific meetings;
- trade fairs, expos and sponsor/exhibitor operations;
- corporate, social, wedding and special organizations;
- individual, group and VIP travel work;
- future work types added through templates and module contracts rather than broad rewrites.

## 2. Confirmed ownership hierarchy

```text
Firma A — Platform owner/operator
└── Tenant entitlement and lifecycle
    ├── Firma B — Customer tenant
    │   ├── Tenant staff, departments, portfolio and global communication
    │   ├── Work 1 — e.g. Su Fuarı
    │   │   ├── Client/Organizer: e.g. Akated
    │   │   ├── Activated modules
    │   │   ├── Work team and scoped permissions
    │   │   └── Public/personal/B2B/partner external experiences
    │   └── Work 2 — e.g. individual international trip
    └── Firma C — Another tenant, strictly isolated from Firma B
```

The client/organizer inside a work is not a tenant owner. It receives no internal administration access unless Firma B creates a separate, explicit, revocable external capability grant.

## 3. Canonical product language

| Canonical term | Meaning | Existing code relationship |
|---|---|---|
| Platform | Firma A product and operations plane | Partially represented by SaaS provision/subscription endpoints; no complete UI plane |
| Tenant | Firma B customer company | Existing `Tenant` |
| Work | Any commercial/operational job managed by Firma B | Target aggregate; initially compatible with existing `EventEdition` |
| Work Family | Recurring brand/series | Existing `EventSeries` |
| Work Type | Congress, expo, corporate event, travel, custom | Existing edition templates are a starting point, not sufficient |
| Work Profile | Individual/group, VIP/standard, public/private, complexity | New configuration dimensions, not modules |
| Client/Organizer | Person or organization for whom the work is performed | Existing `EventOrganizationAssignment` and `Organization` need clearer semantics |
| Portfolio | Tenant-level canonical people and organizations | Existing `Person`, `Organization`, `CustomerContact` need consolidation rules |
| Work Relationship | Work-specific role of a canonical person/organization | Existing participation, org assignment, sponsor agreement, invitations and custom roles |
| Module Entitlement | Firma A's upper bound for Firma B | Missing explicit source of truth |
| Tenant Activation | Firma B enables an entitled module for its workspace | Missing explicit layer |
| Work Activation | Firma B enables a tenant-active module for one work | Existing `EventCapability` is the main precursor |
| Actor Permission | Internal or external actor may perform an action in a scope | Existing RBAC and portal tokens are partial mechanisms |

## 4. Target architecture

### 4.1 Deployment shape

Use a modular monolith:

- one deployable application;
- one transactional database per environment in the current stage;
- strict tenant keys and authorization policies in every tenant-owned aggregate;
- feature modules with explicit interfaces and dependency declarations;
- transactional outbox for asynchronous integration;
- read models for expensive cross-module dashboards;
- no direct feature-module imports into another feature module's implementation.

This structure is sufficient for the foreseeable product. Pool, bridge and dedicated tenant databases are an operational scaling option, not a prerequisite. Do not introduce them until measured compliance, isolation or workload evidence demands them. The logical tenant contract must nevertheless avoid assumptions that make a later topology change impossible.

### 4.2 Stable Core modules

Core owns only cross-product invariants:

1. Platform tenant lifecycle and module entitlements.
2. Tenant identity, company profile and departments.
3. Authentication, sessions, users and invitations.
4. Authorization policy evaluation and permission trace.
5. Work identity, type, profile, lifecycle and activation.
6. Canonical people, organizations and portfolio segments.
7. Work relationships and external-party identities.
8. Approval cases and auditable decisions.
9. Form runtime contracts and versioned submissions.
10. Files/media references, notifications, consent, audit and outbox.

Feature modules do not own alternative copies of these concepts.

### 4.3 Feature modules

- Registration and participation
- Program and scientific content
- Sponsor and exhibitor operations
- Venue, floor and onsite operations
- Accommodation
- Travel and customer services
- Finance and accounting
- Communications and campaigns
- Forms and data collection
- Public/mobile/personal/B2B/partner experiences
- Reporting and analytics
- Compliance and integrations

### 4.4 Required module manifest

Each module declares one manifest consumed by navigation, entitlement, authorization, setup, summaries and tests:

```ts
type ModuleManifest = {
  id: ModuleId;
  version: number;
  owner: "core" | "feature";
  dependsOn: ModuleId[];
  conflictsWith?: ModuleId[];
  entitlementKey: string;
  tenantActivation: ActivationRule;
  workActivation: ActivationRule;
  permissions: PermissionDefinition[];
  navigation: NavigationContribution[];
  settings: SettingsContribution[];
  setupChecklist: ChecklistContribution[];
  summaryWidgets: SummaryContribution[];
  formOutcomes: FormOutcomeDefinition[];
  externalSurfaces: ExternalSurfaceContribution[];
  eventsPublished: DomainEventName[];
  eventsConsumed: DomainEventName[];
  migrations: MigrationDescriptor[];
  acceptanceTests: TestDescriptor[];
};
```

This replaces duplication across the current `MODULES`, `MODULE_COMPONENTS`, `MODULE_IDS`, capability mappings, role matrices, route policies and ad-hoc PWA settings. Migration is incremental: adapt current registries to the manifest before deleting any source.

## 5. Authorization decision order

Every command and sensitive query evaluates, in order:

1. authenticated identity or validated external session;
2. active tenant and tenant status;
3. tenant isolation of every requested resource;
4. Firma A module entitlement;
5. Firma B tenant module activation;
6. work activation, when work-scoped;
7. actor kind: internal staff or external principal;
8. action permission;
9. scope predicate: company, department, portfolio segment, work set, module, record ownership;
10. sensitive-field policy;
11. workflow-state preconditions;
12. audit obligation and rate limit.

Default is deny. UI visibility mirrors the result but never defines it.

## 6. Approval policy

Source trust and business approval are separate:

```text
Internal authorized manual entry
  -> VALIDATION_REQUIRED
  -> operational record, subject to audit and duplicate checks

External form/import/integration/partner proposal
  -> PENDING_APPROVAL
  -> NEEDS_CORRECTION | REJECTED | APPROVED
  -> CONFIRMED only after downstream operational preconditions succeed
```

Before confirmation, a proposal cannot consume final quota, create a valid credential/badge/certificate, finalize accommodation, generate definitive finance status, publish seating, or trigger definitive communications.

## 7. User-experience architecture

### 7.1 Firma B internal administration

After login, show `İşler ve Organizasyonlar`, not all work modules.

Global surfaces:

- Jobs and Organizations
- Portfolio
- General Communication
- Global Reports
- Tenant Settings

A work card shows header/logo or text identity, work name/type/profile, dates/location, lifecycle, client/organizer, responsible staff/department, active modules, open decisions and recent activity. Access filtering occurs before counts and cards are returned.

Opening a work changes context and presents:

- a narrow global rail;
- a contextual work sidebar;
- a role-aware Work Summary as the first screen;
- workflow-grouped module navigation;
- Work Settings separate from Tenant Settings.

### 7.2 External surfaces

Keep separate products and sessions:

1. General Event Mobile Experience — public/event-code information only.
2. Personal Participant Area — verified identity, own rights and records.
3. B2B Area — only verified actors with a B2B entitlement.
4. External Partner Portal — organizer/sponsor/partner capabilities explicitly granted by Firma B.
5. Customer Travel Portal — itinerary, bookings, services, documents, costs visible to the traveler/client according to policy.

They may share design tokens and backend interfaces but must not share the Firma B administration shell.

## 8. Phase dependency chain

```text
P0 Evidence freeze and feature inventory
  -> P1 Compatibility vocabulary and IDs
  -> P2 Platform entitlement source of truth
  -> P3 Permission policy and scope model
  -> P4 Work compatibility aggregate and backfill
  -> P5 Canonical portfolio and work relationships
  -> P6 Approval case and form outcome contracts
  -> P7 Unified module manifest and adapters
  -> P8 Firma B home and two-level information architecture
  -> P9 Work setup wizard and setup checklist
  -> P10 External surface separation
  -> P11 Travel and customer-services module
  -> P12 Module-by-module migration
  -> P13 Performance/read models/observability
  -> P14 Security, accessibility and regression closure
  -> P15 Pilot, cutover and legacy retirement
```

No phase may remove a legacy read path until parity metrics and rollback are demonstrated.

## 9. Completion definition

A micro-phase is complete only when:

- schema and runtime compatibility are documented;
- tenant and authorization negative tests pass;
- existing affected feature tests pass;
- new behavior has interface-level tests;
- migration has dry-run, idempotency and rollback evidence;
- UI has desktop and mobile evidence for affected screens;
- accessibility keyboard/focus/labels/reflow checks pass;
- performance budgets are measured for affected lists and dashboards;
- audit events contain actor, tenant, work, action, target, decision and timestamp;
- no unreviewed generated diff or unrelated feature change remains.

## 10. Explicit non-goals

- Approval of this roadmap alone does not authorize implementation. Once a user explicitly starts phase execution, implement only the bounded packages in `07-IMPLEMENTATION-PHASES-AND-AGENT-PACKAGES.md`; record evidence and preserve the phase gates.
- No database-per-tenant topology now.
- No runtime third-party plugin marketplace.
- No automatic airline/hotel booking provider integration; Firma B records purchases made through its own operational process.
- No visual copy of the supplied reference products; only their hierarchy, restraint and information-density principles are adopted.
