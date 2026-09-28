import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createIsolatedTestDb } from "../tests/support/test-db.mjs";

const libPath = path.resolve("src/lib/users/user-list.ts");
const routePath = path.resolve("src/app/api/users/route.ts");

test("P06.1 - parseUserListParams applies defaults and strict bounds", async () => {
  const { parseUserListParams } = await import(pathToFileURL(libPath).href);

  // Defaults: page 1, limit 50
  assert.deepStrictEqual(parseUserListParams(new URLSearchParams()), {
    page: 1,
    limit: 50,
    q: null,
    status: null,
    role: null,
  });

  // Valid explicit values incl. filters
  assert.deepStrictEqual(
    parseUserListParams(new URLSearchParams("page=2&limit=10&q=ayse&status=ACTIVE&role=ORG_ADMIN")),
    { page: 2, limit: 10, q: "ayse", status: "ACTIVE", role: "ORG_ADMIN" },
  );

  // Blank filter values normalize to null
  assert.deepStrictEqual(parseUserListParams(new URLSearchParams("q=%20%20&status=&role=")), {
    page: 1,
    limit: 50,
    q: null,
    status: null,
    role: null,
  });
});

test("P06.1 - parseUserListParams rejects malformed pagination with 400 semantics", async () => {
  const { parseUserListParams, UserListValidationError } = await import(pathToFileURL(libPath).href);

  for (const qs of ["limit=0", "limit=-5", "limit=101", "limit=1.5", "limit=abc", "limit=0x10", "page=0", "page=-1", "page=abc", "page=1.5", "page="]) {
    assert.throws(() => parseUserListParams(new URLSearchParams(qs)), UserListValidationError, `must reject ?${qs}`);
    try {
      parseUserListParams(new URLSearchParams(qs));
      assert.fail(`must reject ?${qs}`);
    } catch (e) {
      assert.strictEqual(e.status, 400, `?${qs} must carry status 400`);
    }
  }
});

test("P06.1 - toUserSummary strips all secrets and keeps admin summary fields", async () => {
  const { toUserSummary } = await import(pathToFileURL(libPath).href);

  const row = {
    id: "u1",
    email: "admin@acme.test",
    name: "Acme Admin",
    role: "ORG_ADMIN",
    status: "ACTIVE",
    passwordHash: "$argon2id$secret",
    mfaSecretCipher: "enc-secret",
    mfaEnabled: true,
    recoveryCodes: '[{"hash":"x"}]',
    failedLoginCount: 2,
    lockedUntil: null,
    lastLoginAt: new Date("2026-09-01T10:00:00.000Z"),
    createdAt: new Date("2026-01-01T10:00:00.000Z"),
    roleAssignments: [
      { scopeKey: "TENANT", role: { key: "ORG_ADMIN", name: "Kurum Yöneticisi" } },
      { scopeKey: "ed_123", role: { key: "EVENT_MANAGER", name: "Etkinlik Yöneticisi" } },
    ],
  };

  const summary = toUserSummary(row);
  const keys = Object.keys(summary).sort();

  // Secrets must never leak — even when present on the row
  for (const secret of ["passwordHash", "mfaSecretCipher", "recoveryCodes"]) {
    assert.ok(!keys.includes(secret), `${secret} must not appear in user summary`);
  }
  assert.ok(!JSON.stringify(summary).includes("argon2id"), "serialized summary must not contain secret material");

  // Required admin summary fields
  assert.deepStrictEqual(keys, [
    "createdAt",
    "email",
    "failedLoginCount",
    "id",
    "lastLoginAt",
    "lockedUntil",
    "mfaEnabled",
    "name",
    "role",
    "roleAssignments",
    "status",
  ]);
  assert.deepStrictEqual(summary.roleAssignments, [
    { roleKey: "ORG_ADMIN", roleName: "Kurum Yöneticisi", scopeKey: "TENANT" },
    { roleKey: "EVENT_MANAGER", roleName: "Etkinlik Yöneticisi", scopeKey: "ed_123" },
  ]);
});

test("P06.1 - buildUserListWhere always forces server tenant and maps filters", async () => {
  const { buildUserListWhere } = await import(pathToFileURL(libPath).href);

  // Hostile caller-supplied tenantId must be impossible: no such parameter exists
  const where = buildUserListWhere({
    tenantId: "tenant-a",
    q: "ayse",
    status: "ACTIVE",
    role: "ORG_ADMIN",
  });
  assert.strictEqual(where.tenantId, "tenant-a");
  assert.strictEqual(where.status, "ACTIVE");
  assert.strictEqual(where.role, "ORG_ADMIN");
  assert.deepStrictEqual(where.OR, [
    { name: { contains: "ayse" } },
    { email: { contains: "ayse" } },
  ]);

  const bare = buildUserListWhere({ tenantId: "tenant-a", q: null, status: null, role: null });
  assert.deepStrictEqual(bare, { tenantId: "tenant-a" });
});

