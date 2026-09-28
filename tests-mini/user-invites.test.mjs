import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createIsolatedTestDb } from "../tests/support/test-db.mjs";

const libPath = path.resolve("src/lib/users/invites.ts");
const rateLimitPath = path.resolve("src/lib/rate-limit-core.ts");
const createRoutePath = path.resolve("src/app/api/users/invites/route.ts");
const acceptRoutePath = path.resolve("src/app/api/users/invites/accept/route.ts");

test("P06.2 - invite tokens are high-entropy and stored only as hash", async () => {
  const { generateInviteToken, hashInviteToken } = await import(pathToFileURL(libPath).href);

  const t1 = generateInviteToken();
  const t2 = generateInviteToken();
  assert.ok(t1.length >= 43, "raw token must carry >=256 bits of entropy");
  assert.notStrictEqual(t1, t2, "tokens must be unique");
  assert.ok(/^[A-Za-z0-9_-]+$/.test(t1), "token must be URL-safe base64");

  const h1 = hashInviteToken(t1);
  assert.strictEqual(h1, hashInviteToken(t1), "hash must be deterministic");
  assert.strictEqual(h1.length, 64, "sha256 hex digest expected");
  assert.notStrictEqual(h1, t1, "hash must differ from raw token");
  assert.notStrictEqual(hashInviteToken(t2), h1, "distinct tokens hash distinctly");
});

test("P06.2 - email normalization and role allowlist validation", async () => {
  const { normalizeInviteEmail, InviteValidationError } = await import(pathToFileURL(libPath).href);

  assert.strictEqual(normalizeInviteEmail("  Ayse@Example.COM "), "ayse@example.com");
  for (const bad of ["", "   ", "not-an-email", "a@b", "@x.com", "a@".padEnd(300, "x") + ".com"]) {
    assert.throws(() => normalizeInviteEmail(bad), InviteValidationError, `must reject ${JSON.stringify(bad)}`);
  }

  const { assertInvitableRole } = await import(pathToFileURL(libPath).href);
  assert.doesNotThrow(() => assertInvitableRole("VIEWER"));
  assert.doesNotThrow(() => assertInvitableRole("ORG_ADMIN"));
  assert.doesNotThrow(() => assertInvitableRole("EVENT_MANAGER"));
  assert.throws(() => assertInvitableRole("ORG_OWNER"), InviteValidationError, "ORG_OWNER cannot be granted via invite");
  assert.throws(() => assertInvitableRole("HACKER"), InviteValidationError, "unknown roles rejected");
});

test("P06.2 - createInvite stores hash-only and resend revokes previous invite", async () => {
  const { createInvite, hashInviteToken } = await import(pathToFileURL(libPath).href);
  const iso = await createIsolatedTestDb("p06-2-create");
  try {
    const tenant = await iso.prisma.tenant.create({ data: { name: "Tenant I", slug: "tenant-i-p062" } });

    const first = await createInvite(iso.prisma, {
      tenantId: tenant.id,
      email: "New@Example.com",
      role: "VIEWER",
      createdBy: "admin-1",
    });
    assert.ok(first.token.length >= 43, "one-time raw token returned to admin caller");
    assert.strictEqual(first.invite.email, "new@example.com");
    assert.strictEqual(first.invite.tenantId, tenant.id);
    assert.ok(first.invite.expiresAt.getTime() > Date.now(), "expiry must be in the future");

    // DB row must contain ONLY the hash — raw token irrecoverable from storage
    const stored = await iso.prisma.userInvite.findUnique({ where: { id: first.invite.id } });
    assert.strictEqual(stored.tokenHash, hashInviteToken(first.token));
    assert.ok(!JSON.stringify(stored).includes(first.token), "raw token must never be persisted");

    // Resend: previous invite revoked, new token issued
    const second = await createInvite(iso.prisma, {
      tenantId: tenant.id,
      email: "new@example.com",
      role: "VIEWER",
      createdBy: "admin-1",
    });
    assert.notStrictEqual(second.token, first.token);
    const prevAfter = await iso.prisma.userInvite.findUnique({ where: { id: first.invite.id } });
    assert.ok(prevAfter.revokedAt instanceof Date, "resend must revoke the previous invite");
  } finally {
    await iso.cleanup();
  }
});

