// PWA test yöntemleri — paylaşılan yardımcılar (YÖNTEM-1: viewport matrisi)
// Kullanım: tests/pwa/32 (matris) + 33 (görsel) + 31 (denetim).
import { expect, type Page } from "@playwright/test";

export type PwaViewport = { name: string; width: number; height: number };

export const PWA_VIEWPORTS: PwaViewport[] = [
  { name: "mobile-390", width: 390, height: 844 },
  { name: "tablet-768", width: 768, height: 1024 },
  { name: "desktop-1280", width: 1280, height: 800 },
];

// YÖNTEM-1a: yatay taşma yok (mobil-first kilidi — 1px tolerans: alt-piksel yuvarlama)
export async function expectNoHOverflow(page: Page): Promise<void> {
  const v = await page.evaluate(() => ({
    sw: document.documentElement.scrollWidth,
    cw: document.documentElement.clientWidth,
  }));
  expect(v.sw, `yatay taşma: scrollWidth=${v.sw} > clientWidth=${v.cw}`).toBeLessThanOrEqual(v.cw + 1);
}

// YÖNTEM-1b: birincil dokunma hedefleri en az 40px (sektör: 44px; toleranslı 40)
export async function expectMinTapSize(page: Page, selector: string, min = 40): Promise<void> {
  const box = await page.locator(selector).first().boundingBox();
  expect(box, `${selector} görünür olmalı`).not.toBeNull();
  expect(Math.min(box!.width, box!.height), `${selector} dokunma hedefi`).toBeGreaterThanOrEqual(min);
}

// Admin: Dış Portal → Portal Ayarları sekmesine git (edisyon seçili)
export async function gotoPortalSettings(page: Page): Promise<void> {
  await page.goto("/");
  const edSelect = page.getByRole("combobox", { name: /Edisyon seçici|Edition picker/i });
  await edSelect.click();
  await page.getByRole("option", { name: /No-Dig Turkey 2026/i }).click();
  await page.getByRole("navigation", { name: /Ana menü|Main menu/i }).getByRole("button", { name: /Dış Portal/i }).click();
  await page.getByRole("tab", { name: /Portal Ayarları/i }).click();
}

// No-Dig 2026 edisyon kimliği (API düzeyi kurulum/temizlik için)
export async function editionIdOf(page: Page): Promise<string> {
  const boot = await page.request.get("/api/bootstrap");
  expect(boot.status()).toBe(200);
  const data = (await boot.json()) as { editions: { id: string; name: string }[] };
  const ed = data.editions.find((e) => /No-Dig Turkey 2026/i.test(e.name));
  expect(ed, "seed edisyonu bulunmalı").toBeTruthy();
  return ed!.id;
}
