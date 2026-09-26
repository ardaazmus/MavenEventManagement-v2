// CRON-10 İSKELET — Modül: Sponsorlar + Kurum Detayı
// CRON-E2E: tam akış — seviye rozeti (Gold), web sitesi linki, detay kartı geri dönüşü
import { test, expect } from "@playwright/test";
import { guestLogin, gotoScreen } from "./_helpers";

test("SMOKE — sponsor listesi render (2 destekçi kurum)", async ({ page }) => {
  await guestLogin(page);
  await gotoScreen(page, /Sponsorlar|Sponsors/i);
  await expect(page.getByText(/ABC Pharma|destekçi|supporting/i).first()).toBeVisible();
});

test.fixme("FULL — sponsor kartı → detay (seviye rozeti + site linki) → geri", async () => {
  // TODO(CRON-E2E): Gold Sponsor rozeti, target=_blank rel=noopener, Geri navigasyonu.
});
