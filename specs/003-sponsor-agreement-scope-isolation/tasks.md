# Tasks: Sponsor Anlaşma Kapsam İzolasyonu (F-04)

**Input**: `specs/003-sponsor-agreement-scope-isolation/plan.md`  
**Prerequisites**: 378/378 unit tests PASS, zero lint/typecheck errors.

---

## Task List

- [x] **Task 1: Extend Scope Resolution Logic (`src/lib/portal/sponsor-scope.ts`)**
  - Implement `extractAgreementTag(text?: string | null): string | null`.
  - Implement `isItemInAgreementScope(item, tokenAgreementId)`.
  - Export functions with thorough unit test coverage.

- [x] **Task 2: Refine Sponsor Portal Route (`src/app/api/portal/sponsor/route.ts`)**
  - Apply `isItemInAgreementScope` to `entitlements` and `orders`.
  - Enrich `grant` object with `scope` and `isAgreementScoped`.

- [x] **Task 3: Contract & Unit Tests (`tests-mini/portal-sponsor-scope.test.mjs`)**
  - Test scope isolation between Agreement A and Agreement B for entitlements and orders.
  - Verify backward compatibility for organization-scoped tokens (`agreementId === null`).

- [x] **Task 4: Full Verification Gate**
  - Run `bun run typecheck`, `bun run lint`, `bun run test:unit`.
  - Verify 100% PASS with zero regressions.
