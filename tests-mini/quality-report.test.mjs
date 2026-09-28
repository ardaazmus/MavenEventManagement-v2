import test from "node:test";
import assert from "node:assert/strict";
import { execSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

test("P00.3 - scripts/quality-report.mjs exists and is executable", () => {
  const scriptPath = path.resolve("scripts/quality-report.mjs");
  assert.ok(fs.existsSync(scriptPath), "scripts/quality-report.mjs must exist");
});

test("P00.3 - quality-report emits JSON with all gates and unmasked exit codes", () => {
  const result = spawnSync("node", ["scripts/quality-report.mjs", "--json"], {
    encoding: "utf8",
  });

  // Tüm kapılar yeşil (N-06 sonrası): rapor 0 çıkmalı; başarısızlık yolu
  // --simulate-gate-failure fiksürüyle (bir sonraki test) kilitlidir.
  assert.strictEqual(result.status, 0, `quality-report exit 0 olmalı, görülen: ${result.status} ${result.stderr ?? ""}`);

  assert.ok(result.stdout, "Must produce stdout JSON");
  const data = JSON.parse(result.stdout);
  assert.strictEqual(data.hasFailure, false, "hasFailure false olmalı");

  assert.ok(Array.isArray(data.gates), "gates array must be present");
  const gateNames = data.gates.map((g) => g.name);
  assert.ok(gateNames.includes("typecheck"), "typecheck gate must be present");
  assert.ok(gateNames.includes("lint"), "lint gate must be present");
  assert.ok(gateNames.includes("i18n"), "i18n gate must be present");
  assert.ok(gateNames.includes("tests:mini"), "tests:mini gate must be present");

  for (const gate of data.gates) {
    assert.strictEqual(typeof gate.exitCode, "number", `gate ${gate.name} must have numeric exitCode`);
    assert.strictEqual(typeof gate.durationMs, "number", `gate ${gate.name} must have durationMs`);
    assert.ok(typeof gate.passed === "boolean", `gate ${gate.name} must have boolean passed`);
  }
});

test("P00.3 - quality-report does not mask failure on broken gate/fixture", () => {
  // Test with explicit broken command simulation flag
  const result = spawnSync(
    "node",
    ["scripts/quality-report.mjs", "--json", "--simulate-gate-failure"],
    { encoding: "utf8" }
  );

  assert.notStrictEqual(result.status, 0, "Must exit with non-zero code on simulated failure");
  const data = JSON.parse(result.stdout);
  assert.strictEqual(data.hasFailure, true, "hasFailure must be true");
});
