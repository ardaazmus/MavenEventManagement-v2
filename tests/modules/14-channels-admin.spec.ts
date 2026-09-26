// CRON-10 İSKELET — Modül: WhatsApp & SMS Kanalları (Admin → Genel İletişim)
// CRON-E2E: tam akış — kanal kartı konumu (Ayarlar → GRUP 3 · GENEL İLETİŞİM),
// DEMO test gönderimi, Gönderim Raporu (IntegrationLog), portal-ayarlarında KART YOK
import { test, expect } from "@playwright/test";

test("SMOKE — admin ayarları açılır (ONSITE modülü)", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("body")).not.toBeEmpty();
});

test.fixme("FULL — kanal kartı: sağlayıcı seç (DEMO) → test gönder → rapor kayıtları", async () => {
  // TODO(CRON-E2E): Ayarlar → Genel İletişim → WhatsApp/SMS DEMO test → "Son test" + raporlar;
  // Portal Ayarları'nda "Bildirim Kanalları" 0 eşleşme (konum kanıtı).
});
