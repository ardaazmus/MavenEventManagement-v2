import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createIsolatedTestDb } from "../tests/support/test-db.mjs";

const gatePath = path.resolve("src/lib/auth/session-gate.ts");
const sessionPath = path.resolve("src/lib/auth/session.ts");

test("P06.4b - session cookie roundtrip preserves sv; legacy cookies parse without sv", async () => {
  const { serializeSession, parseSession } = await import(pathToFileURL(sessionPath).href);
  const now = Math.floor(Date.now() / 1000);

  const withSv = serializeSession({ uid: "u1", role: "ORG_ADMIN", tenantId: "t1", iat: now, exp: now + 3600, sv: 3 });
  const parsed = parseSession(withSv);
  assert.ok(parsed, "fresh token must parse");
  assert.strictEqual(parsed.sv, 3, "sv must survive roundtrip");

  const legacy = serializeSession({ uid: "u1", role: "ORG_ADMIN", tenantId: "t1", iat: now, exp: now + 3600 });
  const parsedLegacy = parseSession(legacy);
  assert.ok(parsedLegacy, "legacy token without sv must still parse");
  assert.strictEqual(parsedLegacy.sv, undefined);
});

test("P06.4b - isSessionLive decision matrix", async () => {
  const { isSessionLive } = await import(pathToFileURL(gatePath).href);
  const live = { status: "ACTIVE", sessionVersion: 2, tenantId: "t1" };

  assert.strictEqual(isSessionLive({ sessionSv: 2, user: live, headerTenantId: "t1" }), true, "ACTIVE + sv match + tenant match lives");
  assert.strictEqual(isSessionLive({ sessionSv: 1, user: live, headerTenantId: "t1" }), false, "stale sv dies (post-disable cookie)");
  assert.strictEqual(isSessionLive({ sessionSv: 2, user: { ...live, status: "DISABLED" }, headerTenantId: "t1" }), false, "DISABLED user dies even with matching sv");
  assert.strictEqual(isSessionLive({ sessionSv: 2, user: null, headerTenantId: "t1" }), false, "deleted user dies");
  assert.strictEqual(isSessionLive({ sessionSv: 2, user: live, headerTenantId: "t2" }), false, "tenant binding enforced");
  assert.strictEqual(isSessionLive({ sessionSv: 2, user: { ...live, tenantId: "t2" }, headerTenantId: "t1" }), false, "user tenant drift dies");

  // Back-compat: pre-P06.4 cookies carry no sv and match only version 0
  assert.strictEqual(isSessionLive({ sessionSv: undefined, user: { ...live, sessionVersion: 0 }, headerTenantId: "t1" }), true, "legacy cookie + version 0 lives");
  assert.strictEqual(isSessionLive({ sessionSv: undefined, user: live, headerTenantId: "t1" }), false, "legacy cookie dies after any disable bump");
  assert.strictEqual(isSessionLive({ sessionSv: NaN, user: live, headerTenantId: "t1" }), false, "non-numeric sv fails closed");
});

test("P06.4b - disable/enable interop: gate follows lifecycle version bumps (isolated DB)", async () => {
  const { isSessionLive } = await import(pathToFileURL(gatePath).href);
  const { disableUser, enableUser } = await import(pathToFileURL(path.resolve("src/lib/users/lifecycle.ts")).href);
  const iso = await createIsolatedTestDb("p06-4b");
  try {
    const tenant = await iso.prisma.tenant.create({ data: { name: "T", slug: `t-p064b-${Date.now()}` } });
    const owner = await iso.prisma.user.create({ data: { tenantId: tenant.id, email: "o@test.local", name: "O", role: "ORG_OWNER" } });
    const staff = await iso.prisma.user.create({ data: { tenantId: tenant.id, email: "s@test.local", name: "S", role: "VIEWER" } });
    const load = (id) => iso.prisma.user.findUnique({ where: { id }, select: { status: true, sessionVersion: true, tenantId: true } });

    // Pre-disable cookie (sv 0) lives
    assert.strictEqual(isSessionLive({ sessionSv: 0, user: await load(staff.id), headerTenantId: tenant.id }), true);

    // Disable kills the same cookie (version 0 -> 1)
    await disableUser(iso.prisma, { tenantId: tenant.id, actorUserId: owner.id, actorMaxRank: 100, targetUserId: staff.id });
    assert.strictEqual(isSessionLive({ sessionSv: 0, user: await load(staff.id), headerTenantId: tenant.id }), false);

    // Re-enable does NOT resurrect the old cookie
    await enableUser(iso.prisma, { tenantId: tenant.id, actorUserId: owner.id, actorMaxRank: 100, targetUserId: staff.id });
    const reloaded = await load(staff.id);
    assert.strictEqual(isSessionLive({ sessionSv: 0, user: reloaded, headerTenantId: tenant.id }), false, "old cookie stays dead after re-enable");
    assert.strictEqual(isSessionLive({ sessionSv: 1, user: reloaded, headerTenantId: tenant.id }), true, "fresh login (sv 1) lives");
  } finally {
    await iso.cleanup();
  }
});

