// CRON-10 İSKELET — Modül: Portal Anasayfa (widget grid)
// CRON-E2E: tam akış — widget görünürlük matrisi (admin chrome yapılandırmasına göre)
import { test, expect } from "@playwright/test";
import { guestLogin } from "./_helpers";

test("SMOKE — anasayfa widget'ları (sıradaki oturum + sponsorlar) görünür", async ({ page }) => {
  await guestLogin(page);
  await expect(page.getByText(/Sıradaki oturum|Next session/i)).toBeVisible();
  await expect(page.getByText(/Sponsorlarımız|Our sponsors/i)).toBeVisible();
});

test.fixme("FULL — widget grid admin yapılandırmasına göre sıra/görünürlük", async () => {
  // TODO(CRON-E2E): Portal Ayarları → Widget matrisi düzenle → portala yansıma sırası.
});
