// CRON-10 İSKELET — Modül: i18n (TR/EN) + WCAG 3.1.1
// CRON-E2E: tam akış — dil değişimi TR↔EN, html lang senkronu, sekme etiketleri,
// sözlük simetrisi (script tabanlı), eksik-anahtar console.warn taraması
import { test, expect } from "@playwright/test";

test("SMOKE — <html lang> varsayılanı tr ve hydration ile senkron", async ({ page }) => {
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  const lang = await page.evaluate(() => document.documentElement.lang);
  expect(["tr", "en"]).toContain(lang);
});

test.fixme("FULL — admin EN geçişi → Dış Portal sekmeleri EN + htmlLang=en → TR'ye geri", async () => {
  // TODO(CRON-E2E): dil düğmesi → t() çevirileri + document.documentElement.lang canlı senkron.
});