test("P06.2 - acceptInvite: valid token creates ACTIVE user; replay rejected", async () => {
  const { createInvite, acceptInvite, InviteError } = await import(pathToFileURL(libPath).href);
  const iso = await createIsolatedTestDb("p06-2-accept");
  try {
    const tenant = await iso.prisma.tenant.create({ data: { name: "Tenant J", slug: "tenant-j-p062" } });
    const { token } = await createInvite(iso.prisma, {
      tenantId: tenant.id,
      email: "join@example.com",
      role: "EVENT_MANAGER",
      createdBy: "admin-1",
    });

    const accepted = await acceptInvite(iso.prisma, {
      token,
      name: "Join Person",
      password: "Long-Enough-Password-1",
    });
    assert.strictEqual(accepted.tenantId, tenant.id);
    assert.strictEqual(accepted.email, "join@example.com");

    const user = await iso.prisma.user.findUnique({ where: { id: accepted.userId } });
    assert.strictEqual(user.status, "ACTIVE");
    assert.strictEqual(user.role, "EVENT_MANAGER");
    assert.strictEqual(user.tenantId, tenant.id);
    assert.ok(user.passwordHash && user.passwordHash.length > 20, "argon2 password hash must be stored");

    // Replay of the same token must fail
    await assert.rejects(
      () => acceptInvite(iso.prisma, { token, name: "Replay", password: "Long-Enough-Password-2" }),
      (e) => e instanceof InviteError && e.code === "REPLAY",
      "replayed token must be rejected with REPLAY",
    );
  } finally {
    await iso.cleanup();
  }
});

test("P06.2 - acceptInvite: expired, tampered and revoked tokens rejected; weak passwords rejected", async () => {
  const { createInvite, acceptInvite, InviteError } = await import(pathToFileURL(libPath).href);
  const iso = await createIsolatedTestDb("p06-2-negative");
  try {
    const tenant = await iso.prisma.tenant.create({ data: { name: "Tenant K", slug: "tenant-k-p062" } });

    // Expired invite
    const exp = await createInvite(
      iso.prisma,
      { tenantId: tenant.id, email: "old@example.com", role: "VIEWER", createdBy: "admin-1" },
      { ttlMs: -1000 },
    );
    await assert.rejects(() => acceptInvite(iso.prisma, { token: exp.token, name: "Old", password: "Long-Enough-Password-1" }), (e) => e instanceof InviteError && e.code === "EXPIRED");

    // Tampered token
    const good = await createInvite(iso.prisma, { tenantId: tenant.id, email: "ok@example.com", role: "VIEWER", createdBy: "admin-1" });
    const tampered = good.token.slice(0, -2) + (good.token.endsWith("AA") ? "BB" : "AA");
    await assert.rejects(() => acceptInvite(iso.prisma, { token: tampered, name: "X", password: "Long-Enough-Password-1" }), (e) => e instanceof InviteError && e.code === "INVALID");

    // Weak password + blank name
    await assert.rejects(() => acceptInvite(iso.prisma, { token: good.token, name: "Valid Name", password: "short" }), (e) => e instanceof InviteError && e.code === "WEAK_PASSWORD");
    await assert.rejects(() => acceptInvite(iso.prisma, { token: good.token, name: "  ", password: "Long-Enough-Password-1" }), (e) => e instanceof InviteError && e.code === "INVALID_NAME");

    // Revoked via resend
    await createInvite(iso.prisma, { tenantId: tenant.id, email: "ok@example.com", role: "VIEWER", createdBy: "admin-1" });
    await assert.rejects(() => acceptInvite(iso.prisma, { token: good.token, name: "Valid Name", password: "Long-Enough-Password-1" }), (e) => e instanceof InviteError && e.code === "REVOKED");
  } finally {
    await iso.cleanup();
  }
});

test("P06.2 - cross-tenant: invite always materializes under its own tenant", async () => {
  const { createInvite, acceptInvite } = await import(pathToFileURL(libPath).href);
  const iso = await createIsolatedTestDb("p06-2-xtenant");
  try {
    const tenantA = await iso.prisma.tenant.create({ data: { name: "Tenant A", slug: "tenant-a-p062" } });
    const tenantB = await iso.prisma.tenant.create({ data: { name: "Tenant B", slug: "tenant-b-p062" } });
    const { token } = await createInvite(iso.prisma, {
      tenantId: tenantA.id,
      email: "cross@example.com",
      role: "VIEWER",
      createdBy: "admin-1",
    });

    // acceptInvite takes NO tenant parameter — tenant is bound to the invite record
    const accepted = await acceptInvite(iso.prisma, { token, name: "Cross", password: "Long-Enough-Password-1" });
    assert.strictEqual(accepted.tenantId, tenantA.id);
    assert.notStrictEqual(accepted.tenantId, tenantB.id);
    const countB = await iso.prisma.user.count({ where: { tenantId: tenantB.id } });
    assert.strictEqual(countB, 0, "tenant B must gain no users from tenant A invite");
  } finally {
    await iso.cleanup();
  }
});

