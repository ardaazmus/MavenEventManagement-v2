// CRON-E2E — Modül: Oyunlaştırma (seviye/görev/liderlik)
// Tam akış: Q&A gönderimi puan kazandırır (qaCap), oyun ekranı seviye çubuğunu
// (scaleX) ve görev ilerlemesini gösterir, liderlik ad-gizlilik politikası (MASKED)
import { test, expect } from "@playwright/test";
import { guestLogin, gotoScreen } from "./_helpers";

test("SMOKE — oyun ekranı açılır (Görevler & Rozetler)", async ({ page }) => {
  await guestLogin(page);
  await gotoScreen(page, /Görevler & Rozetler|Badges & Quests/i);
  await expect(page.getByText(/Bronz|Bronze|puan|points/i).first()).toBeVisible();
});

test("FULL — soru gönder → +10 puan → seviye çubuğu scaleX + görev ilerlemesi", async ({ page }) => {
  await guestLogin(page);

  // 1) Q&A'da misafir sorusu gönder — QA_SUBMIT puanı (+10) tetikler
  await gotoScreen(page, /Soru-Cevap|Q&A/i);
  const questionBox = page.getByLabel(/Sorunuz|Your question/i);
  await questionBox.fill("E2E: Ses sistemi için yedek mikrofon var mı?");
  await page.getByLabel(/Görünen adınız|Display name/i).fill("E2E Oyuncu");
  await page.getByRole("button", { name: /Soruyu Gönder|Submit question/i }).click();
  // oyunlaştırma açıkken toast başlığı "Puan kazandın!" olur; kapalıysa "Sorunuz alındı"
  await expect(page.getByText(/Puan kazandın!|Sorunuz alındı/i).first()).toBeVisible({ timeout: 10_000 });

  // 2) puan toast'u — QA_SUBMIT +10
  await expect(page.getByText(/Puan kazandın!|You earned points!/i).first()).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText(/\+10 puan|\+10 points/i).first()).toBeVisible({ timeout: 10_000 });

  // 3) oyun ekranı — toplam puan > 0 ve seviye çubuğu scaleX ile doluluk gösterir
  await gotoScreen(page, /Görevler & Rozetler|Badges & Quests/i);
  await expect(page.getByText(/\d+ puan|\d+ points/i).first()).toBeVisible({ timeout: 10_000 });
  const bar = page.getByRole("progressbar").locator("div").first();
  await expect(bar).toBeVisible({ timeout: 10_000 });
  const transform = await bar.evaluate((el) => getComputedStyle(el).transform);
  expect(transform).toMatch(/matrix/);
  expect(transform).not.toBe("none");

  // 4) görev listesi — Q&A görevi ilerlemiş (1/5) görünür
  await expect(page.getByText(/Soru-Cevap'ta soru sor/i).first()).toBeVisible();
  await expect(page.getByText("1/5")).toBeVisible({ timeout: 10_000 });

  // 5) liderlik tablosu — MASKED politikası: misafir adı ham görünmez,
  //    kendi satırı "Misafir · sen" etiketiyle vurgulanır
  await expect(page.getByText(/Liderlik Tablosu|Leaderboard/i).first()).toBeVisible();
  await expect(page.getByText(/Misafir/i).first()).toBeVisible({ timeout: 10_000 });
  const lbText = await page.locator("body").innerText();
  expect(lbText).not.toContain("E2E Oyuncu");
});
