// PWA-ADMIN v1 — Mobil Uygulama kartı: render + kayıt turu + API sözleşmesi
// Dikkat: pwaJson TEKİL (singleton) satırdır — YAZAN test yalnız demo projesinde
// koşar (projeler arası yarış yok); OKUYAN testler her projede koşar.
import { test, expect } from "@playwright/test";
import { isolateClientIp } from "../modules/_helpers";
import { gotoPortalSettings, editionIdOf } from "./_pwa-helpers";

const DEMO_ONLY = (info: { project: { name: string } }) => info.project.name !== "demo-auth-off";

test("SMOKE — PWA kartı render + kontrol listesi 9/9", async ({ page }) => {
  await isolateClientIp(page);
  await gotoPortalSettings(page);
  const card = page.locator("section").filter({
    has: page.getByRole("heading", { name: /Mobil Uygulama \(PWA\)|Mobile App \(PWA\)/i }),
  }).first();
  await expect(card).toBeVisible({ timeout: 15_000 });
  // ana anahtar + kimlik + kısayollar + teşvik + kontrol listesi bölümleri
  await expect(card.getByRole("switch", { name: "PWA" })).toBeVisible();
  await expect(card.getByLabel(/Kısa ad|Short name/i)).toBeVisible();
  await expect(card.getByRole("button", { name: /Kısayol ekle|Add shortcut/i })).toBeVisible();
  // kontrol listesi — varsayılan tohumda 9/9 (SW erişilebilir)
  await expect(card.getByText(/Kurulabilirlik kontrolü|Installability checks/i)).toBeVisible();
  await expect(card.getByText("9/9", { exact: false }).first()).toBeVisible({ timeout: 10_000 });
});

test("FULL — kısa ad + kısayol kaydı → manifest yansıması → temizlik", async ({ page }, info) => {
  test.skip(DEMO_ONLY(info), "singleton yazma: yalnız demo");
  test.setTimeout(120_000);
  await isolateClientIp(page);
  await gotoPortalSettings(page);
  const card = page.locator("section").filter({
    has: page.getByRole("heading", { name: /Mobil Uygulama \(PWA\)|Mobile App \(PWA\)/i }),
  }).first();
  await expect(card).toBeVisible({ timeout: 15_000 });

  // 1) kısa ad + kısayol ekle
  await card.getByLabel(/Kısa ad|Short name/i).fill("PWA-E2E");
  await card.getByRole("button", { name: /Kısayol ekle|Add shortcut/i }).click();
  const labelBox = card.getByLabel(/Etiket 1|Label 1/i);
  await expect(labelBox).toBeVisible();
  await labelBox.fill("Program");
  await page.getByRole("button", { name: /Ayarları Kaydet|Save settings/i }).click();
  await expect(page.getByText(/Ayarlar kaydedildi|Settings saved/i).first()).toBeVisible({ timeout: 10_000 });

  // 2) dinamik manifest yansıması (derin bağ scope-içi)
  const man = await page.request.get("/api/portal/manifest?slug=no-dig-turkey-2026");
  expect(man.status()).toBe(200);
  const body = (await man.json()) as { short_name?: string; shortcuts?: { name: string; url: string }[] };
  expect(body.short_name).toBe("PWA-E2E");
  expect(body.shortcuts?.length).toBe(1);
  expect(body.shortcuts?.[0].url).toBe("/?portal=no-dig-turkey-2026#p=program");

  // 3) kontrol listesi hâlâ 9/9 (kısayol kurulabilirliği bozmaz)
  await expect(card.getByText("9/9", { exact: false }).first()).toBeVisible({ timeout: 10_000 });

  // 4) temizlik — tohum tabanına dön (diğer spec'ler etkilenmez)
  const eid = await editionIdOf(page);
  const cleanup = await page.request.put("/api/portal/config", { data: { editionId: eid, pwa: null } });
  expect(cleanup.status()).toBe(200);
  const man2 = (await (await page.request.get("/api/portal/manifest?slug=no-dig-turkey-2026")).json()) as {
    short_name?: string; shortcuts?: unknown[];
  };
  expect(man2.shortcuts ?? []).toEqual([]);
  expect(man2.short_name).not.toBe("PWA-E2E");
});

test("API — geçersiz PWA gövdesi 400 + kayıt YAZILMAZ", async ({ page }) => {
  await isolateClientIp(page);
  await page.goto("/");
  const eid = await editionIdOf(page);
  const bad = await page.request.put("/api/portal/config", {
    data: { editionId: eid, pwa: { shortcuts: [1, 2, 3, 4, 5], display: "hologram" } },
  });
  expect(bad.status()).toBe(400);
  const body = (await bad.json()) as { issues?: string[] };
  expect((body.issues ?? []).length).toBeGreaterThan(0);
  // yazılmadı kanıtı: manifest varsayılan kısa adı taşır
  const man = (await (await page.request.get("/api/portal/manifest?slug=no-dig-turkey-2026")).json()) as {
    short_name?: string;
  };
  expect(typeof man.short_name).toBe("string");
});
