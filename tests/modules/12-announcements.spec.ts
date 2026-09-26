// CRON-E2E — Modül: Duyurular (banner + Canlı Duyuru)
// Tam akış: karşılama duyurusu gösterimi → kapatma kalıcılığı (localStorage) →
// admin Canlı Duyuru gönderimi → portala anında düşer + bildirim merkezine girer
import { test, expect } from "@playwright/test";
import { guestLogin, gotoScreen } from "./_helpers";

test("SMOKE — karşılama duyurusu banner'ı görünür + kapatılabilir", async ({ page }) => {
  await guestLogin(page);
  await expect(page.getByRole("button", { name: /Duyuruyu kapat|Dismiss/i })).toBeVisible();
});

test("FULL — kapatma kalıcılığı + Canlı Duyuru gönderimi portala düşer", async ({ page }) => {
  test.setTimeout(90_000);

  // 1) karşılama duyurusunu kapat → localStorage'a yazılır
  await guestLogin(page);
  await page.getByRole("button", { name: /Duyuruyu kapat|Dismiss/i }).click();
  await expect(page.getByRole("button", { name: /Duyuruyu kapat|Dismiss/i })).toHaveCount(0);
  const dismissedId = await page.evaluate(() => localStorage.getItem("maven.portal.anndismiss.no-dig-turkey-2026"));
  expect(dismissedId).toBeTruthy();

  // 2) ekran değişiminde geri gelmez (kalıcı kapatma)
  await gotoScreen(page, /Sponsorlar|Sponsors/i);
  await expect(page.getByRole("button", { name: /Duyuruyu kapat|Dismiss/i })).toHaveCount(0);
  await page.getByRole("navigation", { name: /Ana gezinme|Main navigation/i }).getByRole("button", { name: /Anasayfa|Home/i }).click();
  await expect(page.getByRole("button", { name: /Duyuruyu kapat|Dismiss/i })).toHaveCount(0);

  // 3) admin: Canlı Duyuru Paneli (Dış Portal → Portal Ayarları) — yeni duyuru gönder
  const TITLE = `E2E Canlı Duyuru ${Date.now()}`;
  await page.goto("/");
  const edSelect = page.getByRole("combobox", { name: /Edisyon seçici|Edition picker/i });
  await edSelect.click();
  await page.getByRole("option", { name: /No-Dig Turkey 2026/i }).click();
  await page.getByRole("navigation", { name: /Ana menü|Main menu/i }).getByRole("button", { name: /Dış Portal/i }).click();
  await page.getByRole("tab", { name: /Portal Ayarları/i }).click();
  await page.getByText(/Canlı Duyuru Paneli/i).first().waitFor({ timeout: 15_000 });
  await page.getByPlaceholder(/örn\. Ana salonda|e\.g\./i).fill(TITLE);
  await page.getByPlaceholder(/Duyuru metni…|Announcement text/i).fill("E2E: Kahve molası 10 dakika sonra başlıyor.");
  await page.getByRole("button", { name: /Duyuruyu Gönder|Send announcement/i }).click();
  // DÜZELTME (strict-mode): paneldeki "Bugüne kadar N duyuru gönderildi" özet satırı da
  // gevşek regex'e eşleşir — toast başlığı SABİTLENMİŞ regexle hedeflenir.
  await expect(page.getByText(/^Duyuru gönderildi$|^Announcement sent$/)).toBeVisible({ timeout: 15_000 });

  // 4) portala anında düşer — yeni duyuru banner'ı görünür (kapatılmamış EN GÜNCEL duyuru)
  await page.goto("/?portal=no-dig-turkey-2026");
  await expect(page.getByRole("list", { name: /Modüller|Modules/i })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(TITLE).first()).toBeVisible({ timeout: 15_000 });

  // 5) bildirim merkezine de girer (DUYURULAR geçmişi)
  await page.getByRole("button", { name: /Bildirim merkezini aç|Open notification/i }).click();
  const sheet = page.getByRole("dialog");
  await expect(sheet).toBeVisible({ timeout: 10_000 });
  await expect(sheet.getByText(TITLE).first()).toBeVisible({ timeout: 10_000 });
});
