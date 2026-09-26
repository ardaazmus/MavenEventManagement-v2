// CRON-E2E — Modül: Bildirim Merkezi (çan + sheet)
// Tam akış: okunmadı rozeti → sheet açılır (DUYURULAR + YAKLAŞAN HATIRLATICILAR) →
// kapanışta okundu işaretleme (maven.portal.notifread) → yenilemede rozet temizlenir
import { test, expect } from "@playwright/test";
import { guestLogin } from "./_helpers";

const SLUG = "no-dig-turkey-2026";

test("SMOKE — üst bantta çan butonu (aria-label)", async ({ page }) => {
  await guestLogin(page);
  await expect(page.getByRole("button", { name: /Bildirim merkezini aç|Open notification/i })).toBeVisible();
});

test("FULL — çan → sheet duyuru geçmişi → kapat → notifread yazımı + rozet temizliği", async ({ page }) => {
  await guestLogin(page);

  // 1) duyurular varsa okunmadı rozeti (sayı etiketi) görünür — karşılama duyurusu seed'i
  const bell = page.getByRole("button", { name: /Bildirim merkezini aç|Open notification/i });
  await expect(bell).toBeVisible();
  expect(await bell.locator("span").count()).toBeGreaterThan(0);

  // 2) sheet açılır — DUYURULAR bölümü + karşılama duyurusu geçmişi
  await bell.click();
  const sheet = page.getByRole("dialog");
  await expect(sheet).toBeVisible({ timeout: 10_000 });
  await expect(sheet.getByText(/Duyurular|Announcements/i).first()).toBeVisible();
  await expect(sheet.getByText(/Katılımcı Portalına Hoş Geldiniz/i).first()).toBeVisible({ timeout: 10_000 });
  // YAKLAŞAN HATIRLATICILAR bölümü başlığı da mevcut
  await expect(sheet.getByText(/Yaklaşan hatırlatıcılar|Upcoming reminders/i).first()).toBeVisible();

  // 3) kapat — okundu işaretleme localStorage'a yazılır
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const readMs = await page.evaluate((s) => Number(localStorage.getItem(`maven.portal.notifread.${s}`)), SLUG);
  expect(readMs).toBeGreaterThan(0);

  // 4) yenileme sonrası rozet temizlenir (okunmadı sayısı 0)
  await page.reload();
  const bellAfter = page.getByRole("button", { name: /Bildirim merkezini aç|Open notification/i });
  await expect(bellAfter).toBeVisible({ timeout: 15_000 });
  expect(await bellAfter.locator("span").count()).toBe(0);
});
