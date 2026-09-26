// CRON-E2E — Modül: Program + ICS (Takvime Ekle)
// Tam akış: oturum genişletme → hatırlatıcı kurma → ICS indirme (download event,
// RFC 5545 gövde + SUMMARY + .ics dosya adı)
import { test, expect } from "@playwright/test";
import { readFileSync } from "fs";
import { guestLogin, gotoScreen } from "./_helpers";

test("SMOKE — program ekranı açılır, oturum kartları listelenir", async ({ page }) => {
  await guestLogin(page);
  await gotoScreen(page, /Program|Agenda/i);
  await expect(page.getByText(/Açılış Konuşması|Opening/i).first()).toBeVisible();
});

test("FULL — oturum genişlet → hatırlatıcı → Takvime Ekle ICS download doğrulaması", async ({ page }) => {
  await guestLogin(page);
  await gotoScreen(page, /Program|Agenda/i);

  // 1) ilk oturum kartını genişlet (aria-expanded düğmesi) — açıklama + aksiyonlar açılır
  const card = page.getByRole("button", { name: /Açılış Konuşması|Opening/i }).first();
  await card.click();
  const expanded = page.locator("button[aria-expanded='true']").first();
  await expect(expanded).toBeVisible();
  await expect(page.getByText(/Hatırlat|Remind/i).first()).toBeVisible();
  await expect(page.getByRole("button", { name: /Takvime Ekle|Add to calendar/i }).first()).toBeVisible();

  // 2) hatırlatıcı kur — buton durumu değişir (BellRing) + toast
  const remindBtn = page.getByRole("button", { name: /Hatırlat|Remind/i }).first();
  await remindBtn.click();
  await expect(page.getByText(/Hatırlatıcı|Reminder/i).first()).toBeVisible({ timeout: 8_000 });

  // 3) ICS indirme — blob tabanlı gerçek dosya: ad + içerik sözleşmesi (RFC 5545)
  const dlPromise = page.waitForEvent("download", { timeout: 15_000 });
  await page.getByRole("button", { name: /Takvime Ekle|Add to calendar/i }).first().click();
  const dl = await dlPromise;
  expect(dl.suggestedFilename()).toMatch(/\.ics$/i);
  const path = await dl.path();
  expect(path).toBeTruthy();
  const body = readFileSync(path!, "utf8");
  expect(body).toContain("BEGIN:VCALENDAR");
  expect(body).toContain("BEGIN:VEVENT");
  expect(body).toMatch(/^DTSTART:\d{8}T\d{6}Z$/m); // UTC zaman damgası
  expect(body).toContain("SUMMARY:"); // oturum başlığı özet olarak geçer
  expect(body).toContain("END:VCALENDAR");
});
