import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  FLOW_ACTION_POLICY,
  FLOW_ACTIONS,
  policyForFlowAction,
  assertFlowPolicyIntegrity,
  resolveFlowEdition,
  authorizeFlowAction,
  getEntityPolicy,
} from "../src/lib/api/permissions.ts";
import { SYSTEM_ROLE_DEFINITIONS } from "../scripts/seed-roles.mjs";

// N-01: /api/flows aksiyon kapısı sözleşmesi.
// Route'taki `case "..."` listesi ile FLOW_ACTION_POLICY birebir eşleşmelidir —
// yeni aksiyon eklenip eşleşmeye yazılmazsa bu test kırmızıya döner (fail-closed).

function routeActions() {
  const src = fs.readFileSync("src/app/api/flows/route.ts", "utf8");
  const found = [...src.matchAll(/case "([^"]+)":/g)].map((m) => m[1]);
  return [...new Set(found)];
}

test("N-01 - route aksiyonları ile FLOW_ACTION_POLICY birebir eşleşir", () => {
  const inRoute = routeActions().sort();
  assert.ok(inRoute.length >= 15, `route'ta en az 15 aksiyon beklenir (bulunan: ${inRoute.length})`);
  assert.deepStrictEqual([...FLOW_ACTIONS].sort(), inRoute, "Eşlemede eksik/fazla aksiyon var");
});

test("N-01 - eşleme bütünlüğü: entity kayıtlı + eylem izinli", () => {
  assert.deepStrictEqual(assertFlowPolicyIntegrity(), [], "Bozuk eşleme satırı var");
  for (const action of FLOW_ACTIONS) {
    const policy = policyForFlowAction(action);
    assert.ok(policy, `${action} eşleşmeli`);
    assert.ok(getEntityPolicy(policy.entity), `${action} → entity kayıtlı olmalı`);
  }
});

test("N-01 - bilinmeyen aksiyon fail-closed", async () => {
  assert.strictEqual(policyForFlowAction("nope.unknown"), null);
  assert.strictEqual(policyForFlowAction(undefined), null);
  const res = await authorizeFlowAction({ actor: null, action: "nope.unknown", body: {}, prisma: {} });
  assert.strictEqual(res.authorized, false);
  assert.strictEqual(res.unknownAction, true);
  assert.strictEqual(res.reason, "UNKNOWN_FLOW_ACTION");
});

test("N-01 - auth-off demo bypass korunur (aktörsüz istek açık)", async () => {
  const noopPrisma = new Proxy({}, { get: () => () => Promise.resolve(null) });
  for (const action of ["finance.refund", "edition.publish", "person.merge", "capability.toggle"]) {
    const res = await authorizeFlowAction({ actor: null, action, body: {}, prisma: noopPrisma });
    assert.strictEqual(res.authorized, true, `${action} demo'da açık olmalı`);
    assert.strictEqual(res.source, "demo_bypass");
  }
});

// DB atamasız personel → legacy static matris (MODULE_ALLOWED_ROLES).
function legacyPrisma() {
  const nil = { findUnique: async () => null };
  return {
    registration: nil,
    invitation: nil,
    entitlement: nil,
    order: nil,
    reservation: nil,
    boothUnit: nil,
    certificateDefinition: nil,
    eventCapability: nil,
    b2bAssignment: nil,
    userRoleAssignment: { findMany: async () => [] },
  };
}

const actor = (role) => ({ uid: "u-legacy", role, tenantId: "t1" });

test("N-01 - legacy matris: yetkisiz modül 403 (örn. ONSITE + finance.refund)", async () => {
  const res = await authorizeFlowAction({
    actor: actor("ONSITE_MANAGER"),
    action: "finance.refund",
    body: { orderId: "o1" },
    prisma: legacyPrisma(),
  });
  assert.strictEqual(res.authorized, false, "ONSITE_MANAGER iade açamamalı");
  assert.strictEqual(res.source, "legacy_fallback");
});

test("N-01 - legacy matris: doğal sahip roller geçer", async () => {
  const prisma = legacyPrisma();
  const granted = [
    ["REGISTRATION_MANAGER", "registration.decide", { registrationId: "r1" }],
    ["REGISTRATION_MANAGER", "reservation.confirm", { reservationId: "r1" }],
    ["FINANCE_MANAGER", "finance.manualPayment", { orderId: "o1" }],
    ["SPONSORSHIP_MANAGER", "sponsor.guest", { entitlementId: "e1" }],
    ["SPONSORSHIP_MANAGER", "b2b.approve", { assignmentId: "b1" }],
    ["EVENT_MANAGER", "edition.publish", { editionId: "ed1" }],
    ["EVENT_MANAGER", "capability.toggle", { editionId: "ed1", key: "X" }],
    ["REGISTRATION_MANAGER", "person.merge", { sourceId: "s", targetId: "t" }],
    ["SCIENTIFIC_MANAGER", "certificate.generate", { definitionId: "d1" }],
    ["ONSITE_MANAGER", "reservation.cancel", { reservationId: "r1" }],
  ];
  for (const [role, action, body] of granted) {
    const res = await authorizeFlowAction({ actor: actor(role), action, body, prisma });
    assert.strictEqual(res.authorized, true, `${role} + ${action} geçmeli`);
  }
});

