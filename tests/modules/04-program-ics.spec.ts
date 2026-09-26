// CRON-10 İSKELET — Modül: Program + ICS (Takvime Ekle)
// CRON-E2E: tam akış — oturum genişletme, hatırlatıcı, ICS indirme (download event)
import { test, expect } from "@playwright/test";
import { guestLogin, gotoScreen } from "./_helpers";

test("SMOKE — program ekranı açılır, oturum kartları listelenir", async ({ page }) => {
  await guestLogin(page);
  await gotoScreen(page, /Program|Agenda/i);
  await expect(page.getByText(/Açılış Konuşması|Opening/i).first()).toBeVisible();
});

test.fixme("FULL — oturum genişlet → Takvime Ekle → download event ile ICS doğrula", async () => {
  // TODO(CRON-E2E): page.waitForEvent("download") — dosya adı + ICS başlığı (BEGIN:VCALENDAR).
});
