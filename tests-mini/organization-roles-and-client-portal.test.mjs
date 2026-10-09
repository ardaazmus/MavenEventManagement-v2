import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";

const orgRolesLibPath = path.resolve("src/lib/organization-roles.ts");
const routePolicyPath = path.resolve("scripts/route-policy.mjs");

test("F-06-1 — Standart kurum rol kümesi ve doğrulama (isValidOrgRole)", async () => {
  const { STANDARD_ORG_ROLES, isValidOrgRole } = await import(pathToFileURL(orgRolesLibPath).href);

  assert.strictEqual(STANDARD_ORG_ROLES.length, 17);
  assert.strictEqual(isValidOrgRole("CLIENT"), true);
  assert.strictEqual(isValidOrgRole("HOST"), true);
  assert.strictEqual(isValidOrgRole("EVENT_OWNER"), true);
  assert.strictEqual(isValidOrgRole("PCO"), true);
  assert.strictEqual(isValidOrgRole("SPONSOR"), true);
  assert.strictEqual(isValidOrgRole("VENUE"), true);

  assert.strictEqual(isValidOrgRole("HACKER"), false);
  assert.strictEqual(isValidOrgRole("UNKNOWN_ROLE"), false);
  assert.strictEqual(isValidOrgRole(""), false);
});

test("F-06-2 — Rol kategorizasyonu ve Müşteri (Commissioner) ayrımı", async () => {
  const { getOrgRoleCategory, isCommissionerRole } = await import(pathToFileURL(orgRolesLibPath).href);

  assert.strictEqual(getOrgRoleCategory("CLIENT"), "COMMISSIONER");
  assert.strictEqual(getOrgRoleCategory("EVENT_OWNER"), "COMMISSIONER");
  assert.strictEqual(isCommissionerRole("CLIENT"), true);
  assert.strictEqual(isCommissionerRole("EVENT_OWNER"), true);

  assert.strictEqual(getOrgRoleCategory("HOST"), "ORGANIZER");
  assert.strictEqual(getOrgRoleCategory("PCO"), "ORGANIZER");
  assert.strictEqual(isCommissionerRole("PCO"), false);

  assert.strictEqual(getOrgRoleCategory("SPONSOR"), "COMMERCIAL");
  assert.strictEqual(getOrgRoleCategory("EXHIBITOR"), "COMMERCIAL");
  assert.strictEqual(isCommissionerRole("SPONSOR"), false);

  assert.strictEqual(getOrgRoleCategory("VENUE"), "FACILITY");
  assert.strictEqual(getOrgRoleCategory("SUPPORTER"), "PARTNER");
  assert.strictEqual(getOrgRoleCategory("INVALID"), "OTHER");
});

test("F-06-3 — Özel etiket çözümleme (resolveOrgRoleDisplay)", async () => {
  const { resolveOrgRoleDisplay } = await import(pathToFileURL(orgRolesLibPath).href);

  // Varsayılan etiketler
  assert.strictEqual(resolveOrgRoleDisplay("CLIENT"), "Müşteri / Düzenleyen Kurum");
  assert.strictEqual(resolveOrgRoleDisplay("HOST"), "Ev Sahibi");
  assert.strictEqual(resolveOrgRoleDisplay("PCO"), "PCO (Profesyonel Organizatör)");

  // Özel tanımlı etiketler (Firma B özelleştirmesi)
  assert.strictEqual(resolveOrgRoleDisplay("CLIENT", "Türk Kardiyoloji Derneği"), "Türk Kardiyoloji Derneği");
  assert.strictEqual(resolveOrgRoleDisplay("CLIENT", "   "), "Müşteri / Düzenleyen Kurum");
  assert.strictEqual(resolveOrgRoleDisplay("CLIENT", null), "Müşteri / Düzenleyen Kurum");
  assert.strictEqual(resolveOrgRoleDisplay("EVENT_OWNER", "Müşteri Şirket"), "Müşteri Şirket");
});