test("P06.2 - rate limiter: sliding window allow/block/expiry with injectable clock", async () => {
  const { createSlidingWindowLimiter } = await import(pathToFileURL(rateLimitPath).href);

  let now = 1_000_000;
  const limiter = createSlidingWindowLimiter({ now: () => now });
  const budget = { windowMs: 60_000, max: 2 };

  assert.strictEqual(limiter.check("ip-1", budget).allowed, true);
  const second = limiter.check("ip-1", budget);
  assert.strictEqual(second.allowed, true);
  assert.strictEqual(second.remaining, 0);
  const blocked = limiter.check("ip-1", budget);
  assert.strictEqual(blocked.allowed, false, "3rd hit inside window must be blocked");
  assert.ok(blocked.retryAfterSec >= 1, "blocked result must carry Retry-After seconds");

  // Other keys unaffected
  assert.strictEqual(limiter.check("ip-2", budget).allowed, true);

  // Sliding expiry: each hit ages out individually (fixed window would stay blocked)
  limiter.reset("ip-3");
  now = 2_000_000;
  assert.strictEqual(limiter.check("ip-3", budget).allowed, true);
  now += 30_000;
  assert.strictEqual(limiter.check("ip-3", budget).allowed, true);
  now += 31_000; // first hit is 61s old (pruned), second hit 31s old (kept)
  const slid = limiter.check("ip-3", budget);
  assert.strictEqual(slid.allowed, true, "aged-out hit must free exactly one slot");
  assert.strictEqual(slid.remaining, 0);
  assert.strictEqual(limiter.check("ip-3", budget).allowed, false, "window still full after sliding refill");

  // Full window expiry resets
  now += 60_001;
  const after = limiter.check("ip-3", budget);
  assert.strictEqual(after.allowed, true);
  assert.strictEqual(after.remaining, 1);
});

test("P06.2 - routes: create is admin-gated, accept is token-only with rate limit", async () => {
  assert.ok(fs.existsSync(createRoutePath), "invites create route must exist");
  assert.ok(fs.existsSync(acceptRoutePath), "invites accept route must exist");
  const createSrc = fs.readFileSync(createRoutePath, "utf8");
  const acceptSrc = fs.readFileSync(acceptRoutePath, "utf8");

  assert.ok(createSrc.includes("requireAdmin"), "create route must use requireAdmin()");
  assert.ok(createSrc.includes("resolveContext"), "create route must scope to server tenant");
  assert.ok(!createSrc.includes('get("tenantId")'), "create route must never read tenantId from request");

  assert.ok(createSrc.includes("enforceRateLimitById"), "create route must use shared enforceRateLimitById");
  assert.ok(createSrc.includes("scopeId: tenantId"), "create rate-limit must be tenant-scoped");
  assert.ok(acceptSrc.includes("enforceRateLimit"), "accept route must use shared enforceRateLimit (429 on abuse)");
  assert.ok(acceptSrc.includes("limit: 10"), "accept budget must be 10 attempts");
  assert.ok(acceptSrc.includes("windowMs: 10 * 60 * 1000"), "accept window must be 10 minutes");
  assert.ok(!acceptSrc.includes("resolveContext"), "accept route must NOT resolve server tenant (public token flow)");
  assert.ok(!acceptSrc.includes("requestActor"), "accept route must NOT require a session actor");
  assert.ok(!acceptSrc.includes('get("tenantId")') && !acceptSrc.includes("tenantId:"), "accept route must never accept caller tenant");
});

test("P06.2 - route-policy classifies both invite routes", async () => {
  const { ROUTE_POLICY_DEFINITIONS } = await import(pathToFileURL(path.resolve("scripts/route-policy.mjs")).href);
  const create = ROUTE_POLICY_DEFINITIONS["src/app/api/users/invites/route.ts"];
  assert.ok(create, "invites route must be classified");
  assert.strictEqual(create.category, "ADMIN");
  const accept = ROUTE_POLICY_DEFINITIONS["src/app/api/users/invites/accept/route.ts"];
  assert.ok(accept, "invites accept route must be classified");
  assert.strictEqual(accept.category, "PUBLIC");
});
