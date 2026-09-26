// CRON-E2E — Modül: PWA (manifest + SW + offline)
// Tam akış: manifest alanları → SW v3 kaydı → GERÇEK update akışı (sw.js byte-diff →
// "Yeni sürüm hazır" toast → Yenile → SKIP_WAITING → controllerchange → tek reload)
import { test, expect } from "@playwright/test";
import { readFileSync, writeFileSync } from "fs";
import { guestLogin } from "./_helpers";

test("SMOKE — manifest + sw.js servis edilir + offline.html 200", async ({ page }) => {
  const manifest = await page.request.get("/manifest.webmanifest");
  expect(manifest.status()).toBe(200);
  const sw = await page.request.get("/sw.js");
  expect(sw.status()).toBe(200);
  const text = await sw.text();
  expect(text).toContain("maven-portal-v3");
  const offline = await page.request.get("/offline.html");
  expect(offline.status()).toBe(200);
});

test("FULL — manifest alanları + install meta + SW update toast akışı", async ({ page }) => {
  test.setTimeout(120_000);

  // 1) manifest sözleşmesi — ad, ikonlar, standalone görüntü
  const manifest = (await (await page.request.get("/manifest.webmanifest")).json()) as {
    name?: string; short_name?: string; display?: string; icons?: { src: string; sizes: string }[];
  };
  expect(manifest.display).toBe("standalone");
  expect((manifest.icons ?? []).length).toBeGreaterThan(0);

  // 2) portala gir — guest girişi sonrası SW kaydolur, controller devreye girer
  await page.goto("/?portal=no-dig-turkey-2026");
  await guestLogin(page);
  await expect(page.getByRole("list", { name: /Modüller|Modules/i })).toBeVisible({ timeout: 20_000 });
  await expect
    .poll(async () => page.evaluate(() => navigator.serviceWorker?.controller?.scriptURL ?? null), { timeout: 15_000 })
    .toContain("sw.js");

  // 3) GERÇEK güncelleme akışı — sw.js'e byte-diff eklenir (test sonunda geri alınır)
  const swPath = "public/sw.js";
  const original = readFileSync(swPath, "utf8");
  const marker = "// cron-e2e-update-marker";
  try {
    if (!original.includes(marker)) writeFileSync(swPath, `${original}\n${marker}\n`, "utf8");
    // görünürlük değişimi sessiz reg.update() tetikler; doğrudan da çağrılabilir
    await page.evaluate(() => navigator.serviceWorker.getRegistration().then((r) => r?.update()));
    // "Yeni sürüm hazır" toast'u (duration: Infinity) + Yenile eylemi
    const toastTitle = page.getByText(/Yeni sürüm hazır|New version ready/i).first();
    await expect(toastTitle).toBeVisible({ timeout: 30_000 });
    const reloadBtn = page.getByRole("button", { name: /Yenile|Reload/i }).first();
    await expect(reloadBtn).toBeVisible();

    // 4) Yenile → SKIP_WAITING → controllerchange → tek seferlik reload → toast kaybolur
    await reloadBtn.click();
    await page.waitForLoadState("load");
    await expect
      .poll(async () => page.evaluate(async () => {
        const reg = await navigator.serviceWorker.getRegistration();
        return reg?.active?.scriptURL ?? null;
      }), { timeout: 20_000 })
      .toContain("sw.js");
    await expect(page.getByText(/Yeni sürüm hazır|New version ready/i)).toHaveCount(0);
  } finally {
    // 5) marker geri alınır — sonraki koşumlar için temiz sw.js
    if (!original.includes(marker)) writeFileSync(swPath, original, "utf8");
  }
});
