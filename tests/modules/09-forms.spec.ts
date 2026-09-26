// CRON-E2E — Modül: Formlar & Quizler (görev-duyarlı gruplama + portal-içi form motoru)
// Tam akış: anket açılır (lazy chunk) → alanlar doldurulur (seçim/yıldız/NPS/quiz/metin)
// → gönderim → sonuç ekranı (successMessage) → TAMAMLANDI grubuna düşer + puan toast'u
import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { guestLogin, gotoScreen } from "./_helpers";

const db = new PrismaClient();
const SURVEY = "Kongre Memnuniyet Anketi";

test("SMOKE — formlar ekranı + açık form sayısı", async ({ page }) => {
  await guestLogin(page);
  await gotoScreen(page, /Formlar & Quizler|Forms & Quizzes/i);
  await expect(page.getByText("Formlar & Quizler", { exact: true }).first()).toBeVisible();
});

test("FULL — anket doldur → gönder → TAMAMLANDI grubu + puan bildirimi", async ({ page }) => {
  const edition = await db.eventEdition.findUnique({ where: { slug: "no-dig-turkey-2026" }, select: { id: true } });
  const survey = await db.formDefinition.findFirst({ where: { editionId: edition!.id, name: SURVEY, isPublic: true, status: "PUBLISHED" }, select: { id: true } });
  test.skip(!survey, "seed tabanında public anket yok");

  await guestLogin(page);
  await gotoScreen(page, /Formlar & Quizler|Forms & Quizzes/i);

  // 1) görev-duyarlı gruplar: anket Devam eden grubunda (puan görevi açıkken)
  const surveyCard = page.getByRole("listitem").filter({ hasText: SURVEY }).first();
  await expect(surveyCard).toBeVisible();
  await expect(page.getByText(/Devam eden|Ongoing/i).first()).toBeVisible();

  // 2) form kartına tıkla → portal-içi form motoru (lazy chunk) render olur
  await surveyCard.click();
  await expect(page.locator("input[autocomplete='email']")).toBeVisible({ timeout: 20_000 });

  // 3) ziyaretçi kimliği + alanlar — label'lar htmlFor'suz: autocomplete niteliğiyle hedeflenir
  await page.locator("input[autocomplete='name']").fill("E2E Anketçi");
  await page.locator("input[autocomplete='email']").fill(`e2e-anket-${Date.now()}@test.local`);
  await page.getByRole("radio", { name: "E-posta" }).check();
  await page.getByRole("button", { name: /5 yıldız|5 star/i }).click();
  await page.getByRole("button", { name: "10", exact: true }).click();
  await page.getByRole("radio", { name: /Kazısız altyapı/i }).check();
  // LONGTEXT — label htmlFor'suz olduğundan textarea rolüyle hedeflenir
  await page.locator("textarea").last().fill("E2E otomatik test geri bildirimi — tüm modüller çalışıyor.");

  // 4) HMAC doğrulama sorusu (captcha) — ekrandan okunur ve hesaplanır
  const challengeText = await page.locator("span[aria-live='polite']").first().innerText();
  const m = challengeText.match(/(\d+)\s*([+−-])\s*(\d+)/);
  expect(m).not.toBeNull();
  const answer = m![2] === "+" ? Number(m![1]) + Number(m![3]) : Number(m![1]) - Number(m![3]);
  await page.getByLabel(/Doğrulama|Verification/i).fill(String(answer));

  // 5) minSubmitSeconds=3 SPAM kuralı — yeterli süre bekle, sonra gönder
  await page.waitForTimeout(4_000);
  await page.getByRole("button", { name: /Yanıtı Gönder|Submit response/i }).click();

  // 5) sonuç ekranı — seed successMessage deterministik görünür
  await expect(page.getByText(/Görüşünüz için teşekkürler!/i)).toBeVisible({ timeout: 15_000 });

  // 6) puan bildirimi — oyunlaştırma açıkken FORM_SUBMIT +20 puan toast'u
  await expect(page.getByText(/Puan kazandın!|You earned points!/i).first()).toBeVisible({ timeout: 15_000 });

  // 7) formlar ekranına dönüş — anket TAMAMLANDI grubuna düşer
  await page.getByRole("button", { name: /Geri|Back/i }).first().click();
  await expect(page.getByText(/Tamamlandı|Completed/i).first()).toBeVisible({ timeout: 10_000 });
  await expect(page.getByRole("listitem").filter({ hasText: SURVEY })).toBeVisible();
});
