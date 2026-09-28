import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

function runNpm(args) {
  const isWin = process.platform === "win32";
  const cmd = isWin ? "npm.cmd" : "npm";
  return spawnSync(cmd, args, {
    encoding: "utf8",
    shell: isWin,
  });
}

test("P01.2 - package.json defines missing quality scripts", () => {
  const pkgPath = path.resolve("package.json");
  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
  const scripts = pkg.scripts || {};

  assert.ok(scripts.typecheck, "scripts.typecheck must be defined");
  assert.ok(scripts["test:unit"], "scripts['test:unit'] must be defined");
  assert.ok(scripts["test:api"], "scripts['test:api'] must be defined");
  assert.ok(scripts["test:e2e:ui"], "scripts['test:e2e:ui'] must be defined");
  assert.ok(scripts.quality, "scripts.quality must be defined");
});

test("P01.2 - tsc --noEmit passes on clean codebase", () => {
  const res = runNpm(["run", "typecheck"]);

  assert.strictEqual(
    res.status,
    0,
    `npm run typecheck must exit with 0, got ${res.status}: ${res.stderr || res.stdout}`
  );
});

test("P01.2 - tsc --noEmit fails on broken type fixture (negative verification)", () => {
  const fixturePath = path.resolve("src/lib/__test_broken_fixture.ts");
  try {
    // Write intentionally broken typescript file
    fs.writeFileSync(
      fixturePath,
      'import { NonExistentExport } from "./constants"; const x: number = "not-a-number";',
      "utf8"
    );

    const res = runNpm(["run", "typecheck"]);

    assert.notStrictEqual(
      res.status,
      0,
      "npm run typecheck MUST fail when invalid types or broken imports exist"
    );
  } finally {
    if (fs.existsSync(fixturePath)) {
      fs.unlinkSync(fixturePath);
    }
  }
});

test("P01.2 - npm run test:unit executes mini tests successfully", () => {
  const res = runNpm(["run", "test:unit"]);

  assert.strictEqual(
    res.status,
    0,
    `npm run test:unit must exit with 0, got ${res.status}: ${res.stderr || res.stdout}`
  );
});
