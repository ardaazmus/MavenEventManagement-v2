# Entitlement, Permission and Approval Architecture

## 1. Four independent activation layers

```text
Firma A grants module to Firma B
  AND Firma B activates module for workspace
  AND Firma B activates module for Work
  AND actor has action + scope permission
  => command/query may proceed
```

Models:

- `TenantModuleEntitlement`: platform grant, dates, limits, status and source.
- `TenantModuleActivation`: Firma B's workspace choice and defaults.
- `WorkModuleActivation`: selected module, configuration version, setup state and disable reason.
- `PermissionGrant`: actor/policy/action/scope/effect/validity.

A disabled module preserves data. A revoked platform entitlement blocks new operational commands but must offer controlled export/read access according to contract and retention policy.

## 2. Internal actor model

Internal staff are tenant users. Firma B may operate with one owner only; separation of duties is optional except for configured high-risk operations.

Default bootstrap:

- first verified tenant owner receives all currently entitled module actions;
- first work created by a one-person tenant assigns that owner as responsible and grants all active-work module actions;
- adding another staff member never silently reduces or transfers the owner's rights;
- high-risk two-person approval can be enabled by policy and must state that one-person tenants cannot complete it until a second approver exists.

Custom role names are display concepts. Authorization uses stable permission keys.

## 3. Scope dimensions

Scopes compose; they are not flattened into role names:

- tenant scope;
- department/business-domain scope;
- portfolio segment scope;
- work set or individual work scope;
- module scope;
- action scope;
- record ownership/assignment scope;
- sensitive-field scope.

Actions include at least:

- view, create, update, delete;
- approve, reject, request correction, confirm;
- send/publish;
- import/export;
- manage settings;
- manage team/permissions;
- view finance, personal, medical/passport and internal-note fields.

Example: a water-sector coordinator can view portfolio records linked to water-sector works, send draft campaigns for approval, and manage registrations in assigned works without seeing unrelated finance, private notes or other departments' works.

## 4. Policy evaluation interface

Use one deep interface:

```ts
authorize({
  principal,
  tenantId,
  workId,
  module,
  action,
  resource,
  requestedFields,
  workflowState,
}): AuthorizationDecision
```

The decision returns allow/deny, applied grants, failed condition, filtered field set and audit trace identifier. Avoid boolean helpers spread across UI and routes. Current `authorizeDualRead`, tenant guards and role dictionaries become internal adapters during migration.

## 5. External principals

External actors do not become tenant staff. Use:

- `ExternalPrincipal`: verified person or organization identity;
- `ExternalMembership`: relationship to one work and organization;
- `ExternalCapabilityGrant`: explicit action/resource/limit/validity;
- `ExternalSession`: short-lived, revocable, audience-bound session;
- `QuotaLedger`: granted/reserved/consumed/released quantities;
- `ExternalSubmission`: proposal created through the capability.

Capabilities may include:

- propose candidates/organizations;
- manage own invitees;
- view own quota and approved rights;
- edit own approved records within a time window;
- draft seating assignments;
- manage sponsor deliverables, staff, meetings or leads;
- export a named, minimized dataset.

They never imply access to the internal admin shell.

## 6. Quota versus permission

Quota answers “how much.” Permission answers “what action on which data.” Both must pass.

Example sponsor rule:

- capability: `guest.propose`;
- scope: sponsor agreement A, work W;
- quota: 20 accepted guests;
- proposal count does not consume final quota;
- approval reserves quota;
- confirmation consumes quota;
- rejection/cancellation releases reservation;
- sponsor sees own proposal status and remaining quantity, not unrelated participants.

## 7. Approval case model

Use a generic approval case with typed subject/outcome:

- subject kind/id and immutable source snapshot;
- tenant/work/module;
- source channel and submitter principal;
- current state;
- assigned reviewer or queue;
- validation issues and correction messages;
- decision actor/time/reason;
- outcome command and outcome record references;
- audit/event history;
- optimistic version for concurrent decisions.

State machine:

```text
DRAFT -> PENDING_APPROVAL
PENDING_APPROVAL -> NEEDS_CORRECTION | REJECTED | APPROVED
NEEDS_CORRECTION -> PENDING_APPROVAL | WITHDRAWN
APPROVED -> CONFIRMING -> CONFIRMED | CONFIRMATION_FAILED
```

Approval and confirmation are not synonyms. Approval accepts the proposal; confirmation proves all downstream records, quota, payment, credentials or schedule operations completed.

## 8. Finance-specific correction

Manual payment above the configured threshold must create a pending approval, not a successful payment with a static `approvedBy` label.

Required behavior:

- record creator and approver are authenticated user IDs;
- policy can forbid self-approval;
- pending payment does not change settled balance;
- approval rechecks remaining balance/currency/idempotency inside one transaction;
- rejection records reason and leaves order balance unchanged;
- all transitions are audited;
- legacy successful records are preserved as historical outcomes, not rewritten as newly approved.

## 9. Migration and parity

During transition, run legacy and target evaluators for the same request in shadow mode. Record mismatches without changing the legacy decision. Classify mismatch by missing entitlement, scope, action, field, workflow or external capability. Cut over per module only after intentional differences have accepted tests.

