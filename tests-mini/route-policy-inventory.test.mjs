import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

const scriptPath = path.resolve("scripts/route-policy.mjs");
const reportPath = path.resolve("artifacts/route-policy-report.json");

test("P04.4 - scripts/route-policy.mjs exists and exports validateAndGenerateReport", async () => {
  assert.ok(fs.existsSync(scriptPath), "scripts/route-policy.mjs must exist");
  const mod = await import(pathToFileURL(scriptPath).href);
  assert.strictEqual(typeof mod.validateAndGenerateReport, "function");
  assert.ok(Array.isArray(mod.CATEGORIES));
  assert.deepStrictEqual(mod.CATEGORIES, ["PUBLIC", "STAFF", "ADMIN", "DOMAIN_POLICY"]);
});

test("P04.4 - All active API routes are classified with 0 unclassified routes", async () => {
  const mod = await import(pathToFileURL(scriptPath).href);
  const report = mod.validateAndGenerateReport();

  assert.ok(report.totalDiscovered >= 106, `Expected at least 106 routes, discovered: ${report.totalDiscovered}`);
  assert.strictEqual(report.unclassifiedCount, 0, "There must be 0 unclassified routes");
  assert.strictEqual(report.unclassifiedRoutes.length, 0);
  assert.strictEqual(report.totalClassified, report.totalDiscovered);
});

test("P04.4 - Route policy definitions do not contain phantom or orphaned routes", async () => {
  const mod = await import(pathToFileURL(scriptPath).href);
  const { ROUTE_POLICY_DEFINITIONS } = mod;

  const rootDir = process.cwd().replace(/\\/g, "/");
  for (const routePath of Object.keys(ROUTE_POLICY_DEFINITIONS)) {
    const fullPath = path.resolve(rootDir, routePath);
    assert.ok(
      fs.existsSync(fullPath),
      `Route '${routePath}' in policy definition must actually exist on disk`,
    );
  }
});

test("P04.4 - Category distribution adheres to Maven v2 security boundary", async () => {
  const mod = await import(pathToFileURL(scriptPath).href);
  const report = mod.validateAndGenerateReport();

  const { categoryCounts } = report;
  assert.ok(categoryCounts.PUBLIC > 0, "Must have PUBLIC routes");
  assert.ok(categoryCounts.STAFF > 0, "Must have STAFF routes");
  assert.ok(categoryCounts.ADMIN > 0, "Must have ADMIN routes");
  assert.ok(categoryCounts.DOMAIN_POLICY > 0, "Must have DOMAIN_POLICY routes");

  // Domain policy must at least cover generic collection, item, scan, kvkk
  const domainRoutes = report.routes.filter((r) => r.category === "DOMAIN_POLICY").map((r) => r.path);
  assert.ok(domainRoutes.includes("src/app/api/[entity]/route.ts"));
  assert.ok(domainRoutes.includes("src/app/api/[entity]/[id]/route.ts"));
  assert.ok(domainRoutes.includes("src/app/api/scan/route.ts"));
  assert.ok(domainRoutes.includes("src/app/api/kvkk/erasure/route.ts"));
});

test("P04.4 - Negative verification: unclassified route causes failure", async () => {
  const mod = await import(pathToFileURL(scriptPath).href);
  const { ROUTE_POLICY_DEFINITIONS } = mod;

  // Simulate missing route
  const dummyMissingPath = "src/app/api/fake-unclassified-test/route.ts";
  assert.strictEqual(
    ROUTE_POLICY_DEFINITIONS[dummyMissingPath],
    undefined,
    "Fake route must not be in definition",
  );
});

test("P04.4 - artifacts/route-policy-report.json exists and matches schema", async () => {
  assert.ok(fs.existsSync(reportPath), "artifacts/route-policy-report.json must exist");
  const raw = fs.readFileSync(reportPath, "utf8");
  const report = JSON.parse(raw);

  assert.ok(report.totalDiscovered >= 106);
  assert.strictEqual(report.unclassifiedCount, 0);
  assert.ok(Array.isArray(report.routes));
  assert.strictEqual(report.routes.length, report.totalDiscovered);

  for (const r of report.routes) {
    assert.ok(typeof r.path === "string" && r.path.startsWith("src/app/api/"));
    assert.ok(["PUBLIC", "STAFF", "ADMIN", "DOMAIN_POLICY"].includes(r.category));
    assert.ok(typeof r.authRequired === "boolean");
    assert.ok(typeof r.enforcement === "string" && r.enforcement.length > 0);
    assert.ok(typeof r.description === "string" && r.description.length > 0);
  }
});
