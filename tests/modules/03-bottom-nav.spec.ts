// CRON-10 İSKELET — Modül: Sabit Alt Menü (§3.3)
// CRON-E2E: tam akış — aktif-sekme pill'i, ikon override (SVG/lib), nav sırası düzenleme
import { test, expect } from "@playwright/test";
import { guestLogin, removeDevtoolsOverlay } from "./_helpers";

test("SMOKE — 5 nav butonu + aktif pill (Anasayfa)", async ({ page }) => {
  await guestLogin(page);
  await removeDevtoolsOverlay(page);
  const nav = page.getByRole("navigation", { name: /Ana gezinme|Main navigation/i });
  await expect(nav.getByRole("button")).toHaveCount(5);
  await expect(nav.getByRole("button", { name: /Anasayfa|Home/i })).toHaveAttribute("aria-current", "page");
});

test.fixme("FULL — ikon kanvası SVG override → alt menüde özel ikon render", async () => {
  // TODO(CRON-E2E): Portal Ayarları → Tasarım → ikon yükle → nav ikonu değişir.
});
