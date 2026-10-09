# Tasks: Kademeli Etkinlik Kurulum Rehberi / Setup Checklist (F-07)

**Input**: `specs/005-progressive-event-setup/plan.md`  
**Prerequisites**: 385/385 unit tests PASS, zero lint/typecheck errors.

---

## Task List

- [x] **Task 1: Core Setup Checklist Engine (`src/lib/events/setup-checklist.ts`)**
  - Define checklist step structure and status types.
  - Implement step evaluation logic for BASICS, STAKEHOLDER, STAFF, REGISTRATION, PROGRAM, PORTAL, PUBLISH.
  - Implement `computeEditionSetupChecklist(editionId, prisma)`.
  - Export pure evaluation helper for test mocking.

- [x] **Task 2: Setup Checklist API Endpoint (`src/app/api/editions/[id]/setup-checklist/route.ts`)**
  - Implement GET with `requireStaff()` and `resolveEditionContext`.
  - Return calculated checklist status.

- [x] **Task 3: Route Policy Classification & Git Staging (`scripts/route-policy.mjs`)**
  - Classify route as `STAFF`.
  - Stage files with `git add`.

- [x] **Task 4: UI Setup Checklist Component (`src/components/maven/views/setup-checklist-card.tsx` & `editions.tsx`)**
  - Create `SetupChecklistCard` with progress bar, step badges, and module quick-jump buttons.
  - Integrate into `EditionsView`.

- [x] **Task 5: Unit & Contract Tests (`tests-mini/event-setup-checklist.test.mjs`)**
  - Test calculation of completion percentage and next recommended step.
  - Test individual step completion triggers (branding, stakeholder, categories, etc.).
  - Verify route policy classification and security gates.
  - Add to `package.json` `test:unit` script.

- [x] **Task 6: Full Verification Gate**
  - Run `bun run typecheck`, `bun run lint`, `bun run policy:check`, `bun run i18n:scan`, `bun run lint:arch`, `bun run test:unit`.
  - Verify 100% pass across all gates.
