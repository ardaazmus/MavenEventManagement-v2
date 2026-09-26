// CRON-E2E — Modül: Sabit Alt Menü (§3.3)
// Tam akış: 5 nav butonu, aktif-sekme pill'i sekme değişiminde taşınır,
// admin chrome yapılandırması (bottomNavJson) menü içerik yansıması
import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { guestLogin, removeDevtoolsOverlay } from "./_helpers";

const db = new PrismaClient();

test("SMOKE — 5 nav butonu + aktif pill (Anasayfa)", async ({ page }) => {
  await guestLogin(page);
  await removeDevtoolsOverlay(page);
  const nav = page.getByRole("navigation", { name: /Ana gezinme|Main navigation/i });
  await expect(nav.getByRole("button")).toHaveCount(5);
  await expect(nav.getByRole("button", { name: /Anasayfa|Home/i })).toHaveAttribute("aria-current", "page");
});

test("FULL — aktif pill sekme değişiminde taşınır + nav yerleşimi chrome'tan gelir", async ({ page }) => {
  await guestLogin(page);
  await removeDevtoolsOverlay(page);
  const nav = page.getByRole("navigation", { name: /Ana gezinme|Main navigation/i });

  // 1) Program sekmesi — aria-current pill taşınır + program ekranı başlığı doğar
  await nav.getByRole("button", { name: /Program|Agenda/i }).click();
  await expect(nav.getByRole("button", { name: /Program|Agenda/i })).toHaveAttribute("aria-current", "page");
  await expect(nav.getByRole("button", { name: /Anasayfa|Home/i })).not.toHaveAttribute("aria-current", "page");
  await expect(page.getByText(/Genel Program|Program|Agenda/i).first()).toBeVisible();

  // 2) geri — Anasayfa pill'i geri gelir
  await nav.getByRole("button", { name: /Anasayfa|Home/i }).click();
  await expect(nav.getByRole("button", { name: /Anasayfa|Home/i })).toHaveAttribute("aria-current", "page");
  await expect(page.getByRole("list", { name: /Modüller|Modules/i })).toBeVisible();

  // 3) chrome yapılandırması: bottomNavJson program=false yapılırsa menüden düşer,
  //    kayıt tekrar açıldığında geri gelir (portal Anasayfa+Profil sabittir)
  const edition = await db.eventEdition.findUnique({ where: { slug: "no-dig-turkey-2026" }, select: { id: true } });
  const config = await db.eventPortalConfig.findUnique({ where: { editionId: edition!.id }, select: { id: true, bottomNavJson: true } });
  expect(config).not.toBeNull();
  try {
    await db.eventPortalConfig.update({
      where: { id: config!.id },
      data: { bottomNavJson: JSON.stringify({ program: false, sponsors: true, map: true }) },
    });
    // guest oturumu localStorage'da yaşıyor — reload ile taze yapılandırma yüklenir
    await page.reload();
    await expect(page.getByRole("navigation", { name: /Ana gezinme|Main navigation/i })).toBeVisible({ timeout: 15_000 });
    const navAfter = page.getByRole("navigation", { name: /Ana gezinme|Main navigation/i });
    expect(await navAfter.getByRole("button").count()).toBeLessThan(5);
    await expect(navAfter.getByRole("button", { name: /Program|Agenda/i })).toHaveCount(0);
    await expect(navAfter.getByRole("button", { name: /Sponsorlar|Sponsors/i })).toBeVisible();
    await expect(navAfter.getByRole("button", { name: /Anasayfa|Home/i })).toBeVisible(); // sabit
    await expect(navAfter.getByRole("button", { name: /Profil|Profile/i })).toBeVisible(); // sabit
  } finally {
    await db.eventPortalConfig.update({ where: { id: config!.id }, data: { bottomNavJson: config!.bottomNavJson } });
  }
});
