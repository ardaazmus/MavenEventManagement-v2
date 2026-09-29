// PWA-ADMIN v1 — YÖNTEM-2: PWA denetimi (manifest/SW/çevrimdışı/sheet/bar)
// Tüm baseline iddiaları KİRLENME-TOLERANSLIDIR (30-FULL ile aynı DB'yi paylaşır):
// değer-eşitliği değil YAPISAL sözleşme doğrulanır.
import { test, expect } from "@playwright/test";
import { guestLogin, isolateClientIp } from "../modules/_helpers";
import { editionIdOf } from "./_pwa-helpers";

const SLUG = "no-dig-turkey-2026";
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

test("DENETİM — dinamik manifest şeması + ikon baytları + kısayol kapsamı", async ({ page }) => {
  const res = await page.request.get(`/api/portal/manifest?slug=${SLUG}`);
  expect(res.status()).toBe(200);
  expect(res.headers()["content-type"]).toContain("application/manifest+json");
  const m = (await res.json()) as {
    name?: string; short_name?: string; start_url?: string; scope?: string; display?: string;
    theme_color?: string; background_color?: string;
    icons?: { src: string; sizes: string; type: string; purpose: string }[];
    shortcuts?: { name: string; url: string }[];
    screenshots?: { src: string; form_factor: string }[];
  };
  // zorunlu üyeler
  expect(m.name?.length).toBeGreaterThan(1);
  expect(m.short_name?.length).toBeGreaterThan(0);
  expect(m.short_name!.length).toBeLessThanOrEqual(24);
  expect(m.start_url).toBe(`/?portal=${SLUG}`);
  expect(m.scope).toBe("/");
  expect(["standalone", "minimal-ui"]).toContain(m.display);
  expect(m.theme_color).toMatch(/^#[0-9a-fA-F]{6}$/);
  expect(m.background_color).toMatch(/^#[0-9a-fA-F]{6}$/);
  // ikonlar: 192 + 512 + maskable, GERÇEK 200 + PNG imzası
  const sizes = (m.icons ?? []).map((i) => i.sizes);
  expect(sizes).toContain("192x192");
  expect(sizes).toContain("512x512");
  expect((m.icons ?? []).some((i) => i.purpose === "maskable")).toBe(true);
  for (const icon of m.icons ?? []) {
    const r = await page.request.get(icon.src);
    expect(r.status(), `${icon.src} erişilebilir`).toBe(200);
    const buf = Buffer.from(await r.body());
    expect(buf.subarray(0, 8).equals(PNG_MAGIC), `${icon.src} PNG imzası`).toBe(true);
  }
  // kısayollar varsa scope-içi derin bağdır
  for (const s of m.shortcuts ?? []) {
    expect(s.url.startsWith(`/?portal=${SLUG}#p=`), `${s.name} scope-içi`).toBe(true);
  }
  // ekran görüntüleri varsa form_factor etiketlidir
  for (const s of m.screenshots ?? []) {
    expect(["narrow", "wide"]).toContain(s.form_factor);
  }
});

test("DENETİM — portal dinamik manifest bağlar + theme-color hex", async ({ page }) => {
  await guestLogin(page);
  const href = await page.getAttribute('link[rel="manifest"]', "href");
  expect(href).toBe(`/api/portal/manifest?slug=${SLUG}`);
  const theme = await page.getAttribute('meta[name="theme-color"]', "content");
  expect(theme).toMatch(/^#[0-9a-fA-F]{6}$/);
});

test("DENETİM — çevrimdışı şerit belirir/kaybolur + yeniden dene", async ({ page }) => {
  await guestLogin(page);
  // metin-tabanlı (toast'lar da role=status taşıyabilir — metin benzersizdir)
  await expect(page.getByText(/Çevrimdışısınız|You are offline/i)).toHaveCount(0);
  await page.context().setOffline(true);
  await expect(page.getByText(/Çevrimdışısınız|You are offline/i)).toBeVisible({ timeout: 5_000 });
  await expect(page.getByRole("button", { name: /Yeniden dene|Retry/i })).toBeVisible();
  await page.context().setOffline(false);
  await expect(page.getByText(/Çevrimdışısınız|You are offline/i)).toHaveCount(0);
});

test("DENETİM — çevrimdışı yenilemede boş sayfa yok (önbellek/yedek)", async ({ page }) => {
  test.setTimeout(90_000);
  await guestLogin(page);
  await page.reload({ waitUntil: "load", timeout: 30_000 }).catch(() => undefined);
  await page.waitForTimeout(1500);
  await page.context().setOffline(true);
  try {
    await page.reload({ waitUntil: "load", timeout: 30_000 }).catch(() => undefined);
    await page.waitForTimeout(1500);
    // tarayıcı dinozor sayfası DEĞİL: gövdede anlamlı içerik var
    const text = ((await page.locator("body").innerText().catch(() => "")) ?? "").trim();
    expect(text.length, "çevrimdışı gövde boş olmamalı").toBeGreaterThan(20);
  } finally {
    await page.context().setOffline(false);
  }
});

test("DENETİM — kompakt bar kaydırınca belirir, tepede gizlenir", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await guestLogin(page);
  const bar = page.getByTestId("portal-compact-bar");
  await expect(bar).toHaveAttribute("aria-hidden", "true");
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await expect(bar).toHaveAttribute("aria-hidden", "false", { timeout: 5_000 });
  await expect(bar.getByText(/No-Dig Turkey 2026/i)).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(bar).toHaveAttribute("aria-hidden", "true", { timeout: 5_000 });
});

test.describe("DENETİM — kurulum sheet (iOS yönergesi + erteleme)", () => {
  // webkit profili describe'da yasak (worker zorlar) — yalnız bağlam seçenekleri
  test.use({
    userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1",
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });

  test("sheet açılır → kapatma kalıcı erteler → yeniden yüklemede açılmaz", async ({ page }, info) => {
    test.skip(info.project.name !== "demo-auth-off", "singleton yazma: yalnız demo");
    test.setTimeout(120_000);
    await isolateClientIp(page);
    // kurulum: gecikme sıfır (belirleyici açılış)
    const eid = await editionIdOf(page);
    const setup = await page.request.put("/api/portal/config", { data: { editionId: eid, pwa: { installDelaySec: 0 } } });
    expect(setup.status()).toBe(200);
    try {
      await page.goto(`/?portal=${SLUG}`);
      await page.getByLabel(/Etkinlik Kodu|Event code/i).fill("DEMO26");
      await page.getByRole("button", { name: /Portala Gir|Enter portal/i }).click();
      const sheet = page.getByRole("dialog", { name: /Uygulamayı yükleyin|Install the app/i });
      await expect(sheet).toBeVisible({ timeout: 15_000 });
      // iOS 3-adım yönergesi
      await expect(sheet.getByText(/Paylaş düğmesine|Share button/i)).toBeVisible();
      await expect(sheet.getByText(/Ana Ekrana Ekle|Add to Home Screen/i).first()).toBeVisible();
      // kapat → erteleme yazılır → yeniden yüklemede sheet YOK
      await sheet.getByRole("button", { name: /Kapat|Close/i }).last().click();
      await expect(sheet).toHaveCount(0);
      const dismissed = await page.evaluate((s) => window.localStorage.getItem(`maven.pwa.dismiss.${s}`), SLUG);
      expect(Number(dismissed)).toBeGreaterThan(Date.now());
      await page.reload({ waitUntil: "load", timeout: 30_000 }).catch(() => undefined);
      await page.waitForTimeout(2500);
      await expect(page.getByRole("dialog", { name: /Uygulamayı yükleyin|Install the app/i })).toHaveCount(0);
    } finally {
      await page.request.put("/api/portal/config", { data: { editionId: eid, pwa: null } });
    }
  });
});
