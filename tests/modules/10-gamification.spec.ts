// CRON-10 İSKELET — Modül: Oyunlaştırma (seviye/görev/liderlik)
// CRON-E2E: tam akış — puan kazanma (form/QA/B2B), level-up, görev ilerleme çubukları,
// liderlik ad-görünürlük politikası (MASKED/TAM/GİZLİ)
import { test, expect } from "@playwright/test";
import { guestLogin, gotoScreen } from "./_helpers";

test("SMOKE — oyun ekranı açılır (Görevler & Rozetler)", async ({ page }) => {
  await guestLogin(page);
  await gotoScreen(page, /Görevler & Rozetler|Badges & Quests/i);
  await expect(page.getByText(/Bronz|Bronze|puan|points/i).first()).toBeVisible();
});

test.fixme("FULL — puan kazan → seviye çubuğu scaleX animasyonu → liderlik maskesi", async () => {
  // TODO(CRON-E2E): form gönder → 20 puan → %40 çubuk → sıradaki seviye satırı.
});
