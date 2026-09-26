// CRON-E2E — Modül: WhatsApp & SMS Kanalları (Admin → Genel İletişim)
// Tam akış: Ayarlar → GRUP 3 · GENEL İLETİŞİM konumu (portal ayarlarında YOK) →
// DEMO sağlayıcı seçimi → kaydet → test gönderimi → "Son test" + Gönderim Raporu
import { test, expect } from "@playwright/test";

test("SMOKE — admin ayarları açılır", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("navigation", { name: /Ana menü|Main menu/i }).getByRole("button", { name: /Ayarlar/i }).click();
  await expect(page.getByText(/Etkinlik Ayarları|Event settings/i).first()).toBeVisible({ timeout: 15_000 });
});

test("FULL — kanal kartı: DEMO sağlayıcı → kaydet → test gönder → rapor kayıtları", async ({ page }) => {
  test.setTimeout(120_000);

  // 1) Ayarlar modülü → GENEL İLETİŞİM grubu → kanal kartı (SectionCard h3 başlığı)
  await page.goto("/");
  await page.getByRole("navigation", { name: /Ana menü|Main menu/i }).getByRole("button", { name: /Ayarlar/i }).click();
  await expect(page.getByText(/İletişim & Bildirim Kanalları/i).first()).toBeVisible({ timeout: 15_000 });
  const card = page.locator("section").filter({
    has: page.getByRole("heading", { name: /Bildirim Kanalları — WhatsApp & SMS/i }),
  }).first();
  await expect(card).toBeVisible();

  // 2) ana anahtar AÇIK + WhatsApp DEMO sağlayıcı (Radix Select: tetik + seçenek tıklaması)
  const master = card.getByRole("switch").first();
  if ((await master.getAttribute("data-state")) !== "checked") await master.click();
  const waSwitch = card.getByRole("switch", { name: /^WhatsApp$/ }).first();
  if ((await waSwitch.getAttribute("data-state")) !== "checked") await waSwitch.click();
  await expect(card.getByText(/Demo sağlayıcısı ağa çıkmaz/i).first()).toBeVisible({ timeout: 5_000 }).catch(() => {
    // DEMO notu yalnız sağlayıcı seçiminde görünür — bir sonraki adımda seçilir
  });
  const waProvider = card.getByRole("combobox").first();
  await waProvider.click();
  await page.getByRole("option", { name: /Demo \(simülasyon\)/i }).first().click();
  await expect(card.getByText(/Demo sağlayıcısı ağa çıkmaz/i).first()).toBeVisible();

  // 3) kaydet — "Kanal ayarları kaydedildi" toast'u
  await card.getByRole("button", { name: /Kanalları Kaydet|Save channels/i }).click();
  await expect(page.getByText(/Kanal ayarları kaydedildi|Channel settings saved/i).first()).toBeVisible({ timeout: 10_000 });

  // 4) test gönderimi (DEMO — ağa çıkmaz, akışı simüle eder) → başarı toast'u
  await card.getByPlaceholder(/\+90555…/).fill("+905551112233");
  await card.getByRole("button", { name: /WhatsApp test/i }).click();
  await expect(page.getByText(/Test gönderimi başarılı|Test delivery succeeded/i).first()).toBeVisible({ timeout: 15_000 });

  // 5) "Son test" satırı işlenir + raporlar listesi (IntegrationLog) — sayfa tazelemede
  await page.reload();
  await page.getByRole("navigation", { name: /Ana menü|Main menu/i }).getByRole("button", { name: /Ayarlar/i }).click();
  const cardAfter = page.locator("section").filter({
    has: page.getByRole("heading", { name: /Bildirim Kanalları — WhatsApp & SMS/i }),
  }).first();
  await expect(cardAfter).toBeVisible({ timeout: 15_000 });
  await expect(cardAfter.getByText(/Son test|Last test/i)).toBeVisible();
  await expect(cardAfter.getByText(/Gönderim Raporu|Delivery report/i).first()).toBeVisible();
  // rapor boş durumu kalkar + kayıt sayacı ≥1 ("N kayıt" çipi)
  await expect(cardAfter.getByText(/Henüz gönderim kaydı yok/i)).toHaveCount(0);
  await expect(cardAfter.getByText(/1 kayıt/i).first()).toBeVisible({ timeout: 10_000 });

  // 6) konum kanıtı: Portal Ayarları'nda (Dış Portal) kanal kartı YOK (genel iletişim ayrımı)
  await page.getByRole("navigation", { name: /Ana menü|Main menu/i }).getByRole("button", { name: /Dış Portal/i }).click();
  await page.getByRole("tab", { name: /Portal Ayarları/i }).click();
  await expect(page.getByText(/Canlı Duyuru Paneli/i).first()).toBeVisible({ timeout: 15_000 });
  await expect(page.getByRole("heading", { name: /Bildirim Kanalları — WhatsApp & SMS/i })).toHaveCount(0);
});
