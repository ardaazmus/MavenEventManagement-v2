// PWA-ADMIN v1 — YÖNTEM-3: görsel golden (piksel regresyon kilitleri)
// Yalnız demo projesinde koşar (piksel-determinizm). Golden PNG'ler bu dosyanın
// -snapshots klasöründedir; TASARIM değişikliğinde --update-snapshots ile
// yenilenir + MANUEL incelenir (kör güncelleme YASAK).
import { test, expect } from "@playwright/test";
import { guestLogin } from "../modules/_helpers";
import { gotoPortalSettings } from "./_pwa-helpers";

test.beforeEach(async ({}, info) => {
  test.skip(info.project.name !== "demo-auth-off", "golden: yalnız demo");
  // piksel-golden'lar platforma özgüdür (font rasterizasyonu) — win32 seti
  // commitlidir; başka platformda kör-golden üretilmesin diye atlanır.
  test.skip(process.platform !== "win32", "golden: yalnız win32 seti commitli");
});

test("GOLDEN — giriş kapısı @390 (tam sayfa)", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/?portal=no-dig-turkey-2026");
  await expect(page.getByRole("button", { name: /Portala Gir|Enter portal/i })).toBeVisible({ timeout: 15_000 });
  await page.waitForTimeout(600);
  await expect(page).toHaveScreenshot("pwa-gate-390.png", { animations: "disabled", maxDiffPixels: 400 });
});

test("GOLDEN — portal home @390 (canlı rozet maskeli)", async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await guestLogin(page);
  await expect(page.getByRole("navigation", { name: /Ana gezinme|Main navigation/i })).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(800);
  await expect(page).toHaveScreenshot("pwa-home-390.png", {
    animations: "disabled",
    maxDiffPixels: 1500,
    // bildirim rozeti + diğer-etkinlikler şeridi eşzamanlı spec'lerle değişebilir
    mask: [
      page.getByRole("button", { name: /Bildirim|Notification/i }).first(),
      page.getByRole("list", { name: /Diğer etkinlikler|Other events/i }).first(),
    ],
    maskColor: "#cccccc",
  });
});

test("GOLDEN — admin PWA kartı @1280 (tema satırı maskeli)", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await gotoPortalSettings(page);
  const card = page.locator("section").filter({
    has: page.getByRole("heading", { name: /Mobil Uygulama \(PWA\)|Mobile App \(PWA\)/i }),
  }).first();
  await expect(card).toBeVisible({ timeout: 15_000 });
  // sticky başlık kart karesine biner (canlı rozet) — golden'da gizle, kartın TAMAMI karşılaştırılsın
  await page.addStyleTag({ content: "header.sticky{display:none!important}" });
  await card.scrollIntoViewIfNeeded();
  await page.waitForTimeout(600);
  await expect(card).toHaveScreenshot("pwa-admin-card-1280.png", {
    animations: "disabled",
    maxDiffPixels: 800,
    // tema satırı eşzamanlı tasarım testlerinden etkilenebilir
    mask: [card.getByText(/theme_color/i).first()],
    maskColor: "#cccccc",
  });
});
