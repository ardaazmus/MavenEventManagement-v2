import test from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

function runCmd(cmd) {
  try {
    return execSync(cmd, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch {
    return "";
  }
}

test("P00.2 - .gitignore rules ignore db, env, and test reports", () => {
  const filesToCheck = [
    "db/custom.db",
    "db/custom.db-wal",
    "db/custom.db-shm",
    ".env",
    "test-results/dummy.txt",
    "playwright-report/index.html",
  ];

  for (const file of filesToCheck) {
    const ignored = runCmd(`git check-ignore ${file}`);
    assert.ok(
      ignored.length > 0,
      `File ${file} must be matched by git check-ignore`
    );
  }
});

test("P00.2 - git index does not track runtime db or .env files", () => {
  const trackedDb = runCmd("git ls-files db/");
  const trackedEnv = runCmd("git ls-files .env");

  assert.strictEqual(
    trackedDb,
    "",
    `db/ files must NOT be tracked in git index, but found: ${trackedDb}`
  );
  assert.strictEqual(
    trackedEnv,
    "",
    `.env must NOT be tracked in git index, but found: ${trackedEnv}`
  );
});

test("P00.2 - physical files exist on disk (zero data loss)", () => {
  const dbPath = path.resolve("db/custom.db");
  const envPath = path.resolve(".env");

  assert.ok(fs.existsSync(dbPath), "Physical db/custom.db must still exist on disk");
  assert.ok(fs.statSync(dbPath).size > 0, "db/custom.db must not be empty");

  assert.ok(fs.existsSync(envPath), "Physical .env must still exist on disk");
  assert.ok(fs.statSync(envPath).size > 0, ".env must not be empty");
});

test("P00.2 - .env.example contains only safe placeholders and no secrets", () => {
  const examplePath = path.resolve(".env.example");
  assert.ok(fs.existsSync(examplePath), ".env.example must exist");

  const content = fs.readFileSync(examplePath, "utf8");
  assert.ok(content.includes("DATABASE_URL="), ".env.example must specify DATABASE_URL");
  assert.ok(!content.includes("password123"), "Must not contain real password");
  assert.ok(!content.includes("sk_live"), "Must not contain live stripe/payment keys");
  assert.ok(!content.includes("AIzaSy"), "Must not contain Google API keys");
});
