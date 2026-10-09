# Forms, Portfolio and Communications Architecture

## 1. Portfolio access model

Firma B owns a durable portfolio independent of any work. Access is filtered by policy before search, counts, exports or campaign audience calculation.

Examples:

- Tenant owner: all authorized portfolio records and all work relationships.
- Department manager: records connected to assigned departments and work sets.
- Water-sector coordinator: water-sector segment and assigned water works only.
- Work registration staff: people in assigned works; no unrelated portfolio history.
- Finance staff: payer and invoice fields, not scientific review or internal CRM notes unless separately granted.

Search and deduplication must not leak the existence of inaccessible records. A restricted user receives a generic duplicate-review workflow handled by an authorized role rather than hidden record details.

## 2. Dynamic categories and roles

Ship default category templates for congress, expo, corporate event and travel. Store stable system purpose separately from custom labels.

Example:

```text
system key: SUPPORTER
Firma B display label: Destekleriyle
public display order: 30
access effect: none
```

Participant categories can include attendee, speaker, author, reviewer, committee, exhibitor staff, sponsor guest, organizer guest, companion, child, press, VIP, traveler and custom categories. Custom categories inherit no hidden permissions. Their operational effects are explicitly configured and validated.

## 3. Form lifecycle

```text
FormTemplate
  -> Draft FormVersion
  -> Validation
  -> Published FormVersion (immutable)
  -> Submission (version-pinned)
  -> Spam/validation assessment
  -> ApprovalCase
  -> Typed Outcome Command
  -> Outcome record(s)
```

Editing a published form creates a new version. Existing submissions always render and export using their original version and option labels.

## 4. Form outcome types

Core outcomes:

- portfolio person/organization candidate;
- registration candidate;
- invitation/RSVP response;
- speaker/reviewer/author application;
- sponsor/exhibitor candidate;
- sponsor guest proposal;
- travel inquiry or traveler profile draft;
- itinerary preference;
- service request;
- accommodation request;
- B2B meeting request;
- quiz/evaluation/feedback result;
- general CRM response.

Each module registers an outcome handler through its interface. The form runtime does not write module tables directly.

## 5. Source trust policy

- Authorized Firma B manual entry: can create operational records directly when the user has permission, but still runs validation, duplicate detection and audit.
- External public form: always proposal/pending approval unless the form outcome is explicitly non-operational feedback/quiz.
- Partner portal: pending approval, scoped to the grant and source organization.
- XLS/XLSX/CSV import: preview, row validation, deduplication and approval policy; source file hash retained.
- Integration/webhook: signed source plus pending approval unless a separately approved trusted automation policy exists.

“Auto approve” must be replaced with a narrowly named policy that states outcome type, source, work, conditions and accountable owner. It cannot be a generic form switch.

## 6. Audience builder

Campaign audiences are saved queries, not copied contact lists. Filters may use:

- portfolio segment;
- person/organization attributes;
- work relationships and historical participation;
- category and consent purpose;
- geography, industry, responsible department and owner;
- engagement and delivery state;
- exclusions and suppression lists.

Campaign eligibility must use purpose/channel consent evidence from the consent ledger. Legacy contact booleans, absent values and imported blank cells must never imply opt-in or erase a recorded consent decision. Canonical Person/Organization identity, contact points, campaign projections and consent evidence remain separate records with provenance.

At send approval time, materialize an immutable recipient snapshot containing policy decision, consent basis and contact point version. Later portfolio changes do not rewrite historical evidence.

Import types can keep separate domain-specific engines, but each records the same minimum receipt: source identity and file hash, preview result, row-level accepted/rejected/skipped decisions, authenticated actor, approval status, commit result and retry/idempotency key. Imported external data remains pending until Firma B approves it.

## 7. Communication workflow

```text
Draft content
 -> choose authorized audience
 -> estimate and deduplicate
 -> consent/suppression decision
 -> optional approval
 -> schedule/send
 -> provider delivery events
 -> bounce/complaint/unsubscribe updates
 -> campaign analytics and audit
```

Global Firma B communication supports announcements, greetings, invitations and portfolio campaigns. Work communication is scoped to one work. Templates may be tenant-global with work overrides; provider credentials stay tenant-global and secret-protected.

## 8. Required UI

### Portfolio

- People, Organizations, Segments and Data Quality tabs.
- Saved views with visible scope explanation.
- Relationship timeline by work without exposing unauthorized works.
- Merge review with source/provenance and reversible audit reference.
- Import preview with valid/warning/error counts and downloadable error rows.

### Form Studio

- Template/version/status header.
- Build, Logic, Outcome, Audience, Approval, Publish and Submissions sections.
- Plain-language helper text and examples for every policy choice.
- Preview as public, verified participant and partner where relevant.
- Publish checklist: identity fields, consent, outcome, reviewer queue, confirmation messages, rate/spam controls.

### Submission Center

- Queues for pending, correction requested, rejected, approved, confirming, failed and confirmed.
- Source, work, submitter, duplicate risk and validation badges.
- Side-by-side submitted value, canonical value and proposed change.
- Bulk decision only for homogeneous low-risk outcomes; finance/identity/sensitive changes remain individual.

## 9. Data-quality gates

- deterministic email/phone normalization with original retained;
- fuzzy matches are suggestions, never automatic identity merges;
- canonical identity and contact consent are independent;
- imported blank values do not erase existing data without explicit mode;
- every merge, split, correction and outcome records provenance;
- exports apply field policy, minimization, purpose and watermark/audit rules.

