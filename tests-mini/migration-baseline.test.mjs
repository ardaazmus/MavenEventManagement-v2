import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const prismaCli = path.resolve("node_modules/prisma/build/index.js");

test("P01.3 - prisma/migrations directory and baseline migration exist", () => {
  const migrationsDir = path.resolve("prisma/migrations");
  assert.ok(fs.existsSync(migrationsDir), "prisma/migrations directory must exist");

  const entries = fs.readdirSync(migrationsDir, { withFileTypes: true });
  const migrationDirs = entries.filter((e) => e.isDirectory());
  assert.ok(migrationDirs.length > 0, "At least one migration directory must exist");

  const initDir = path.join(migrationsDir, migrationDirs[0].name);
  const sqlFile = path.join(initDir, "migration.sql");
  assert.ok(fs.existsSync(sqlFile), "migration.sql must exist inside initial migration folder");
  assert.ok(fs.statSync(sqlFile).size > 1000, "migration.sql must contain DDL for models");
});

test("P01.3 - package.json defines db:migrate:deploy and removes accept-data-loss from default db:push", () => {
  const pkg = JSON.parse(fs.readFileSync(path.resolve("package.json"), "utf8"));
  const scripts = pkg.scripts || {};

  assert.ok(scripts["db:migrate:deploy"], "db:migrate:deploy script must be defined");
  assert.ok(scripts["db:migrate:deploy"].includes("prisma migrate deploy"), "must run prisma migrate deploy");

  if (scripts["db:push"]) {
    assert.ok(
      !scripts["db:push"].includes("--accept-data-loss"),
      "Default db:push must NOT contain --accept-data-loss (reserved only for disposable dev)"
    );
  }
});

test("P01.3 - prisma migrate deploy on clean empty DB yields 0 schema diff", () => {
  const tmpDbPath = path.join(os.tmpdir(), `maven_migration_test_${Date.now()}.db`).replace(/\\/g, "/");
  try {
    const env = {
      ...process.env,
      DATABASE_URL: `file:${tmpDbPath}`,
    };

    // 1. Run migrate deploy on fresh empty db
    const deployRes = spawnSync(process.execPath, [prismaCli, "migrate", "deploy"], {
      env,
      encoding: "utf8",
    });
    assert.strictEqual(
      deployRes.status,
      0,
      `prisma migrate deploy must succeed, stderr: ${deployRes.stderr || deployRes.stdout}`
    );

    // 2. Check diff against schema.prisma
    const diffRes = spawnSync(
      process.execPath,
      [
        prismaCli,
        "migrate",
        "diff",
        "--from-url",
        `file:${tmpDbPath}`,
        "--to-schema-datamodel",
        "prisma/schema.prisma",
      ],
      {
        env,
        encoding: "utf8",
      }
    );
    assert.strictEqual(
      diffRes.status,
      0,
      `prisma migrate diff must return 0, stderr: ${diffRes.stderr || diffRes.stdout}`
    );
    const stdout = diffRes.stdout.toLowerCase();
    assert.ok(
      stdout.includes("no difference") || stdout.trim() === "",
      `Schema and deployed DB must have 0 differences, got: ${diffRes.stdout}`
    );
  } finally {
    if (fs.existsSync(tmpDbPath)) {
      try {
        fs.unlinkSync(tmpDbPath);
      } catch {}
    }
  }
});
