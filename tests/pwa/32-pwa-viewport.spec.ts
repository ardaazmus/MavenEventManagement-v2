// PWA-ADMIN v1 — YÖNTEM-1: viewport matrisi (taşma + dokunma hedefi + sekmeler)
// Salt-okunur: her projede koşar. Sheet gecikmesi varsayılan 45sn — testler daha
// hızlı biter, sheet araya girmez.
import { test, expect } from "@playwright/test";
import { guestLogin } from "../modules/_helpers";
import { PWA_VIEWPORTS, expectNoHOverflow, expectMinTapSize, gotoPortalSettings } from "./_pwa-helpers";

for (const vp of PWA_VIEWPORTS) {
  test(`MATRİS@${vp.name} — giriş kapısı: taşma yok + CTA hedefi`, async ({ page }) => {
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.goto("/?portal=no-dig-turkey-2026");
    await expect(page.getByRole("button", { name: /Portala Gir|Enter portal/i })).toBeVisible({ timeout: 15_000 });
    await expectNoHOverflow(page);
    await expectMinTapSize(page, 'button[name*="Portal"], button:has-text("Portala Gir"), button:has-text("Enter portal")');
  });

  test(`MATRİS@${vp.name} — portal home: taşma yok + alt sekmeler`, async ({ page }) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await guestLogin(page);
    await expect(page.getByRole("navigation", { name: /Ana gezinme|Main navigation/i })).toBeVisible({ timeout: 20_000 });
    await expectNoHOverflow(page);
    // 5 sekme + aktif gösterge (M03 kısa mutasyon penceresine karşı poll-toleranslı)
    const nav = page.getByRole("navigation", { name: /Ana gezinme|Main navigation/i });
    await expect.poll(async () => nav.getByRole("button").count(), { timeout: 15_000 }).toBe(5);
    await expect(nav.getByRole("button", { name: /Anasayfa|Home/i })).toHaveAttribute("aria-current", "page");
    await expectMinTapSize(page, 'nav[aria-label*="gezinme"] button, nav[aria-label*="navigation"] button');
  });
}

test("MATRİS@mobile-390 — program ekranı: taşma yok", async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await guestLogin(page);
  await page.getByRole("navigation", { name: /Ana gezinme|Main navigation/i }).getByRole("button", { name: /Program/i }).click();
  await expect(page).toHaveURL(/#p=program/, { timeout: 10_000 });
  await page.waitForTimeout(800);
  await expectNoHOverflow(page);
});

test("MATRİS@desktop-1280 — admin PWA kartı: taşma yok", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await gotoPortalSettings(page);
  const card = page.locator("section").filter({
    has: page.getByRole("heading", { name: /Mobil Uygulama \(PWA\)|Mobile App \(PWA\)/i }),
  }).first();
  await expect(card).toBeVisible({ timeout: 15_000 });
  await expectNoHOverflow(page);
});
