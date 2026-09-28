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

  assert.strictEqual(data.baseSha, "bf2f5eb8f305a189d44fdcb9d2a340dae340cc2a", "baseSha matches rebased main commit");
  assert.ok(data.counts.prismaModels >= 103, "Prisma models count must be at least 103 (103 baseline + additive models)");
  assert.ok(data.counts.apiRoutes >= 106, "API route count must be at least 106");
  assert.strictEqual(data.counts.modules, 27, "Module count must be 27 (26 + H-08 company-communications)");
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
  assert.ok(content.includes("bf2f5eb8f305a189d44fdcb9d2a340dae340cc2a"), "baseline.md must include baseSha");
  assert.ok(content.includes("126"), "baseline.md must document 126 models");
  assert.ok(content.includes("160"), "baseline.md must document 160 routes");
  assert.ok(content.includes("27"), "baseline.md must document 27 modules");
  assert.ok(content.includes("42"), "baseline.md must document 42 specs");
  assert.ok(content.includes("714"), "baseline.md must document 714 tests");
  assert.ok(content.includes("Takipteki Runtime"), "baseline.md must document the tracked-runtime section");
  const trackedDb = execSync("git ls-files db/", { encoding: "utf8" }).trim();
  assert.strictEqual(trackedDb, "", "db/ runtime dosyaları takip edilmemeli (P00.2 hijyen tamam)");
});
