// CRON-10: modül spec iskeletleri ortak yardımcıları
// CRON-E2E turu bu iskeletleri tam-akış testlerine dönüştürecek.
import { Page, expect } from "@playwright/test";

// GUEST (etkinlik-kodu) girişi — deterministik demo: DEMO26
// Not 1: giriş alanının erişilebilir adı Label'dan gelir (placeholder değil).
// Not 2: hydration yarışı — React bağlanmadan fill edilen değer state'e düşmez; buton
//        etkinleşene dek yeniden doldurulur.
// Not 3: /api/portal/access 20 istek/dk/IP rate-limit'lidir (üretim koruması).
// QA: tarayıcı x-forwarded-for göndermez → TÜM UI testleri "local" kotasında
// çarpışırdı (tam-suite'te sahte 429). Her sayfaya benzersiz istemci IP'si verilir
// (üretim gerçeği: her kullanıcı kendi IP'si; API spec'lerindeki virtualClientHeaders
// konvansiyonunun UI karşılığı). Güvenlik davranışı değişmez — limitler aynen durur.
export async function isolateClientIp(page: Page) {
  const ip = `10.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.ceil(Math.random() * 254)}`;
  await page.setExtraHTTPHeaders({ "x-forwarded-for": ip });
}
export async function guestLogin(page: Page): Promise<void> {
  await isolateClientIp(page);
  await page.goto("/?portal=no-dig-turkey-2026");
  // sekme zaten seçili olabilir — optional tıklama KISA timeout'lu olmalı, yoksa EN
  // modunda "Etkinlik Kodu" bulunamaz ve tıklama test-timeout'unu tüketir (E2E dersi)
  await page.getByRole("tab", { name: /Etkinlik Kodu|Event code/i }).click({ timeout: 2_500 }).catch(() => undefined);
  const input = page.getByLabel(/Etkinlik Kodu|Event code/i);
  const enterBtn = page.getByRole("button", { name: /Portala Gir|Enter portal/i });
  const nav = page.getByRole("navigation", { name: /Ana gezinme|Main navigation/i });
  // /api/portal/access 20 istek/dk/IP rate-limit'lidir (üretim koruması) — tam-suite
  // koşumunda pencere taşarsa 429 alınır: uzun bekleme + tek yeniden deneme.
  for (let attempt = 0; attempt < 3; attempt++) {
    await input.fill("DEMO26", { timeout: 8_000 });
    if (!(await enterBtn.isEnabled())) {
      await page.waitForTimeout(500);
      continue;
    }
    const loginResp = page
      .waitForResponse(
        (r) => r.url().includes("/api/portal/access") && r.request().method() === "POST",
        { timeout: 12_000 },
      )
      .catch(() => null);
    await enterBtn.click();
    const resp = await loginResp;
    const navOk = await expect(nav)
      .toBeVisible({ timeout: 8_000 })
      .then(() => true)
      .catch(() => false);
    if (navOk) break; // başarılı — döngüde kalma (yeniden fill tuzak düşürür)
    if (resp && resp.status() === 429) await page.waitForTimeout(15_000);
  }
  await expect(nav).toBeVisible({ timeout: 15_000 });
  // içerik bootstrap'ının (widget grid + duyuru) render'ını garantiye al — tıklama kararlılığı
  await expect(page.getByRole("list", { name: /Modüller|Modules/i })).toBeVisible({ timeout: 20_000 });
}

export async function removeDevtoolsOverlay(page: Page): Promise<void> {
  await page.evaluate(() => (document.querySelector("nextjs-portal") as HTMLElement | null)?.remove()).catch(() => undefined);
}

// Ekran aç: (0) anasayfa widget grid'i görünmüyorsa önce Anasayfa'ya dön,
// (1) sabit alt menüde ara, (2) anasayfa widget'larında ara
// (Formlar/QA/Oyun nav-dışı widget'lardır — CRON-10 ders notu).
export async function gotoScreen(page: Page, label: RegExp): Promise<void> {
  await removeDevtoolsOverlay(page);
  const nav = page.getByRole("navigation", { name: /Ana gezinme|Main navigation/i });
  const grid = page.getByRole("list", { name: /Modüller|Modules/i });
  if (!(await grid.isVisible().catch(() => false))) {
    await nav.getByRole("button", { name: /Anasayfa|Home/i }).click();
    await expect(grid).toBeVisible({ timeout: 10_000 });
  }
  const navBtn = nav.getByRole("button", { name: label });
  if (await navBtn.count()) {
    await navBtn.first().click();
    return;
  }
  const anyBtn = page.getByRole("button", { name: label });
  if (await anyBtn.count()) {
    await anyBtn.first().click();
    return;
  }
  await page.getByRole("listitem").filter({ hasText: label }).first().click();
}
