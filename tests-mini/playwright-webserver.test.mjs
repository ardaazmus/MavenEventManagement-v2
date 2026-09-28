import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

test("P02.2 - playwright.config.ts defines webServer with health endpoint and deterministic port", async () => {
  const configPath = path.resolve("playwright.config.ts");
  assert.ok(fs.existsSync(configPath), "playwright.config.ts must exist");
  const configContent = fs.readFileSync(configPath, "utf8");

  assert.match(configContent, /webServer:\s*\{/, "playwright.config.ts must configure webServer");
  assert.match(configContent, /\/api\/health/, "webServer url must target /api/health endpoint");
  assert.match(configContent, /reuseExistingServer/, "webServer must configure reuseExistingServer");
  assert.match(configContent, /baseURL/, "playwright.config.ts must define baseURL");
});

test("P02.2 - .github/workflows/ci.yml installs Playwright chromium and runs smoke test", async () => {
  const ciPath = path.resolve(".github/workflows/ci.yml");
  assert.ok(fs.existsSync(ciPath), "ci.yml must exist");
  const ciContent = fs.readFileSync(ciPath, "utf8");

  assert.match(ciContent, /playwright\s+install\s+--with-deps\s+chromium/, "CI must install chromium with deps");
  assert.match(ciContent, /smoke\.spec\.ts|test:smoke/, "CI must execute smoke test");
});

test("P02.2 - tests/smoke.spec.ts exists and verifies /api/health", async () => {
  const smokePath = path.resolve("tests/smoke.spec.ts");
  assert.ok(fs.existsSync(smokePath), "tests/smoke.spec.ts must exist");
  const smokeContent = fs.readFileSync(smokePath, "utf8");

  assert.match(smokeContent, /\/api\/health/, "smoke spec must check /api/health");
  assert.match(smokeContent, /200/, "smoke spec must assert 200 status");
  assert.match(smokeContent, /ok/, "smoke spec must assert health ok status");
});
