# Module-by-Module Change Map

## Global surfaces

| Current module | Target placement | Required change | Preserve |
|---|---|---|---|
| Dashboard | Split into Firma B Home and Work Summary | Global home shows accessible work cards, portfolio/communication entry points and tenant alerts; work summary is lifecycle-aware and module-contributed | Existing aggregate endpoint logic, task/activity/KPI definitions |
| Editions | Jobs and Organizations | Rename at interface level to Works; support type/profile/client/responsible staff; retain series/edition history for recurring events | Draft creation, copy/series semantics, branding, capabilities, archive |
| Operations | Work Management | Work tasks, approvals, setup checklist and cross-module blockers; tenant-global tasks remain home-level | Task priorities, assignees, activity log |
| Archive | Global and work archive | Distinguish closed work, recurring event edition and immutable archive snapshots | Edition archive data and read-only behavior |

## Tenant administration

| Current module | Target placement | Required change | Preserve |
|---|---|---|---|
| Settings | Tenant Settings + Work Settings | Split company brand/contact/language/users from work identity/lifecycle/modules; remove ambiguity | Theme, tenant identity, user admin, notifications |
| Compliance | Tenant policy with work overrides | Policy presets, retention, consent, legal documents and subject requests; sensitive-field policies | DSAR/erasure/document vault/jurisdiction |
| Integrations | Tenant Integrations with work bindings | Provider config at tenant; explicit work/module bindings; secret masking and outbox observability | API integrations, logs, webhooks, outbox |
| Portals | External Experiences | Separate general mobile, personal, B2B, partner and travel configurations | Existing portal config, tokens, blocks, preview, branding |

## Portfolio and communications

| Current module | Target placement | Required change | Preserve |
|---|---|---|---|
| People | Global Portfolio and work-scoped People | Default global canonical view; inside work show relationship projection only; field policy and merge provenance | quick add, duplicate/merge, import, family relation, custom fields |
| Organizations | Global Portfolio and work-scoped Organizations | Add organization relationships, client/organizer/custom labels and visibility; do not duplicate organizations per work | contacts, hierarchy fields, role labels, vCard/export |
| Company Communications | General Communication | Audience builder from authorized portfolio segments and work relationships; approval and purpose/channel consent ledger before send; never infer consent from a permissive legacy boolean | customer contacts, templates, IYS/consent, campaign scheduling |
| Communications | Work Communication | Work-scoped templates/audiences/delivery status; no tenant-global leak | campaigns, send decisions, notifications, mail provider adapters |

## Registration and forms

| Current module | Target placement | Required change | Preserve |
|---|---|---|---|
| Registrations | Registration and Participation | Dynamic default categories plus tenant/work custom names; approval queue; identity/relationship/registration separated | imports, manual entry, waitlist, delegation, companions, exports |
| Forms | Form Studio and Submission Center | Versioned templates/publications; typed outcome mapping; source-aware approval; reusable tenant templates | field types, logic/GOTO, steps, quiz, public sharing, exports |
| Finance | Orders, Payments and Services | True distinct-actor manual-payment approval; paginated orders; server aggregates independent of page; work service catalog and customer-service charges | minor units, order/payment/refund, idempotency, reconciliation |
| Accounting | Work Ledger and Tenant Reporting | Link operational purchases/services to ledger; bounded/paginated reads, scope-filtered aggregation, permissions and close periods | income/expense, VAT/multi-currency, exports |

## Program and content

| Current module | Target placement | Required change | Preserve |
|---|---|---|---|
| Scientific | Scientific module | Manifest, setup checklist, custom committee/reviewer scopes and external reviewer experience | submissions, authors, reviews, decisions, COI rules |
| Program | Program module | Module-owned navigation/read model; publication state feeds external surfaces | rooms, sessions, assignments, materials, collision rules |
| Social & Tours | Experience Schedule | Generalize social/tour items as itinerary contributions where appropriate | approvals, assignments, participant feedback |

## Sponsor, exhibition and B2B

| Current module | Target placement | Required change | Preserve |
|---|---|---|---|
| Sponsorship | Sponsor and Exhibitor | Separate commercial agreement, presentation tier, rights/quota and external capability; test agreement/org grant scope across every subresource; no role-label implication; reserve/consume/release rights safely | tiers, packages, agreements, deliverables, leads, ROI |
| B2B | B2B module | Entitlement-gated external access, clear participant/partner roles, approval before publication | plans, assignments, mutual approval, meetings |
| Floor Studio | Deferred external/deep module | Keep current adapter until ownership/integration contract is stable; do not block core migration | plan/sync routes, booth links, capability flag |
| Media | Tenant Media Library + work folders | Media ownership, links, retention, safe external delivery and module contributions | system folders, ingestion, containment, exports |

## Logistics and onsite

| Current module | Target placement | Required change | Preserve |
|---|---|---|---|
| Accommodation | Accommodation module | Work-relationship and payer-policy integration; partner/customer views only through explicit capabilities | hotel/room/block/night/reservation/roommate models |
| Onsite | Venue and Onsite | Split setup, devices, check-in, scanning and occupancy interfaces; offline conflict handling | credential/scan, kiosk, occupancy, fast paths |
| Badges | Credential Production | Job queue, device adapter and approval/reprint policy | profiles/designs/instances/print queue |
| Certificates | Documents and Credentials | Issuance preconditions, revocation and personal-area delivery | definitions, issue records, print/export |

## New Travel and Customer Services module

Add only after Work, Portfolio and Permission foundations. It contributes:

- work wizard templates for individual/group/VIP travel;
- itinerary and booking records;
- service requests/fulfillment;
- travel documents and sensitive-field rules;
- costs linked to Finance/Accounting;
- customer travel portal widgets;
- forms that create travel-plan drafts and service requests;
- notifications for schedule/service changes.

It does not purchase tickets from another platform in the first version.

## Cross-module interaction rules

- Registration may request a finance order through Finance interface; it may not write payment tables.
- Forms emit a typed approved outcome; the owning module validates and creates its record.
- Sponsorship owns agreements and sponsor rights; Registration owns registrations; quota reservations use a shared entitlement interface.
- Program publishes schedule events; PWA consumes a read model, not Program tables.
- Travel creates accounting requests through Finance/Accounting interfaces.
- Dashboards consume module summary contributions/read models, not arbitrary direct queries added ad hoc.
- External experiences request minimized projections from owning modules.
- Cross-module flows publish the owner/consumer contract before migration; consumers read stable IDs/events/read models and do not write another module's tables.
- Registration capacity and sponsor/partner entitlement use one idempotent, concurrency-safe reservation lifecycle where a workflow consumes both.