test("F-06-4 — Kurum rol meta serileştirme ve ayrıştırma (parse/serializeOrgRoleMetadata)", async () => {
  const { parseOrgRoleMetadata, serializeOrgRoleMetadata } = await import(pathToFileURL(orgRolesLibPath).href);

  const baseNotes = "Sözleşme no: 2026/A-12. Saha yetkilisi atandı.";
  const meta = { customLabel: "Kongre Sahibi Dernek", priority: 1, isClientStakeholder: true };

  const serialized = serializeOrgRoleMetadata(baseNotes, meta);
  assert.ok(serialized.includes(baseNotes));
  assert.ok(serialized.includes("__ORG_ROLE_META__:"));

  const parsed = parseOrgRoleMetadata(serialized);
  assert.strictEqual(parsed.cleanNotes, baseNotes);
  assert.strictEqual(parsed.meta.customLabel, "Kongre Sahibi Dernek");
  assert.strictEqual(parsed.meta.priority, 1);
  assert.strictEqual(parsed.meta.isClientStakeholder, true);

  // Boş veya bozuk metin koruması
  assert.deepStrictEqual(parseOrgRoleMetadata(null), { cleanNotes: "", meta: {} });
  assert.deepStrictEqual(parseOrgRoleMetadata("Salt düz metin"), { cleanNotes: "Salt düz metin", meta: {} });
  assert.deepStrictEqual(parseOrgRoleMetadata("Not __ORG_ROLE_META__:invalid-json"), { cleanNotes: "Not __ORG_ROLE_META__:invalid-json", meta: {} });
});

test("F-06-5 — Client Portal erişim kontrolü ve kapsam izolasyonu simülasyonu", async () => {
  // CLIENT kapsamı simülasyonu
  function checkClientPortalAccess(token) {
    if (!token) return { ok: false, status: 401, error: "Portal belirteci gerekli" };
    if (token.revokedAt) return { ok: false, status: 410, error: "Belirteç iptal edilmiş" };
    if (token.expiresAt.getTime() <= Date.now()) return { ok: false, status: 410, error: "Belirtecin süresi dolmuş" };
    if (token.scope !== "CLIENT") return { ok: false, status: 403, error: "Bu belirteç müşteri portalı için yetkili değil" };
    return { ok: true, status: 200 };
  }

  const validClientToken = {
    scope: "CLIENT",
    editionId: "ed_1",
    organizationId: "org_1",
    expiresAt: new Date(Date.now() + 86400000),
    revokedAt: null,
  };

  assert.strictEqual(checkClientPortalAccess(validClientToken).ok, true);

  // SPONSOR jetonu müşteri portalına giremez (403)
  const sponsorToken = { ...validClientToken, scope: "SPONSOR" };
  assert.strictEqual(checkClientPortalAccess(sponsorToken).ok, false);
  assert.strictEqual(checkClientPortalAccess(sponsorToken).status, 403);

  // PARTICIPANT jetonu müşteri portalına giremez (403)
  const participantToken = { ...validClientToken, scope: "PARTICIPANT" };
  assert.strictEqual(checkClientPortalAccess(participantToken).ok, false);
  assert.strictEqual(checkClientPortalAccess(participantToken).status, 403);

  // İptal edilmiş jeton (410)
  const revokedToken = { ...validClientToken, revokedAt: new Date() };
  assert.strictEqual(checkClientPortalAccess(revokedToken).ok, false);
  assert.strictEqual(checkClientPortalAccess(revokedToken).status, 410);

  // Süresi dolmuş jeton (410)
  const expiredToken = { ...validClientToken, expiresAt: new Date(Date.now() - 1000) };
  assert.strictEqual(checkClientPortalAccess(expiredToken).ok, false);
  assert.strictEqual(checkClientPortalAccess(expiredToken).status, 410);
});

test("F-06-6 — Route Policy envanterinde Client Portal uçlarının doğrulanması", async () => {
  const { ROUTE_POLICY_DEFINITIONS } = await import(pathToFileURL(routePolicyPath).href);

  assert.ok(ROUTE_POLICY_DEFINITIONS["src/app/api/portal/client/route.ts"]);
  assert.strictEqual(ROUTE_POLICY_DEFINITIONS["src/app/api/portal/client/route.ts"].category, "PUBLIC");
  assert.strictEqual(ROUTE_POLICY_DEFINITIONS["src/app/api/portal/client/route.ts"].authRequired, false);

  assert.ok(ROUTE_POLICY_DEFINITIONS["src/app/api/portal/client-grants/route.ts"]);
  assert.strictEqual(ROUTE_POLICY_DEFINITIONS["src/app/api/portal/client-grants/route.ts"].category, "ADMIN");
  assert.strictEqual(ROUTE_POLICY_DEFINITIONS["src/app/api/portal/client-grants/route.ts"].authRequired, true);
});
