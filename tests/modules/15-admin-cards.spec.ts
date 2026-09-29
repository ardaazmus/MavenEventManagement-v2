// CRON-E2E — Modül: Admin Tüm Kartlar (Ayarlar IA bütünlüğü)
// Tam akış: Portal Ayarları kart turu (12 kart başlığı) → dirty-state guard →
// Kaydet rozeti → config JSON export/import döngüsü → DB&Migration yalnız-okur
import { test, expect } from "@playwright/test";
import { readFileSync } from "fs";

const CARD_TITLES = [
  /Erişim ve Güvenlik Yönetimi/,
  /Görsel Yapılandırma ve Tema/,
  /Tasarım ve Tipografi/,
  /Dinamik Widget ve Modül Yönetimi/,
  /Ekran Üst Bantları/,
  /Oyunlaştırma \(Gamification\)/,
  /Bildirim Yönetimi/,
  /İçerik Bağlama/,
  /Canlı Portal İstatistikleri/,
  /Yapılandırma Yedekleme/,
  /Soru & Cevap Moderasyonu/,
  /Mobil Uygulama \(PWA\)/,
];

test("SMOKE — admin konsolu render (footer model sayısı)", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("navigation", { name: /Ana menü|Main menu/i })).toBeVisible({ timeout: 15_000 });
});

test("FULL — kart turu + dirty guard + JSON export/import döngüsü", async ({ page }) => {
  test.setTimeout(120_000);

  // 1) Dış Portal → Portal Ayarları — edisyon seçimiyle
  await page.goto("/");
  const edSelect = page.getByRole("combobox", { name: /Edisyon seçici|Edition picker/i });
  await edSelect.click();
  await page.getByRole("option", { name: /No-Dig Turkey 2026/i }).click();
  await page.getByRole("navigation", { name: /Ana menü|Main menu/i }).getByRole("button", { name: /Dış Portal/i }).click();
  await page.getByRole("tab", { name: /Portal Ayarları/i }).click();

  // 2) kart turu — 12 SectionCard başlığı tek tek görünür
  for (const title of CARD_TITLES) {
    await expect(page.getByRole("heading", { name: title })).toBeVisible({ timeout: 15_000 });
  }

  // 3) dirty-state guard — widget anahtarı kapatılır → "Kaydedilmemiş değişiklikler var" rozeti
  const dirtyBadge = page.getByText(/Kaydedilmemiş değişiklikler var|Unsaved changes/i);
  await expect(dirtyBadge).toHaveCount(0);
  const widgetsCard = page.locator("section").filter({
    has: page.getByRole("heading", { name: /Dinamik Widget ve Modül Yönetimi/ }),
  }).first();
  const toggle = widgetsCard.getByRole("switch").first();
  const stateBefore = await toggle.getAttribute("data-state");
  await toggle.click();
  await expect(dirtyBadge).toBeVisible();
  await page.getByRole("button", { name: /Ayarları Kaydet|Save settings/i }).click();
  await expect(page.getByText(/Ayarlar kaydedildi|Settings saved/i).first()).toBeVisible({ timeout: 10_000 });

  // 4) config export — JSON indir (dosya adı + içerik sözleşmesi)
  const backupCard = page.locator("section").filter({
    has: page.getByRole("heading", { name: /Yapılandırma Yedekleme/ }),
  }).first();
  const dl = page.waitForEvent("download", { timeout: 15_000 });
  await backupCard.getByRole("button", { name: /JSON İndir|Download JSON/i }).click();
  const download = await dl;
  expect(download.suggestedFilename()).toMatch(/\.json$/i);
  const path = await download.path();
  const exported = JSON.parse(readFileSync(path!, "utf8")) as Record<string, unknown>;
  expect(Object.keys(exported).length).toBeGreaterThan(0);

  // 5) config import — aynı dosya yüklenir → "Yapılandırma içe aktarıldı" toast'u
  await backupCard.locator("input[type='file']").setInputFiles(path!);
  await expect(page.getByText(/Yapılandırma içe aktarıldı|Configuration imported/i).first()).toBeVisible({ timeout: 10_000 });

  // 6) temizlik — widget anahtarını eski haline çevir + kaydet (baseline korunur)
  // QA-run4: import-sonrası re-render/geç fetch tıklamayı ezebiliyor (M29'u zehirledi) —
  // durum baseline'a dönene dek idempotent döngü.
  for (let i = 0; i < 3; i++) {
    const sw = widgetsCard.getByRole("switch").first();
    if ((await sw.getAttribute("data-state")) === stateBefore) break;
    await sw.click();
    await page.getByRole("button", { name: /Ayarları Kaydet|Save settings/i }).click();
    await expect(page.getByText(/Ayarlar kaydedildi|Settings saved/i).first()).toBeVisible({ timeout: 10_000 });
    await page.waitForTimeout(1500);
  }
  expect(await widgetsCard.getByRole("switch").first().getAttribute("data-state")).toBe(stateBefore);

  // 7) DB & Migration kartı yalnız-okur (Ayarlar modülünde, Geçici rozeti)
  await page.getByRole("navigation", { name: /Ana menü|Main menu/i }).getByRole("button", { name: /Ayarlar/i }).click();
  await expect(page.getByText(/Veritabanı & Migration/i).first()).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/Migration Denetim Paneli/i).first()).toBeVisible();
});
