// CRON-10 İSKELET — Modül: Soru-Cevap (gönderim + moderasyon döngüsü)
// CRON-E2E: tam akış — misafir soru gönderir, admin yanıtlar/gizler/yayına alır,
// portala "Organizatör yanıtı" düşer; qaCap 5 sınırı
import { test, expect } from "@playwright/test";
import { guestLogin, gotoScreen } from "./_helpers";

test("SMOKE — Q&A ekranı açılır + soru alanı", async ({ page }) => {
  await guestLogin(page);
  await gotoScreen(page, /Soru-Cevap|Q&A/i);
  await expect(page.getByText("Soru-Cevap", { exact: true }).first()).toBeVisible();
});

test.fixme("FULL — soru gönder → admin moderasyon → portal yanıtı görüntüleme", async () => {
  // TODO(CRON-E2E): guest POST → Portal Ayarları Q&A moderasyon → yanıtla → portala yansır.
});
