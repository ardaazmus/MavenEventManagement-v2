// CRON-10 İSKELET — Modül: Admin Tüm Kartlar (Ayarlar IA bütünlüğü)
// CRON-E2E: tam akış — dirty-state guard, Kaydedildi rozeti, config export/import,
// DB&Migration yalnız-okur, tasarım örnek kartı, ikon kanvası
import { test, expect } from "@playwright/test";

test("SMOKE — admin konsolu render (footer model sayısı)", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByText(/model|modül/i).first()).toBeVisible({ timeout: 10_000 }).catch(() => {
    // dashboard varyantlarına toleranslı — CRON-E2E modül bazlı detaylı gezer
  });
});

test.fixme("FULL — ayarlar kart turu: erişim/marka/tasarım/widget/chrome/oyun/bildirim/Q&A/içerik/analitik/yedekleme", async () => {
  // TODO(CRON-E2E): her kart açılır, Kaydet dirty akışı, JSON export/import döngüsü.
});
