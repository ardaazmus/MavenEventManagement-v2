// CRON-10 İSKELET — Modül: Duyurular (banner + Canlı Duyuru)
// CRON-E2E: tam akış — karşılama duyurusu gösterimi, kapatma kalıcılığı (localStorage),
// admin Canlı Duyuru gönderimi + WA/SMS dağıtım özeti çipleri
import { test, expect } from "@playwright/test";
import { guestLogin } from "./_helpers";

test("SMOKE — karşılama duyurusu banner'ı görünür + kapatılabilir", async ({ page }) => {
  await guestLogin(page);
  await expect(page.getByRole("button", { name: /Duyuruyu kapat|Dismiss/i })).toBeVisible();
});

test.fixme("FULL — duyuru kapat → ekran değişiminde geri gelmez + Canlı Duyuru dağıtımı", async () => {
  // TODO(CRON-E2E): admin Canlı Duyuru → channels özeti (WA sent/attempted + SMS).
});
