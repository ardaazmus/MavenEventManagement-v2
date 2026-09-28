// P15 gate: hydration tutarlılığı + tercih kalıcılığı + system takibi + portal
// ayrımı + kritik sayfalarda axe smoke.
import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const THEME_COOKIE = "maven-theme";

async function htmlClass(page) {
  return page.evaluate(() => document.documentElement.className);
}

test("P15.1 - hydration uyuşmazlığı yok; çerez tercihi ilk boyamada uygulanır", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error" && /hydration|Hydration/i.test(msg.text())) errors.push(msg.text());
  });
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.context().addCookies([{ name: THEME_COOKIE, value: "dark", domain: "localhost", path: "/" }]);
  await page.goto("/");
  await expect.poll(() => htmlClass(page), { timeout: 15000 }).toContain("dark");
  expect(errors, `hydration hatası: ${errors.join(" | ")}`).toEqual([]);
});

test("P15.2 - API tercihi refresh sonrası korunur; system değişimi izlenir", async ({ page, context }) => {
  await page.goto("/");
  const set = await page.request.patch("/api/account/theme", { data: { theme: "dark" } });
  expect(set.ok()).toBeTruthy();
  await page.reload();
  await expect.poll(() => htmlClass(page), { timeout: 15000 }).toContain("dark");

  // System tercihine dön + OS koyu→açık değişimini gözle.
  await page.request.patch("/api/account/theme", { data: { theme: "system" } });
  await context.grantPermissions([]);
  await page.emulateMedia({ colorScheme: "dark" });
  await page.reload();
  await expect.poll(() => htmlClass(page), { timeout: 15000 }).toContain("dark");
  await page.emulateMedia({ colorScheme: "light" });
  await expect.poll(() => htmlClass(page), { timeout: 15000 }).not.toContain("dark");

  // Temizlik: çerezi kaldır.
  await context.clearCookies({ name: THEME_COOKIE });
});

test("P15.4 - portal yüzeyi açık temaya zorlanır; yönetici tercihi ezilmez", async ({ page }) => {
  await page.context().addCookies([{ name: THEME_COOKIE, value: "dark", domain: "localhost", path: "/" }]);
  await page.goto("/?portal=ornek-etkinlik");
  await expect.poll(() => htmlClass(page), { timeout: 15000 }).not.toContain("dark");
  await page.goto("/");
  await expect.poll(() => htmlClass(page), { timeout: 15000 }).toContain("dark");
});

test("P15 gate - kritik yüzeylerde axe smoke (ciddi ihlal yok)", async ({ page }) => {
  for (const url of ["/", "/?portal=ornek-etkinlik"]) {
    await page.goto(url);
    await page.waitForLoadState("networkidle").catch(() => {});
    const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
    const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(serious, `${url} axe: ${serious.map((v) => `${v.id}(${v.nodes.length})`).join(", ")}`).toEqual([]);
  }
});
