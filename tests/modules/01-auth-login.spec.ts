// CRON-10 İSKELET — Modül: Kimlik & Giriş (AUTH/GUEST/PortalToken)
// CRON-E2E: tam akış — guest giriş, AUTH magic-link, token süresi, oturum kalıcılığı
import { test, expect } from "@playwright/test";
import { guestLogin } from "./_helpers";

test("SMOKE — portal giriş ekranı render + health", async ({ page }) => {
  await page.goto("/?portal=no-dig-turkey-2026");
  await expect(page.getByRole("heading", { name: /No-Dig Turkey 2026/ })).toBeVisible();
  const health = await page.request.get("/api/health");
  expect(health.status()).toBe(200);
});

test.fixme("FULL — AUTH magic-link girişi → oturum kalıcılığı → çıkış", async () => {
  // TODO(CRON-E2E): PortalToken üret (sha256 pt_), /?t=<raw> ile giriş,
  // yenileme sonrası oturum korunur, çıkışta temizlenir.
});
