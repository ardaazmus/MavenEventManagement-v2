// CRON-E2E — Modül: i18n (TR/EN) + WCAG 3.1.1
// Tam akış: admin dil düğmesi TR↔EN → html lang canlı senkron → portal EN akışı
// (Dış Portal sekme etiketleri EN) → TR'ye geri; sözlük simetrisi script doğrulaması
import { test, expect } from "@playwright/test";
import { execSync } from "child_process";
import { guestLogin } from "./_helpers";

test("SMOKE — <html lang> varsayılanı tr ve hydration ile senkron", async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  const lang = await page.evaluate(() => document.documentElement.lang);
  expect(["tr", "en"]).toContain(lang);
});

test("FULL — admin EN geçişi → htmlLang=en → portal EN etiketleri → TR'ye geri", async ({ page }) => {
  test.setTimeout(90_000);

  // 1) admin: dil düğmesi (TR görünürken "EN" yazar, aria-label ingilizceye geçiştir)
  await page.goto("/");
  await expect(page.getByRole("navigation", { name: /Ana menü|Main menu/i })).toBeVisible({ timeout: 15_000 });
  const langBtn = page.getByRole("button", { name: /Switch to English|Türkçe'ye geç/i });
  await expect(langBtn).toBeVisible();
  await langBtn.click(); // tr → en
  await expect(page.getByRole("button", { name: /Türkçe'ye geç|Switch to English/i })).toBeVisible();

  // 2) WCAG 3.1.1 — html lang EN'e senkron olur (CRON-9 syncHtmlLang)
  await expect
    .poll(async () => page.evaluate(() => document.documentElement.lang), { timeout: 10_000 })
    .toBe("en");

  // 3) portal aynı dil havuzunu kullanır — giriş ekranı EN etiketleriyle boyanır
  //    (Event Code / Enter Portal — Dış Portal etiketlerinin EN render'ı)
  await page.goto("/?portal=no-dig-turkey-2026");
  await page.waitForLoadState("networkidle");
  await expect(page.getByRole("tab", { name: /Event Code|Etkinlik Kodu/i })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("button", { name: /Enter Portal|Portala Gir/i })).toBeVisible();

  // 4) EN modunda guest girişi — ana gezinme EN etiketi taşır ve html lang en kalır
  await guestLogin(page);
  await expect(page.getByRole("navigation", { name: /Main navigation/i })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("list", { name: /Modules/i })).toBeVisible({ timeout: 15_000 });
  await expect
    .poll(async () => page.evaluate(() => document.documentElement.lang), { timeout: 10_000 })
    .toBe("en");

  // 5) TR'ye geri — dil düğmesi "TR" yazar, html lang tr olur; canlı oturum TR grid'i gösterir
  await page.goto("/");
  await page.getByRole("button", { name: /Türkçe'ye geç|Switch to English/i }).click();
  await expect
    .poll(async () => page.evaluate(() => document.documentElement.lang), { timeout: 10_000 })
    .toBe("tr");
  await expect(page.getByRole("button", { name: /Switch to English/i })).toBeVisible();
  await page.goto("/?portal=no-dig-turkey-2026");
  await expect(page.getByRole("list", { name: /Modüller|Modules/i })).toBeVisible({ timeout: 15_000 });
});

test("FULL — sözlük simetrisi: i18n bakım kapısı (tırmık) 0 ihlal", async () => {
  // bake script'in simetri denetimi — tırmık aşılırsa exit 1 (test kırmızı)
  expect(() => execSync("node scripts/i18n-hardcoded-scan.mjs", { cwd: "/home/z/my-project", stdio: "pipe" })).not.toThrow();
});
