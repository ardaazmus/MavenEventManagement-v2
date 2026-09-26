// CRON-10 İSKELET — Modül: Mekan & Kroki (Venue Map)
// CRON-E2E: tam akış — kroki görseli/etkileşimi, boş durum
import { test, expect } from "@playwright/test";
import { guestLogin, gotoScreen } from "./_helpers";

test("SMOKE — Yer Planı ekranı açılır", async ({ page }) => {
  await guestLogin(page);
  await gotoScreen(page, /Yer Planı|Map/i);
  await expect(page.getByRole("heading", { name: /Mekan|Venue|Kroki/i }).first()).toBeVisible().catch(async () => {
    await expect(page.getByText(/kroki|plan/i).first()).toBeVisible();
  });
});

test.fixme("FULL — kroki etkileşimi (zoom/seçim) + Floor Studio admin senkronu", async () => {
  // TODO(CRON-E2E): FloorsView push → portal kroki güncellenir.
});
