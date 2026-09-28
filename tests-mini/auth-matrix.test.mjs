import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

test("P02.3 - playwright.config.ts defines demo-auth-off, staff-auth-on, participant-auth-on projects", async () => {
  const configPath = path.resolve("playwright.config.ts");
  assert.ok(fs.existsSync(configPath), "playwright.config.ts must exist");
  const content = fs.readFileSync(configPath, "utf8");

  assert.match(content, /name:\s*["']demo-auth-off["']/, "playwright.config.ts must define demo-auth-off");
  assert.match(content, /name:\s*["']staff-auth-on["']/, "playwright.config.ts must define staff-auth-on");
  assert.match(content, /name:\s*["']participant-auth-on["']/, "playwright.config.ts must define participant-auth-on");
});

test("P02.3 - tests/support/auth-matrix.mjs generates valid HMAC signed session cookies", async () => {
  const helperPath = path.resolve("tests/support/auth-matrix.mjs");
  assert.ok(fs.existsSync(helperPath), "tests/support/auth-matrix.mjs must exist");

  const { pathToFileURL } = await import("node:url");
  const { createSessionCookie, signSession } = await import(pathToFileURL(helperPath).href);
  assert.strictEqual(typeof createSessionCookie, "function", "createSessionCookie must be exported");

  const cookie = createSessionCookie("tenant-abc", "ORG_OWNER");
  assert.match(cookie, /maven\.session=([^.]+)\.([^;]+)/, "Cookie must have format name=body.sig");

  // Verify HMAC signature
  const [, token] = cookie.match(/maven\.session=([^;]+)/) || [];
  const [body, sig] = token.split(".");
  const secret = process.env.MAVEN_SECRET_KEY || "maven-dev-only-secret-key-change-me";
  const expectedSig = crypto.createHmac("sha256", secret).update(body).digest("base64url");
  assert.strictEqual(sig, expectedSig, "HMAC signature must verify");

  const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  assert.strictEqual(payload.tenantId, "tenant-abc");
  assert.strictEqual(payload.role, "ORG_OWNER");
  assert.ok(payload.exp > Math.floor(Date.now() / 1000), "Session must not be expired");
});

test("P02.3 - tests/auth-matrix.spec.ts exists and verifies auth matrix contracts", async () => {
  const specPath = path.resolve("tests/auth-matrix.spec.ts");
  assert.ok(fs.existsSync(specPath), "tests/auth-matrix.spec.ts must exist");
  const content = fs.readFileSync(specPath, "utf8");

  assert.match(content, /demo|auth/i, "auth-matrix spec must verify auth behaviors");
  assert.match(content, /401/, "auth-matrix spec must verify 401 fail-closed in auth-on");
});