test("N-01 - DB RBAC: izin veren atama GRANT, vermeyen kesin DENY", async () => {
  const base = legacyPrisma();
  const withAssignment = (permissions) => ({
    ...base,
    userRoleAssignment: {
      findMany: async () => [{ role: { key: "REGISTRATION_MANAGER", permissions } }],
    },
  });
  const grant = await authorizeFlowAction({
    actor: actor("REGISTRATION_MANAGER"),
    action: "registration.decide",
    body: { registrationId: "r1" },
    prisma: withAssignment([{ module: "registrations", action: "UPDATE" }]),
  });
  assert.strictEqual(grant.authorized, true);
  assert.strictEqual(grant.source, "db_rbac");

  const deny = await authorizeFlowAction({
    actor: actor("REGISTRATION_MANAGER"),
    action: "registration.decide",
    body: { registrationId: "r1" },
    prisma: withAssignment([{ module: "registrations", action: "VIEW" }]),
  });
  assert.strictEqual(deny.authorized, false);
  assert.strictEqual(deny.reason, "ROLE_PERMISSION_DENIED");
});

test("N-01 - kapsam çözümleme: hedef edisyon bulunur, çözülemezse TENANT", async () => {
  const prisma = {
    ...legacyPrisma(),
    registration: { findUnique: async () => ({ editionId: "ed-reg" }) },
    order: { findUnique: async () => ({ editionId: "ed-ord" }) },
    b2bAssignment: { findUnique: async () => ({ plan: { editionId: "ed-b2b" } }) },
  };
  assert.strictEqual(await resolveFlowEdition("registration.decide", { registrationId: "r" }, prisma), "ed-reg");
  assert.strictEqual(await resolveFlowEdition("finance.refund", { orderId: "o" }, prisma), "ed-ord");
  assert.strictEqual(await resolveFlowEdition("b2b.respond", { assignmentId: "b" }, prisma), "ed-b2b");
  assert.strictEqual(await resolveFlowEdition("edition.publish", { editionId: "ed-x" }, prisma), "ed-x");
  assert.strictEqual(await resolveFlowEdition("person.merge", { sourceId: "s", targetId: "t" }, prisma), "TENANT");
  assert.strictEqual(await resolveFlowEdition("registration.cancel", {}, prisma), "TENANT");
  assert.strictEqual(await resolveFlowEdition("invitation.respond", { invitationId: "missing" }, prisma), "TENANT");
});

// Tohum kapsamı: her flows (module, action) çifti doğal sahip rolün tohumunda OLMALI.
// Böylece kapı, tohum rollerle çalışan kurulumlarda meşru işlemi 403'e düşürmez.
test("N-01 - tohum kapsamı: her aksiyonun doğal sahibi seed'de izinli", () => {
  const byKey = new Map(SYSTEM_ROLE_DEFINITIONS.map((r) => [r.key, r]));
  const has = (roleKey, module, action) =>
    (byKey.get(roleKey)?.permissions ?? []).some((p) => p.module === module && p.action === action);
  const owner = {
    "registration.decide": "REGISTRATION_MANAGER",
    "registration.cancel": "REGISTRATION_MANAGER",
    "sponsor.guest": "SPONSORSHIP_MANAGER",
    "finance.manualPayment": "FINANCE_MANAGER",
    "finance.refund": "FINANCE_MANAGER",
    "booth.allocate": "SPONSORSHIP_MANAGER",
    "reservation.confirm": "REGISTRATION_MANAGER",
    "reservation.cancel": "REGISTRATION_MANAGER",
    "certificate.generate": "SCIENTIFIC_MANAGER",
    "edition.publish": "EVENT_MANAGER",
    "person.merge": "EVENT_MANAGER",
    "invitation.respond": "REGISTRATION_MANAGER",
    "capability.toggle": "EVENT_MANAGER",
    "b2b.respond": "SPONSORSHIP_MANAGER",
    "b2b.approve": "SPONSORSHIP_MANAGER",
  };
  for (const [flowAction, policy] of Object.entries(FLOW_ACTION_POLICY)) {
    const mod = getEntityPolicy(policy.entity).module;
    const roleKey = owner[flowAction];
    assert.ok(roleKey, `${flowAction} için sahip rol tanımlı olmalı`);
    assert.ok(has(roleKey, mod, policy.action), `${roleKey} tohumunda ${mod}/${policy.action} yok (${flowAction})`);
  }
});
