import test from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

test("P00.1 - scripts/inventory.mjs exists and executes cleanly", () => {
  const scriptPath = path.resolve("scripts/inventory.mjs");
  assert.ok(fs.existsSync(scriptPath), "scripts/inventory.mjs must exist");

  const stdout = execSync("node scripts/inventory.mjs --json", {
    encoding: "utf8",
  });
  const data = JSON.parse(stdout);

  assert.strictEqual(data.baseSha, "28acc8c907c95b6c89ef09be27346811f4bca3b2", "baseSha matches roadmap commit");
  assert.ok(data.counts.prismaModels >= 103, "Prisma models count must be at least 103 (103 baseline + additive models)");
  assert.ok(data.counts.apiRoutes >= 106, "API route count must be at least 106");
  assert.strictEqual(data.counts.modules, 26, "Module count must be 26");
  assert.ok(data.counts.testSpecs >= 36, "Test spec files count must be at least 36");
  assert.ok(data.counts.playwrightTests >= 204, "Playwright listed tests must be at least 204");
  assert.ok(data.runtime.node, "Node version must be present");
  assert.ok(data.runtime.git, "Git version must be present");
});

test("P00.1 - scripts/inventory.mjs produces identical output across consecutive runs (determinism)", () => {
  const run1 = JSON.parse(execSync("node scripts/inventory.mjs --json", { encoding: "utf8" }));
  const run2 = JSON.parse(execSync("node scripts/inventory.mjs --json", { encoding: "utf8" }));

  assert.strictEqual(run1.baseSha, run2.baseSha, "baseSha must be identical");
  assert.deepStrictEqual(run1.counts, run2.counts, "counts must be strictly identical");
  assert.deepStrictEqual(run1.inventory, run2.inventory, "inventory lists must be strictly identical");
  assert.deepStrictEqual(run1.runtime, run2.runtime, "runtime info must be identical");
});

test("P00.1 - docs/evidence/baseline.md exists and documents repository state", () => {
  const docPath = path.resolve("docs/evidence/baseline.md");
  assert.ok(fs.existsSync(docPath), "docs/evidence/baseline.md must exist");

  const content = fs.readFileSync(docPath, "utf8");
  assert.ok(content.includes("28acc8c907c95b6c89ef09be27346811f4bca3b2"), "baseline.md must include baseSha");
  assert.ok(content.includes("103"), "baseline.md must document 103 models");
  assert.ok(content.includes("106"), "baseline.md must document 106 routes");
  assert.ok(content.includes("26"), "baseline.md must document 26 modules");
  assert.ok(content.includes("36"), "baseline.md must document 36 specs");
  assert.ok(content.includes("204"), "baseline.md must document 204 tests");
  assert.ok(content.includes("db/custom.db-wal") || content.includes("db/custom.db-shm"), "baseline.md must document tracked runtime DB files");
});
