import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { pathToFileURL } from "node:url";
import { PrismaClient } from "@prisma/client";
import { createIsolatedTestDb } from "../tests/support/test-db.mjs";

test("P03.2 - Liveness and readiness route files exist", () => {
  const livenessPath = path.resolve("src/app/api/health/liveness/route.ts");
  const readinessPath = path.resolve("src/app/api/health/readiness/route.ts");
  const readinessLib = path.resolve("src/lib/readiness.ts");

  assert.ok(fs.existsSync(livenessPath), "src/app/api/health/liveness/route.ts must exist");
  assert.ok(fs.existsSync(readinessPath), "src/app/api/health/readiness/route.ts must exist");
  assert.ok(fs.existsSync(readinessLib), "src/lib/readiness.ts must exist");
});

test("P03.2 - src/middleware.ts permits liveness and readiness without authentication", () => {
  const middlewarePath = path.resolve("src/middleware.ts");
  assert.ok(fs.existsSync(middlewarePath), "src/middleware.ts must exist");
  const content = fs.readFileSync(middlewarePath, "utf8");

  assert.match(
    content,
    /prefix:\s*["']\/api\/health\/["']/,
    "middleware must allow /api/health/ subpaths as public",
  );
});

test("P03.2 - Liveness check is process-only and does not touch database", async () => {
  const livenessModule = await import(
    pathToFileURL(path.resolve("src/app/api/health/liveness/route.ts")).href
  );
  assert.strictEqual(typeof livenessModule.evaluateLiveness, "function");

  const body = livenessModule.evaluateLiveness();
  assert.strictEqual(body.alive, true, "Liveness must report alive: true");
  assert.strictEqual(typeof body.uptimeSec, "number", "Liveness must include uptimeSec");

  // Verify zero secrets/PII
  const jsonStr = JSON.stringify(body);
  assert.strictEqual(jsonStr.includes("password"), false);
  assert.strictEqual(jsonStr.includes("secret"), false);
  assert.strictEqual(jsonStr.includes("change-me"), false);
  assert.strictEqual(jsonStr.includes("file:"), false);
});

test("P03.2 - Readiness check returns 200 on healthy database and 503 on unmigrated database", async () => {
  const { checkReadiness } = await import(
    pathToFileURL(path.resolve("src/lib/readiness.ts")).href
  );
  assert.strictEqual(typeof checkReadiness, "function");

  // 1. Healthy system test (using isolated migrated DB)
  const testDb = await createIsolatedTestDb("health-readiness");
  process.env.DATABASE_URL = testDb.databaseUrl;
  const { resetConfigCache } = await import(pathToFileURL(path.resolve("src/lib/config.ts")).href);
  resetConfigCache();

  try {
    const resHealthy = await checkReadiness(testDb.prisma);
    assert.strictEqual(resHealthy.ready, true, "Readiness must return ready: true on migrated database");
    assert.strictEqual(resHealthy.status, 200, "Readiness status must be 200");
    assert.strictEqual(resHealthy.db, true, "Readiness body must indicate db: true");
    assert.strictEqual(resHealthy.migrations, true, "Readiness body must indicate migrations: true");
    assert.strictEqual(resHealthy.config, true, "Readiness body must indicate config: true");
  } finally {
    await testDb.cleanup();
  }

  // 2. Unmigrated database test (empty SQLite file without migrations deployed)
  const emptyDbPath = path.join(os.tmpdir(), `unmigrated-test-${Date.now()}.db`).replace(/\\/g, "/");
  const unmigratedPrisma = new PrismaClient({
    datasources: { db: { url: `file:${emptyDbPath}` } },
  });

  try {
    const unmigratedResult = await checkReadiness(unmigratedPrisma);
    assert.strictEqual(unmigratedResult.ready, false, "Unmigrated DB must fail readiness");
    assert.strictEqual(unmigratedResult.migrations, false, "Unmigrated DB must report migrations: false");
    assert.strictEqual(unmigratedResult.status, 503, "Unmigrated DB must return HTTP 503");
  } finally {
    await unmigratedPrisma.$disconnect();
    if (fs.existsSync(emptyDbPath)) {
      try { fs.unlinkSync(emptyDbPath); } catch {}
    }
  }
});
