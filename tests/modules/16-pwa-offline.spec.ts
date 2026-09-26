// CRON-10 İSKELET — Modül: PWA (manifest + SW + offline)
// CRON-E2E: tam akış — manifest alanları, SW v3 update toast (Yenile akışı),
// offline.html fallback, install prompt
import { test, expect } from "@playwright/test";

test("SMOKE — manifest + sw.js servis edilir + offline.html 200", async ({ page }) => {
  const manifest = await page.request.get("/manifest.webmanifest");
  expect(manifest.status()).toBe(200);
  const sw = await page.request.get("/sw.js");
  expect(sw.status()).toBe(200);
  const text = await sw.text();
  expect(text).toContain("maven-portal-v3");
  const offline = await page.request.get("/offline.html");
  expect(offline.status()).toBe(200);
});

test.fixme("FULL — SW update E2E: yeni sürüm → 'Yeni sürüm hazır' toast → Yenile → activated", async () => {
  // TODO(CRON-E2E): sw.js byte-diff → reload → toast → SKIP_WAITING → controllerchange.
});
