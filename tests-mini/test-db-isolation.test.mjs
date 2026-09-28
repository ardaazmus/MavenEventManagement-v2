import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

test("P02.1 - tests/support/test-db.mjs exists and provides createIsolatedTestDb", async () => {
  const helperPath = path.resolve("tests/support/test-db.mjs");
  assert.ok(fs.existsSync(helperPath), "tests/support/test-db.mjs must exist");

  const { createIsolatedTestDb } = await import("../tests/support/test-db.mjs");
  assert.strictEqual(typeof createIsolatedTestDb, "function", "createIsolatedTestDb must be a function");
});

test("P02.1 - generated test DB path never targets repo db/custom.db", async () => {
  const { createIsolatedTestDb } = await import("../tests/support/test-db.mjs");
  const testDb = await createIsolatedTestDb("worker-1");

  try {
    assert.ok(testDb.dbPath, "dbPath must be generated");
    assert.ok(
      !testDb.dbPath.toLowerCase().includes("custom.db"),
      `Test DB path must NOT target custom.db, got: ${testDb.dbPath}`
    );
    assert.ok(testDb.databaseUrl.startsWith("file:"), "databaseUrl must start with file:");
  } finally {
    await testDb.cleanup();
  }
});

test("P02.1 - parallel workers operate on isolated databases (no cross-worker leakage)", async () => {
  const { createIsolatedTestDb } = await import("../tests/support/test-db.mjs");

  const db1 = await createIsolatedTestDb("worker-alpha");
  const db2 = await createIsolatedTestDb("worker-beta");

  try {
    assert.notStrictEqual(db1.dbPath, db2.dbPath, "Workers must have distinct DB paths");

    // Worker 1 inserts a test tenant
    const prisma1 = db1.prisma;
    const prisma2 = db2.prisma;

    await prisma1.tenant.create({
      data: {
        id: "tenant-worker-1",
        name: "Worker 1 Tenant",
        slug: "worker-1-slug",
      },
    });

    const count1 = await prisma1.tenant.count();
    const count2 = await prisma2.tenant.count();

    assert.strictEqual(count1, 1, "Worker 1 DB must contain 1 tenant");
    assert.strictEqual(count2, 0, "Worker 2 DB must remain clean with 0 tenants (strict isolation)");
  } finally {
    await db1.cleanup();
    await db2.cleanup();
  }
});