test("P06.4b - requestActor validates session against DB (wiring)", async () => {
  const src = fs.readFileSync(path.resolve("src/lib/auth/request-context.ts"), "utf8");
  assert.ok(src.includes("isSessionLive"), "requestActor must use isSessionLive gate");
  assert.ok(src.includes("x-maven-session-sv"), "requestActor must read sv header");
  assert.ok(src.includes("sessionVersion"), "requestActor must load sessionVersion from DB");
  assert.ok(src.includes("findUnique"), "requestActor must load the user row");
});

test("P06.4b - middleware forwards sv; edge + session payloads carry sv", async () => {
  const mw = fs.readFileSync(path.resolve("src/middleware.ts"), "utf8");
  const occurrences = mw.split("x-maven-session-sv").length - 1;
  assert.ok(occurrences >= 2, `middleware must forward sv in both branches (found ${occurrences})`);
  assert.ok(mw.includes('startsWith("x-maven-session-') || mw.includes("startsWith('x-maven-session-"), "client-supplied session headers must still be stripped");

  const sessionSrc = fs.readFileSync(sessionPath, "utf8");
  assert.ok(sessionSrc.includes("sv?:"), "SessionPayload must carry optional sv");
  const edgeSrc = fs.readFileSync(path.resolve("src/lib/auth/edge.ts"), "utf8");
  assert.ok(edgeSrc.includes("sv?:"), "EdgeSessionPayload must carry optional sv");
});

test("P06.4b - login rejects DISABLED users and embeds sv in fresh cookies", async () => {
  const src = fs.readFileSync(path.resolve("src/app/api/auth/login/route.ts"), "utf8");
  assert.ok(src.includes('status !== "ACTIVE"') || src.includes("status === "), "login must check user status");
  assert.ok(src.includes("403"), "disabled login must be 403");
  assert.ok(src.includes("sv:"), "fresh session cookie must embed sv");
  // Status gate must run before the cookie is issued
  const gateIdx = Math.min(
    ...["DISABLED", "devre dışı"].map((s) => (src.includes(s) ? src.indexOf(s) : Infinity)),
  );
  assert.ok(gateIdx < src.indexOf("sessionCookieHeader({"), "status gate must precede cookie issuance");
});

test("P06.4c - mfa verify embeds sv and rejects DISABLED users", async () => {
  const src = fs.readFileSync(path.resolve("src/app/api/auth/mfa/verify/route.ts"), "utf8");
  assert.ok(src.includes("sv:"), "mfa-issued session must embed sv");
  assert.ok(src.includes("ACTIVE"), "mfa verify must check user status");
  assert.ok(src.indexOf("ACTIVE") < src.indexOf("sessionCookieHeader({"), "status gate must precede cookie issuance");
});

test("P06.4c - passkey verify embeds sv (status already gated)", async () => {
  const src = fs.readFileSync(path.resolve("src/app/api/auth/passkeys/auth/verify/route.ts"), "utf8");
  assert.ok(src.includes('status !== "ACTIVE"'), "passkey verify must keep its status gate");
  assert.ok(src.includes("sv:"), "passkey-issued session must embed sv");
});
