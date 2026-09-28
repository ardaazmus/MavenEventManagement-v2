import test from "node:test";
import assert from "node:assert/strict";

// N-02: sır anahtarı üretimde fail-closed olmalı.

test("N-02 - prod + anahtarsız kullanım throw eder (fail-closed)", async () => {
  const prevEnv = process.env.NODE_ENV;
  const prevKey = process.env.MAVEN_SECRET_KEY;
  process.env.NODE_ENV = "production";
  delete process.env.MAVEN_SECRET_KEY;
  try {
    const { decryptSecret } = await import("../src/lib/secrets.ts");
    assert.throws(() => decryptSecret("enc:v1:aaaaaaaaaaaaaaaaaaaaaaaaaaa:bbbb:cccc"), /MAVEN_SECRET_KEY/);
  } finally {
    process.env.NODE_ENV = prevEnv;
    if (prevKey !== undefined) process.env.MAVEN_SECRET_KEY = prevKey;
  }
});

test("N-02 - prod-dışı + anahtarsız kullanım DEV fallback ile çalışır", async () => {
  const prevEnv = process.env.NODE_ENV;
  const prevKey = process.env.MAVEN_SECRET_KEY;
  process.env.NODE_ENV = "test";
  delete process.env.MAVEN_SECRET_KEY;
  try {
    const { encryptSecret, decryptSecret } = await import("../src/lib/secrets.ts");
    const cipher = encryptSecret("kısa-sır");
    assert.ok(cipher.startsWith("enc:v1:"));
    assert.strictEqual(decryptSecret(cipher), "kısa-sır");
  } finally {
    process.env.NODE_ENV = prevEnv;
    if (prevKey !== undefined) process.env.MAVEN_SECRET_KEY = prevKey;
  }
});

test("N-02 - açık anahtar varken prod da çalışır", async () => {
  const prevEnv = process.env.NODE_ENV;
  const prevKey = process.env.MAVEN_SECRET_KEY;
  process.env.NODE_ENV = "production";
  process.env.MAVEN_SECRET_KEY = "test-only-key-uzun-olmalı-1234567890";
  try {
    const { encryptSecret, decryptSecret } = await import("../src/lib/secrets.ts");
    assert.strictEqual(decryptSecret(encryptSecret("x")), "x");
  } finally {
    process.env.NODE_ENV = prevEnv;
    if (prevKey === undefined) delete process.env.MAVEN_SECRET_KEY;
    else process.env.MAVEN_SECRET_KEY = prevKey;
  }
});
