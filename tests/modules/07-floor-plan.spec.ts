// CRON-E2E — Modül: Mekan & Kroki (Venue Map)
// Tam akış: mekân kartı + kroki görseli (admin venueMapEnabled/url yapılandırması),
// Floor Studio sync API'si ile booth yerleşimi portal-kaynağından güncellenir
import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { guestLogin, gotoScreen } from "./_helpers";

const db = new PrismaClient();

test("SMOKE — Yer Planı ekranı açılır", async ({ page }) => {
  await guestLogin(page);
  await gotoScreen(page, /Yer Planı|Map/i);
  await expect(page.getByRole("heading", { name: /Mekan|Venue|Kroki/i }).first()).toBeVisible().catch(async () => {
    await expect(page.getByText(/kroki|plan/i).first()).toBeVisible();
  });
});

test("FULL — kroki görseli yapılandırmayla görünür + Floor Studio sync güncellemesi", async ({ page, request }) => {
  const edition = await db.eventEdition.findUnique({ where: { slug: "no-dig-turkey-2026" }, select: { id: true } });
  expect(edition).not.toBeNull();

  await guestLogin(page);
  await gotoScreen(page, /Yer Planı|Map/i);

  // 1) demo kroki: venueMapEnabled=true + url → görseli render edilir (alt metin sözleşmesi)
  const cfg = await db.eventPortalConfig.findUnique({ where: { editionId: edition!.id }, select: { venueMapEnabled: true, venueMapUrl: true } });
  const img = page.getByRole("img", { name: /Kroki|map/i }).first();
  if (cfg?.venueMapEnabled && cfg.venueMapUrl) {
    await expect(img).toBeVisible();
    const src = await img.getAttribute("src");
    expect(src).toBe(cfg.venueMapUrl);
  } else {
    await expect(page.getByText(/Kroki henüz eklenmedi|not been added/i)).toBeVisible();
  }

  // 2) Floor Studio sync — portal-kaynaklı booth yerleşimi kayıtlı geometriyi günceller
  const booth = await db.boothUnit.findFirst({ where: { editionId: edition!.id }, select: { id: true, code: true } });
  test.skip(!booth, "seed tabanında booth yok");
  const sync = await request.post("/api/floor-studio/sync", {
    data: {
      editionId: edition!.id,
      source: "maven",
      changes: [{ boothUnitId: booth!.id, x: 4, y: 6, width: 4, height: 3, label: `${booth!.code} — E2E` }],
    },
  });
  expect(sync.status()).toBe(200);
  const syncBody = (await sync.json()) as { geometryUpdated: number; syncedAt: string };
  expect(syncBody.geometryUpdated).toBeGreaterThanOrEqual(1);
  expect(syncBody.syncedAt).toBeTruthy();

  // 3) iz — floorPlanObject gerçekten yazıldı (label ile birlikte)
  const fo = await db.floorPlanObject.findFirst({ where: { boothUnitId: booth!.id }, select: { label: true, x: true, y: true } });
  expect(fo).not.toBeNull();
  expect(fo!.x).toBe(4);
  expect(fo!.y).toBe(6);
  expect(fo!.label).toContain("E2E");
});
