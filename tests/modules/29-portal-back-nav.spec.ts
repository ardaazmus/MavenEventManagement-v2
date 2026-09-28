// CRON-E2E — Modül: Evrensel Geri-Navigasyon
// Her ekranın geri oku bir önceki sayfaya döner; detay önce kapanır;
// sistem geri tuşu yığını takip eder; sekme değişimi yığını sıfırlar.
import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { guestLogin, removeDevtoolsOverlay, gotoScreen } from "./_helpers";

const BACK = /Geri|Back/i;
const SLUG = "no-dig-turkey-2026";

const db = new PrismaClient();

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

test("FULL — program gün hapları: ikinci güne atlama", async ({ page }) => {
  await guestLogin(page);
  await removeDevtoolsOverlay(page);
  await gotoScreen(page, /Program|Agenda/i);
  await expect(page.getByRole("heading", { name: /Genel Program|Agenda/i }).first()).toBeVisible();
  const pills = page.getByRole("tab", { name: /Gün \d+|Day \d+/i });
  const dayHeads = page.locator("h3");
  if ((await pills.count()) < 2) {
    // tek-gün programda hap barı yok — liste renderı doğrulanır
    expect(await dayHeads.count()).toBeGreaterThanOrEqual(1);
    return;
  }
  await pills.nth(1).click();
  await expect(pills.nth(1)).toHaveAttribute("aria-selected", "true");
  await expect(dayHeads.nth(1)).toBeVisible();
});

test("FULL — konuşmacı arama: filtre + sonuç-yok + temizleme", async ({ page }) => {
  await guestLogin(page);
  await removeDevtoolsOverlay(page);
  await gotoScreen(page, /Konuşmacılar|Speakers/i);
  await expect(page.getByRole("heading", { name: /Konuşmacılar|Speakers/i }).first()).toBeVisible();
  const items = page.getByRole("listitem");
  const total = await items.count();
  if (total === 0) {
    await expect(page.getByText(/atanan konuşmacı|No speakers assigned/i)).toBeVisible();
    return;
  }
  const firstName = ((await items.first().innerText()).split(/\s+/)[0] ?? "").trim();
  expect(firstName.length).toBeGreaterThan(1);
  const box = page.getByPlaceholder(/Konuşmacı, unvan|Search name/i);
  await box.fill(firstName);
  expect(await items.count()).toBeGreaterThanOrEqual(1);
  expect(await items.count()).toBeLessThanOrEqual(total);
  await expect(items.first()).toContainText(firstName);
  await box.fill("zzzq9yok");
  await expect(page.getByText(/eşleşen konuşmacı|No speakers match/i)).toBeVisible();
  await box.fill("");
  expect(await items.count()).toBe(total);
});

test("FULL — canlı hero: devam eden oturum home'da nabız rozetiyle", async ({ page }) => {
  test.skip(process.env.E2E_SHARED_DEV_DB !== "1", "canlı veri yazımı paylaşımlı-DB modu ister");
  const edition = await db.eventEdition.findUnique({ where: { slug: SLUG }, select: { id: true } });
  expect(edition).not.toBeNull();
  const title = `E2E Canlı ${Date.now()}`;
  const session = await db.programSession.create({
    data: {
      editionId: edition!.id,
      title,
      type: "TALK",
      startTime: new Date(Date.now() - 30 * 60_000),
      endTime: new Date(Date.now() + 30 * 60_000),
      status: "PUBLISHED",
      isVisible: true,
    },
    select: { id: true },
  });
  try {
    await guestLogin(page);
    await removeDevtoolsOverlay(page);
    await expect(page.getByText(/Şimdi devam ediyor|Happening now/i)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText(title)).toBeVisible();
  } finally {
    await db.programSession.delete({ where: { id: session.id } }).catch(() => undefined);
  }
});