test("P06.1 - listUsers: tenant A can never see tenant B users (isolated DB)", async () => {
  const { listUsers } = await import(pathToFileURL(libPath).href);
  const iso = await createIsolatedTestDb("p06-1-isolation");
  try {
    const tenantA = await iso.prisma.tenant.create({ data: { name: "Tenant A", slug: "tenant-a-p061" } });
    const tenantB = await iso.prisma.tenant.create({ data: { name: "Tenant B", slug: "tenant-b-p061" } });
    await iso.prisma.user.createMany({
      data: [
        { tenantId: tenantA.id, email: "a1@test.local", name: "A One" },
        { tenantId: tenantA.id, email: "a2@test.local", name: "A Two" },
        { tenantId: tenantB.id, email: "b1@test.local", name: "B One" },
      ],
    });

    const resA = await listUsers(iso.prisma, { tenantId: tenantA.id, page: 1, limit: 50, q: null, status: null, role: null });
    assert.strictEqual(resA.total, 2);
    assert.deepStrictEqual(resA.items.map((u) => u.email).sort(), ["a1@test.local", "a2@test.local"]);

    const resB = await listUsers(iso.prisma, { tenantId: tenantB.id, page: 1, limit: 50, q: null, status: null, role: null });
    assert.strictEqual(resB.total, 1);
    assert.deepStrictEqual(resB.items.map((u) => u.email), ["b1@test.local"]);

    // Serialized payload must not contain secret keys
    assert.ok(!JSON.stringify(resA).includes("passwordHash"), "list payload must not leak passwordHash");
    assert.ok(!JSON.stringify(resA).includes("mfaSecretCipher"), "list payload must not leak mfaSecretCipher");
    assert.ok(!JSON.stringify(resA).includes("recoveryCodes"), "list payload must not leak recoveryCodes");
  } finally {
    await iso.cleanup();
  }
});

test("P06.1 - listUsers: pagination and q/status/role filters work (isolated DB)", async () => {
  const { listUsers } = await import(pathToFileURL(libPath).href);
  const iso = await createIsolatedTestDb("p06-1-filters");
  try {
    const tenant = await iso.prisma.tenant.create({ data: { name: "Tenant F", slug: "tenant-f-p061" } });
    await iso.prisma.user.createMany({
      data: [
        { tenantId: tenant.id, email: "ayse@test.local", name: "Ayse Yilmaz", role: "ORG_ADMIN", status: "ACTIVE" },
        { tenantId: tenant.id, email: "mehmet@test.local", name: "Mehmet Demir", role: "VIEWER", status: "DISABLED" },
        { tenantId: tenant.id, email: "zeynep@test.local", name: "Zeynep Kaya", role: "VIEWER", status: "ACTIVE" },
      ],
    });
    const base = { tenantId: tenant.id, q: null, status: null, role: null };

    // Pagination: page 1/2 with limit 2
    const p1 = await listUsers(iso.prisma, { ...base, page: 1, limit: 2 });
    assert.strictEqual(p1.total, 3);
    assert.strictEqual(p1.items.length, 2);
    assert.strictEqual(p1.page, 1);
    assert.strictEqual(p1.limit, 2);
    const p2 = await listUsers(iso.prisma, { ...base, page: 2, limit: 2 });
    assert.strictEqual(p2.total, 3);
    assert.strictEqual(p2.items.length, 1);
    assert.ok(!p1.items.some((u) => u.id === p2.items[0].id), "pages must not overlap");

    // q filter (name or email)
    const q = await listUsers(iso.prisma, { ...base, page: 1, limit: 50, q: "mehmet" });
    assert.strictEqual(q.total, 1);
    assert.strictEqual(q.items[0].email, "mehmet@test.local");

    // status filter
    const disabled = await listUsers(iso.prisma, { ...base, page: 1, limit: 50, status: "DISABLED" });
    assert.strictEqual(disabled.total, 1);
    assert.strictEqual(disabled.items[0].email, "mehmet@test.local");

    // role filter
    const viewers = await listUsers(iso.prisma, { ...base, page: 1, limit: 50, role: "VIEWER" });
    assert.strictEqual(viewers.total, 2);
  } finally {
    await iso.cleanup();
  }
});

test("P06.1 - src/app/api/users/route.ts is GET-only, admin-gated, server-tenant-scoped", async () => {
  assert.ok(fs.existsSync(routePath), "src/app/api/users/route.ts must exist");
  const content = fs.readFileSync(routePath, "utf8");

  assert.ok(content.includes("export async function GET"), "GET handler must exist");
  for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
    assert.ok(
      !content.includes(`export async function ${method}`) && !content.includes(`export function ${method}`),
      `route must be read-only: no ${method} export`,
    );
  }

  // Admin gate before any db access
  assert.ok(content.includes("requireAdmin"), "route must use requireAdmin()");
  const gateIdx = content.indexOf("requireAdmin()");
  const dbIdx = content.indexOf("listUsers(");
  assert.ok(gateIdx !== -1 && dbIdx !== -1 && gateIdx < dbIdx, "requireAdmin() must run before listUsers()");

  // Tenant only from server context — never from query string
  assert.ok(
    content.includes("resolveContext") || content.includes("requestActor"),
    "route must resolve tenant from server context",
  );
  assert.ok(!content.includes('get("tenantId")'), "route must never read tenantId from query params");
  assert.ok(!content.includes("get('tenantId')"), "route must never read tenantId from query params");
});

test("P06.1 - route-policy classifies /api/users as ADMIN", async () => {
  const { ROUTE_POLICY_DEFINITIONS } = await import(pathToFileURL(path.resolve("scripts/route-policy.mjs")).href);
  const policy = ROUTE_POLICY_DEFINITIONS["src/app/api/users/route.ts"];
  assert.ok(policy, "src/app/api/users/route.ts must be classified in route-policy.mjs");
  assert.strictEqual(policy.category, "ADMIN");
  assert.strictEqual(policy.authRequired, true);
});
