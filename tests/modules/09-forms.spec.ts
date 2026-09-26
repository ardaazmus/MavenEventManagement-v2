// CRON-10 İSKELET — Modül: Formlar & Quizler (görev-duyarlı gruplama)
// CRON-E2E: tam akış — DEVAM EDEN/TAMAMLANDI grupları, tür rozetleri, +puan çipi,
// portal-içi form açılışı (header/footer kalıcılığı), gönderim + puan toast
import { test, expect } from "@playwright/test";
import { guestLogin, gotoScreen } from "./_helpers";

test("SMOKE — formlar ekranı + açık form sayısı", async ({ page }) => {
  await guestLogin(page);
  await gotoScreen(page, /Formlar & Quizler|Forms & Quizzes/i);
  await expect(page.getByText("Formlar & Quizler", { exact: true }).first()).toBeVisible();
});

test.fixme("FULL — anket doldur → gönder → TAMAMLANDI grubuna düşer + puan toast", async () => {
  // TODO(CRON-E2E): Portal-içi form motoru (lazy chunk) → doldur → gönder → grup değişimi.
});
