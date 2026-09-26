// CRON-E2E — Modül: Soru-Cevap (gönderim + moderasyon döngüsü)
// Tam akış: misafir soru gönderir → admin Portal Ayarları Q&A moderasyonda yanıtlar →
// portala "Organizatör yanıtı" düşer (status ANSWERED); gizle/yayına al döngüsü
import { test, expect } from "@playwright/test";
import { guestLogin, gotoScreen } from "./_helpers";

const QUESTION = `E2E moderasyon sorusu: kayıt masası nerede? (${Date.now()})`;
const ANSWER = "E2E yanıtı: ana salon girişinde, sağdaki bankoda.";

test("SMOKE — Q&A ekranı açılır + soru alanı", async ({ page }) => {
  await guestLogin(page);
  await gotoScreen(page, /Soru-Cevap|Q&A/i);
  await expect(page.getByText("Soru-Cevap", { exact: true }).first()).toBeVisible();
});

test("FULL — soru gönder → admin moderasyon → portal yanıtını görüntüler", async ({ page }) => {
  test.setTimeout(90_000);

  // 1) misafir soru gönderir
  await guestLogin(page);
  await gotoScreen(page, /Soru-Cevap|Q&A/i);
  await page.getByLabel(/Sorunuz|Your question/i).fill(QUESTION);
  await page.getByLabel(/Görünen adınız|Display name/i).fill("E2E Misafir");
  await page.getByRole("button", { name: /Soruyu Gönder|Submit question/i }).click();
  await expect(page.getByText(/Puan kazandın!|Sorunuz alındı/i).first()).toBeVisible({ timeout: 10_000 });

  // 2) sorularım listesinde PENDING (Yanıt bekliyor) rozeti
  const mine = page.getByText(QUESTION).first();
  await expect(mine).toBeVisible();
  await expect(page.getByText(/Yanıt bekliyor|Awaiting reply/i).first()).toBeVisible();

  // 3) admin: Dış Portal → Portal Ayarları → Q&A Moderasyon kartı
  await page.goto("/");
  // admin edisyonunu açıkça seç (varsayılan en-yakın etkinlik olabilir)
  const edSelect = page.getByRole("combobox", { name: /Edisyon seçici|Edition picker/i });
  await edSelect.click();
  await page.getByRole("option", { name: /No-Dig Turkey 2026/i }).click();
  await page.getByRole("navigation", { name: /Ana menü|Main menu/i }).getByRole("button", { name: /Dış Portal/i }).click();
  await page.getByRole("tab", { name: /Portal Ayarları/i }).click();
  const modCard = page.getByText(/Soru & Cevap Moderasyonu/i).first();
  await expect(modCard).toBeVisible({ timeout: 15_000 });

  // 4) soruyu bul (PENDING filtresi) → yanıtı yaz → Kaydet ("Moderasyon kaydedildi" toast)
  await page.getByRole("button", { name: /^Bekleyen|Pending/i }).first().click();
  const row = page.getByText(QUESTION).first();
  await expect(row).toBeVisible({ timeout: 15_000 });
  const answerBox = page.getByLabel(/Yanıtınızı yazın|Your reply/i).first();
  await answerBox.fill(ANSWER);
  // DİKKAT: "Yanıtla" matcher'ı "Yanıtlanan" filtre butonuyla çakışır — exact kullan
  await page.getByRole("button", { name: /^(Yanıtla|Reply)$/ }).first().click();
  await expect(page.getByText(/Moderasyon kaydedildi|Moderation saved/i).first()).toBeVisible({ timeout: 10_000 });

  // 5) admin kartında yanıt görünür (Yanıtlanan rozeti)
  await expect(page.getByText(/Yanıtlanan|Answered/i).first()).toBeVisible({ timeout: 10_000 });

  // 6) portala yansıma — misafirin sorusu ANSWERED + "Organizatör yanıtı" bloğu
  //    (aynı context: 1. adımdaki portal oturumu localStorage'da yaşıyor — otomatik devam)
  await page.goto("/?portal=no-dig-turkey-2026");
  await expect(page.getByRole("list", { name: /Modüller|Modules/i })).toBeVisible({ timeout: 20_000 });
  await gotoScreen(page, /Soru-Cevap|Q&A/i);
  await expect(page.getByText(QUESTION).first()).toBeVisible();
  await expect(page.getByText(/Yanıtlandı|Answered/i).first()).toBeVisible();
  await expect(page.getByText(/Organizatör yanıtı|Organizer reply/i).first()).toBeVisible();
  await expect(page.getByText(ANSWER)).toBeVisible();
});
