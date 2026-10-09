# Tasks: Rol ve Paydaş Esnekliği (F-06 & CONTEXT.md)

**Input**: `specs/004-role-and-stakeholder-flexibility/plan.md`  
**Prerequisites**: 379/379 unit tests PASS, zero lint/typecheck errors.

---

## Task List

- [x] **Task 1: Core Organization Roles & Label Resolver (`src/lib/organization-roles.ts`)**
  - Define `STANDARD_ORG_ROLES` and `ORG_ROLE_CATEGORIES`.
  - Implement `isValidOrgRole(role)`.
  - Implement `getOrgRoleCategory(role)`.
  - Implement `resolveOrgRoleDisplay(role, customLabel)`.
  - Implement `parseOrgRoleMetadata(notes)` and `serializeOrgRoleMetadata(notes, meta)`.

- [x] **Task 2: Expand Portal Token Scope (`src/lib/api/portal-tokens.ts`)**
  - Add `"CLIENT"` to `PortalTokenScope`.
  - Ensure compatibility with existing token methods.

- [x] **Task 3: Client Portal Endpoint (`src/app/api/portal/client/route.ts`)**
  - Implement GET with token validation, scope checking, and executive overview data.
  - Enforce confidentiality guard (no internal cost margins or confidential staff secrets leaked).

- [x] **Task 4: Client Portal Grants Endpoint (`src/app/api/portal/client-grants/route.ts`)**
  - Implement POST, GET, DELETE with `requireAdmin()` and audit logging.

- [x] **Task 5: Route Policy Classification & Git Staging (`scripts/route-policy.mjs`)**
  - Classify both new routes (`src/app/api/portal/client/route.ts` as `PUBLIC`, `src/app/api/portal/client-grants/route.ts` as `ADMIN`).
  - Stage files with `git add` to satisfy gitignore guard.

- [x] **Task 6: Unit & Contract Tests (`tests-mini/organization-roles-and-client-portal.test.mjs`)**
  - Test role categorization and custom label resolution.
  - Test client portal token issuance, validation, and scope verification.
  - Test access denial for revoked/expired/wrong-scope tokens.
  - Test privacy guard (no internal secrets leaked in executive view).

- [x] **Task 7: Full Verification Gate**
  - Run `bun run typecheck`, `bun run lint`, `bun run policy:check`, `bun run i18n:scan`, `bun run lint:arch`, `bun run test:unit`.
  - Verify 100% pass with zero regressions.
