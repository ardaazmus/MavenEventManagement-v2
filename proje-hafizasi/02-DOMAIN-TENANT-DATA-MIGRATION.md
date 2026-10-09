# Domain, Tenant and Data Migration Design

## 1. Target aggregate model

```text
PlatformTenantAccount
├── TenantModuleEntitlement
├── Subscription and Usage
└── Tenant (Firma B)
    ├── Department
    ├── User / InternalMembership
    ├── Person / Organization / ContactPoint
    ├── PortfolioSegment / PortfolioMembership
    ├── WorkFamily
    └── Work
        ├── WorkType + WorkProfile
        ├── WorkClientRelationship
        ├── WorkModuleActivation
        ├── WorkTeamAssignment
        ├── PersonWorkRelationship
        ├── OrganizationWorkRelationship
        ├── ApprovalCase
        └── Feature-module records
```

Every tenant-owned record has an immutable `tenantId`. Every work-owned record is resolvable to exactly one tenant through a direct indexed key or a validated ownership chain. New high-volume records should carry both `tenantId` and `workId` when doing so removes repeated joins and is protected by consistency checks.

## 2. Work compatibility strategy

Do not rename `EventEdition` tables first. Introduce a domain interface:

```ts
type WorkIdentity = {
  id: string;
  tenantId: string;
  familyId: string | null;
  typeKey: string;
  profile: WorkProfile;
  name: string;
  lifecycle: string;
  startsAt: Date | null;
  endsAt: Date | null;
  timezone: string;
};
```

Phase rules:

1. Add `workTypeKey`, `profileJson` with a version discriminator, and explicit lifecycle metadata additively to the existing edition record or a one-to-one extension table.
2. Backfill event editions to event-compatible work types.
3. Serve work lists through the new interface while retaining edition APIs.
4. Add individual/group travel work types without pretending they are public events.
5. Change UI language and module contracts before physical table renames.
6. Consider table renames only after all callers use Work interfaces and rollback no longer depends on old generated clients.

## 3. Work type and profile taxonomy

Top-level groups:

- Events and gatherings
  - Congress / Conference
  - Medical / Scientific Congress
  - Trade Fair / Expo
  - Corporate Event
  - Social / Wedding / Private Event
- Travel and managed customer work
  - Individual Travel
  - Group Travel
  - Delegation / Hosted Trip
- Custom Work

Profiles are independent attributes:

- party size: individual, small group, large group;
- service level: standard, VIP;
- visibility: private, invite-only, public;
- location mode: in-person, virtual, hybrid, multi-location;
- organizer mode: own event, client work;
- complexity flags: scientific, exhibition, accommodation, travel, onsite, finance, external portal.

Do not encode every combination as a new enum or module.

## 4. Client and organizer relationship

`Organization` and `Person` remain tenant portfolio masters. Add a work relationship with:

- subject kind/id;
- system role key (`CLIENT`, `ORGANIZER`, `CO_ORGANIZER`, `SUPPORTER`, `VENUE`, `SUPPLIER`, etc.);
- Firma B-defined display label, such as `Düzenleyen` or `Destekleriyle`;
- sort order and presentation tier;
- brand/logo/header placement rules;
- commercial agreement reference;
- optional external principal link;
- explicit capability grant references;
- validity and revocation dates;
- created/approved/by audit fields.

Presentation order never grants permissions. A logo tier, sponsor tier or organizer label is not an access role.

## 5. Canonical portfolio

### 5.1 Master records

- `Person`: human identity/profile.
- `Organization`: company, association, university, public authority, venue, hotel, agency or other institution.
- `ContactPoint`: versioned email, phone, address and channel validity/consent metadata.
- `Relationship`: person-to-organization title/department/authority relationship.
- `PortfolioSegment`: Firma B-managed reusable audience definition.

### 5.2 Work-specific records

- `PersonWorkRelationship`: participant, reviewer, speaker, guest, family member, client contact, traveler, staff liaison, candidate, custom role.
- `OrganizationWorkRelationship`: organizer, client, sponsor, exhibitor, supporter, supplier, venue, hotel, public partner, custom role.
- `Registration`: registration-module workflow only.
- `Entitlement`: a specific right/quantity, never a general permission.

The current `CustomerContact` must become a campaign/contact projection linked to a canonical person or organization where possible. It must not silently create a second identity truth.

## 6. Travel and customer-services domain

Add as one feature module after Work and Portfolio foundations:

- `TravelerProfile` links a person relationship to passport/preferences data under sensitive-field policy.
- `Itinerary` and ordered `ItineraryItem` represent flight, rail, transfer, hotel, meeting, tour and free-time items.
- `BookingRecord` stores supplier/reference/status/cost/document links for a purchase recorded by Firma B; it does not require a booking-provider integration.
- `ServiceRequest` represents shuttle, taxi, interpreter, assistant, visa support, additional night, special meal, equipment or custom needs.
- `ServiceFulfillment` tracks supplier, responsible staff, schedule, status and actual cost.
- `ClientExpenseAllocation` categorizes costs for the work/customer without replacing accounting ledger entries.
- `TravelerDocument` references protected media with expiry and access policy.
- Customer Travel Portal read models show approved itinerary, documents, service status and allowed costs.

## 7. Migration discipline

Every schema phase uses:

1. additive migration;
2. compatibility write path;
3. idempotent backfill with checkpoint and counts;
4. read comparison metrics;
5. dual-read shadow period;
6. controlled read switch;
7. legacy write disable;
8. rollback window;
9. delayed cleanup migration.

Never combine add, backfill, cutover and delete in one deployment.

## 8. Required migration assertions

- Row counts by tenant and work match before/after.
- No cross-tenant foreign key or lookup appears.
- Every linked parent/child pair agrees on tenant and work ownership (including Order/Payment, EntitlementClaim/Participation/Registration, and FormSubmission/Form/Edition); report existing mismatches before backfill.
- Where composite tenant/work foreign keys are not practical, all write paths validate the full ownership chain and migration reconciliation proves the same invariant.
- Every current edition resolves to one work identity.
- Every existing participant, registration, organization assignment, sponsor agreement and portal token retains its current owner.
- Form submissions retain answers and source history.
- Money, consent, audit, export and media references are byte/amount equivalent.
- Archived editions remain immutable and viewable.
- Disabled modules retain all records.
- Backfill is safe to run twice.
- Rollback can serve old reads without losing writes made during the compatibility period.

## 9. Hybrid tenant topology decision

Do not build pool/bridge/dedicated databases now. Build topology-neutral interfaces:

- tenant resolution precedes repository access;
- repository calls require tenant context;
- no global unscoped list methods;
- public slugs resolve to tenant/work identity before domain reads;
- jobs, outbox, media and cache keys include tenant identity;
- export/backup/restore can target one tenant.

This allows a future dedicated-tenant move when evidence requires it without burdening current development with premature routing, migration orchestration and cross-database reporting complexity.
