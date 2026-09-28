import test from "node:test";
import assert from "node:assert/strict";
import { execSync, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

test("P01.1 - package.json defines packageManager and engines", () => {
  const pkgPath = path.resolve("package.json");
  assert.ok(fs.existsSync(pkgPath), "package.json must exist");

  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
  assert.ok(pkg.packageManager, "packageManager must be defined in package.json");
  assert.ok(pkg.packageManager.startsWith("bun@"), "packageManager must specify bun");
  assert.ok(pkg.engines, "engines must be defined in package.json");
  assert.ok(pkg.engines.node, "engines.node must be defined");
  assert.ok(pkg.engines.bun, "engines.bun must be defined");
});

test("P01.1 - bun.lock exists and frozen install passes without diff", () => {
  const lockPath = path.resolve("bun.lock");
  assert.ok(fs.existsSync(lockPath), "bun.lock must exist");

  const lockContentBefore = fs.readFileSync(lockPath, "utf8");

  // Run bun install with frozen lockfile
  const res = spawnSync("bun", ["install", "--frozen-lockfile"], {
    encoding: "utf8",
  });
  assert.strictEqual(res.status, 0, `bun install --frozen-lockfile must exit with 0, got: ${res.stderr}`);

  const lockContentAfter = fs.readFileSync(lockPath, "utf8");
  assert.strictEqual(
    lockContentBefore,
    lockContentAfter,
    "bun.lock must not change during frozen install (no drift)"
  );
});

test("P01.1 - frozen install succeeds in isolated temporary directory", () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "maven-runtime-test-"));
  try {
    fs.copyFileSync("package.json", path.join(tmpDir, "package.json"));
    fs.copyFileSync("bun.lock", path.join(tmpDir, "bun.lock"));

    const res = spawnSync("bun", ["install", "--frozen-lockfile", "--dry-run"], {
      cwd: tmpDir,
      encoding: "utf8",
    });
    assert.strictEqual(
      res.status,
      0,
      `Frozen install in temp dir must succeed, stderr: ${res.stderr}`
    );
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
