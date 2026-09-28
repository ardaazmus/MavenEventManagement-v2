import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import fs from "node:fs";

test("P03.1 - src/lib/config.ts exists and exports validateConfig and getConfig", async () => {
  const configPath = path.resolve("src/lib/config.ts");
  assert.ok(fs.existsSync(configPath), "src/lib/config.ts must exist");
});

test("P03.1 - table test for prod/dev/test combinations", async () => {
  const { pathToFileURL } = await import("node:url");
  const configModule = await import(pathToFileURL(path.resolve("src/lib/config.ts")).href);
  const { validateConfig, ConfigValidationError } = configModule;

  assert.strictEqual(typeof validateConfig, "function", "validateConfig must be a function");

  const tableCases = [
    // 1. Prod + auth-off + no demo flag -> fatal failure
    {
      name: "Prod with auth=off and no demo flag fails closed",
      env: {
        NODE_ENV: "production",
        MAVEN_AUTH: "off",
        MAVEN_SECRET_KEY: "a-very-strong-production-secret-key-32-chars",
        DATABASE_URL: "file:./prod.db",
      },
      expectError: /auth=on|demo/i,
    },
    // 2. Prod + auth-off + demo flag=on -> valid demo mode
    {
      name: "Prod with auth=off and MAVEN_DEMO_MODE=on is valid",
      env: {
        NODE_ENV: "production",
        MAVEN_AUTH: "off",
        MAVEN_DEMO_MODE: "on",
        MAVEN_SECRET_KEY: "a-very-strong-production-secret-key-32-chars",
        DATABASE_URL: "file:./prod.db",
      },
      expectValid: true,
      assertResult: (res) => {
        assert.strictEqual(res.isProd, true);
        assert.strictEqual(res.authEnabled, false);
        assert.strictEqual(res.isDemoMode, true);
      },
    },
    // 3. Prod + weak default secret -> fatal failure
    {
      name: "Prod with fallback dev secret fails closed",
      env: {
        NODE_ENV: "production",
        MAVEN_AUTH: "on",
        MAVEN_SECRET_KEY: "maven-dev-only-secret-key-change-me",
        DATABASE_URL: "file:./prod.db",
      },
      expectError: /secret/i,
    },
    // 4. Prod + short secret (<32 chars) -> fatal failure
    {
      name: "Prod with short secret (<32 chars) fails closed",
      env: {
        NODE_ENV: "production",
        MAVEN_AUTH: "on",
        MAVEN_SECRET_KEY: "too-short-secret",
        DATABASE_URL: "file:./prod.db",
      },
      expectError: /secret.*length|entropy/i,
    },
    // 5. Prod + strong secret + auth-on -> valid prod
    {
      name: "Prod with auth=on, strong secret, valid DB succeeds",
      env: {
        NODE_ENV: "production",
        MAVEN_AUTH: "on",
        MAVEN_SECRET_KEY: "a-very-strong-production-secret-key-32-chars",
        DATABASE_URL: "file:./prod.db",
      },
      expectValid: true,
      assertResult: (res) => {
        assert.strictEqual(res.isProd, true);
        assert.strictEqual(res.authEnabled, true);
        assert.strictEqual(res.isDemoMode, false);
      },
    },
    // 6. Dev + default secret -> valid dev
    {
      name: "Dev with fallback secret succeeds",
      env: {
        NODE_ENV: "development",
        DATABASE_URL: "file:./dev.db",
      },
      expectValid: true,
      assertResult: (res) => {
        assert.strictEqual(res.isDev, true);
        assert.strictEqual(res.authEnabled, false);
      },
    },
    // 7. Test + default secret -> valid test
    {
      name: "Test with fallback secret succeeds",
      env: {
        NODE_ENV: "test",
        DATABASE_URL: "file:./test.db",
      },
      expectValid: true,
      assertResult: (res) => {
        assert.strictEqual(res.isTest, true);
      },
    },
    // 8. Missing DATABASE_URL -> fatal failure
    {
      name: "Missing DATABASE_URL fails closed",
      env: {
        NODE_ENV: "development",
        DATABASE_URL: "",
      },
      expectError: /database_url/i,
    },
  ];

  for (const tc of tableCases) {
    if (tc.expectError) {
      assert.throws(
        () => validateConfig(tc.env),
        tc.expectError,
        `Expected error for case: ${tc.name}`,
      );
    } else if (tc.expectValid) {
      const result = validateConfig(tc.env);
      assert.ok(result, `Expected valid config for case: ${tc.name}`);
      if (tc.assertResult) {
        tc.assertResult(result);
      }
    }
  }
});
