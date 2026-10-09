# Tasks: Tenant ve Ürün Entitlement Sözleşmesi (F-05 & CONTEXT.md)

**Input**: `specs/002-tenant-module-entitlements/plan.md`  
**Prerequisites**: 371/371 unit tests PASS, zero lint/typecheck errors.

---

## Task List

- [x] **Task 1: Core Entitlement Logic (`src/lib/tenant-entitlements.ts`)**
  - Define plan matrix for `TRIAL`, `BASIC`, `PRO`, `ENTERPRISE`.
  - Implement `resolveTenantEntitlements(tenantId, dbClient?)`.
  - Implement `isTenantCapabilityEntitled(tenantId, capabilityKey, dbClient?)`.
  - Implement `setTenantEntitlementOverride(tenantId, module, enabled, grantedBy?, dbClient?)`.

- [x] **Task 2: Platform Admin API Endpoint (`src/app/api/saas/entitlements/route.ts`)**
  - Implement `GET`: Super-admin gated (`requireSuperAdmin`), returns tenant plan, overrides, and effective modules.
  - Implement `PUT`: Super-admin gated, updates override and records `ActivityLog` entry.

- [x] **Task 3: Route Policy Inventory Registration (`scripts/route-policy.mjs`)**
  - Register `src/app/api/saas/entitlements/route.ts` as `ADMIN` with `requireSuperAdmin`.
  - Verify `npm run policy:check` passes without unregistered route errors.

- [x] **Task 4: Enforce Entitlement in `capability.toggle` (`src/app/api/flows/route.ts`)**
  - Resolve edition's tenant before enabling.
  - Guard `enabled: true` with `isTenantCapabilityEntitled(tenantId, key)`.
  - Return `403 Forbidden` (`PLATFORM_MODULE_UNENTITLED`) if not entitled.
  - Allow `enabled: false` unconditionally.

- [x] **Task 5: Contract Test Suite (`tests-mini/tenant-module-entitlements.test.mjs`)**
  - Test TE-1: Plan baseline entitlements.
  - Test TE-2: Tenant override grant and revoke.
  - Test TE-3: Override ActivityLog audit generation.
  - Test TE-4: isTenantCapabilityEntitled mapping and fail-closed checks.
  - Test TE-5: capability.toggle 403 enforcement simulation.
  - Test TE-6: capability.toggle enabled:false unrestricted allowance.
  - Test TE-7: /api/saas/entitlements route contract and ADMIN policy classification.

- [x] **Task 6: Test Suite Registration & Verification**
  - Add `tests-mini/tenant-module-entitlements.test.mjs` to `package.json` `test:unit`.
  - Run `bun run typecheck`, `bun run lint`, `bun run policy:check`, `bun run test:unit`.
  - Ensure 100% PASS with zero regressions.
