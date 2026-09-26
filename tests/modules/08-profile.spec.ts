// CRON-10 İSKELET — Modül: Profil (GUEST/AUTH)
// CRON-E2E: tam akış — guest CTA'ları, AUTH kimlik kartı, kayıtlarım, çıkış
import { test, expect } from "@playwright/test";
import { guestLogin, gotoScreen } from "./_helpers";

test("SMOKE — profil ekranı + giriş CTA (guest)", async ({ page }) => {
  await guestLogin(page);
  await gotoScreen(page, /Profil|Profile/i);
  await expect(page.getByRole("button", { name: /Giriş Yap|Sign in/i })).toBeVisible();
});

test.fixme("FULL — AUTH profil: kimlik kartı + kayıtlarım + PWA kur / çıkış", async () => {
  // TODO(CRON-E2E): PortalToken ile giriş → isim/şirket dolu → kayıtlı oturumlar listesi.
});
