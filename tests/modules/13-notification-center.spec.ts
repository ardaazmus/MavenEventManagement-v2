// CRON-10 İSKELET — Modül: Bildirim Merkezi (çan + sheet)
// CRON-E2E: tam akış — okunmadı rozeti, DUYURULAR geçmişi, YAKLAŞAN HATIRLATICILAR,
// kapanışta okundu işaretleme (maven.portal.notifread)
import { test, expect } from "@playwright/test";
import { guestLogin, removeDevtoolsOverlay } from "./_helpers";

test("SMOKE — üst bantta çan butonu (aria-label)", async ({ page }) => {
  await guestLogin(page);
  await removeDevtoolsOverlay(page);
  await expect(page.getByRole("button", { name: /Bildirim merkezini aç|notification/i })).toBeVisible();
});

test.fixme("FULL — çan → sheet aç → duyuru geçmişi → kapat → rozet temizlenir", async () => {
  // TODO(CRON-E2E): rozet sayısı → sheet DUYURULAR listesi → kapanışta localStorage yazımı.
});
