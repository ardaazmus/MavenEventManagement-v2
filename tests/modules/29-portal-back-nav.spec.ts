// CRON-E2E — Modül: Evrensel Geri-Navigasyon
// Her ekranın geri oku bir önceki sayfaya döner; detay önce kapanır;
// sistem geri tuşu yığını takip eder; sekme değişimi yığını sıfırlar.
import { test, expect } from "@playwright/test";
import { guestLogin, removeDevtoolsOverlay, gotoScreen } from "./_helpers";

const BACK = /Geri|Back/i;

test("SMOKE — geri oku zinciri: liste→detay→liste→home + hash aynası", async ({ page }) => {
  await guestLogin(page);
  await removeDevtoolsOverlay(page);

  // 1) home → konuşmacılar (yığına push + hash aynası)
  await gotoScreen(page, /Konuşmacılar|Speakers/i);
  await expect(page.getByRole("heading", { name: /Konuşmacılar|Speakers/i }).first()).toBeVisible();
  await expect(page).toHaveURL(/#p=speakers/);
  const backBtn = page.getByRole("button", { name: BACK });
  await expect(backBtn).toBeVisible();

  // 2) detay aç → geri oku önce detayı kapatır (ekrandan çıkarmaz)
  await page.getByRole("listitem").first().click();
  await expect(page.getByRole("heading", { name: /Konuşmacı Detayı|Speaker Detail/i })).toBeVisible();
  await backBtn.click();
  await expect(page.getByRole("heading", { name: /Konuşmacılar|Speakers/i }).first()).toBeVisible();

  // 3) geri oku listeden home'a döner (gerçek "önceki sayfa")
  await backBtn.click();
  await expect(page.getByRole("list", { name: /Modüller|Modules/i })).toBeVisible();
  await expect(page).toHaveURL(/#p=home/);
});

test("FULL — sistem geri tuşu yığını takip eder, sekme yığını sıfırlar", async ({ page }) => {
  await guestLogin(page);
  await removeDevtoolsOverlay(page);

  // 1) home → program (WIDGET ile push) → sistem geri → home
  //    (sekme reset'ler ve history'e yazmaz — native kök davranışı)
  const grid = page.getByRole("list", { name: /Modüller|Modules/i });
  await grid.getByRole("listitem").filter({ hasText: /Program|Ajanda|Agenda/i }).first().click();
  await expect(page.getByRole("heading", { name: /Genel Program|Agenda/i }).first()).toBeVisible();
  await expect(page).toHaveURL(/#p=program/);
  await page.goBack();
  await expect(page.getByRole("list", { name: /Modüller|Modules/i })).toBeVisible();

  // 2) home → formlar (widget) → program (sekme) → geri oku home'a (formlar'a değil)
  await gotoScreen(page, /Formlar|Forms/i);
  await expect(page).toHaveURL(/#p=forms/);
  const nav = page.getByRole("navigation", { name: /Ana gezinme|Main navigation/i });
  await nav.getByRole("button", { name: /Program|Agenda/i }).click();
  await expect(page.getByRole("heading", { name: /Genel Program|Agenda/i }).first()).toBeVisible();
  await page.getByRole("button", { name: BACK }).click();
  await expect(page.getByRole("list", { name: /Modüller|Modules/i })).toBeVisible();
});
