import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

test("P01.4 - .github/workflows/ci.yml exists and has valid structure", () => {
  const ciPath = path.resolve(".github/workflows/ci.yml");
  assert.ok(fs.existsSync(ciPath), ".github/workflows/ci.yml must exist");

  const content = fs.readFileSync(ciPath, "utf8");
  assert.ok(content.length > 200, "ci.yml must have meaningful content");

  // Check triggers
  assert.ok(content.includes("push:"), "must define push trigger");
  assert.ok(content.includes("pull_request:"), "must define pull_request trigger");

  // Check required steps
  assert.ok(content.includes("frozen-lockfile"), "must enforce frozen-lockfile");
  assert.ok(content.includes("prisma generate"), "must run prisma generate");
  assert.ok(content.includes("prisma migrate deploy"), "must run prisma migrate deploy");
  assert.ok(content.includes("typecheck"), "must run typecheck");
  assert.ok(content.includes("test:unit"), "must run test:unit");
  assert.ok(content.includes("build"), "must include build step");
});

test("P01.4 - CI workflow step ordering is correct and logical", () => {
  const ciPath = path.resolve(".github/workflows/ci.yml");
  const content = fs.readFileSync(ciPath, "utf8");

  const idxInstall = content.indexOf("frozen-lockfile");
  const idxGenerate = content.indexOf("prisma generate");
  const idxMigrate = content.indexOf("prisma migrate deploy");
  const idxTypecheck = content.indexOf("typecheck");
  const idxTestUnit = content.indexOf("test:unit");
  const idxBuild = content.indexOf("build");

  assert.ok(idxInstall < idxGenerate, "Install must precede prisma generate");
  assert.ok(idxGenerate < idxMigrate, "Prisma generate must precede migrate deploy");
  assert.ok(idxMigrate < idxTypecheck, "Migrate deploy must precede typecheck");
  assert.ok(idxTypecheck < idxTestUnit, "Typecheck must precede test:unit");
  assert.ok(idxTestUnit < idxBuild, "Test:unit must precede build");
});
