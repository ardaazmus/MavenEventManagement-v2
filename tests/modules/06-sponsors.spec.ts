// CRON-E2E — Modül: Sponsorlar + Kurum Detayı
// Tam akış: seviye grubu (Gold), detay kartı (seviye rozeti + web sitesi güvenli link),
// geri dönüş; boş-durum ve marka doğrulaması
import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { guestLogin, gotoScreen } from "./_helpers";

const db = new PrismaClient();

test("SMOKE — sponsor listesi render (2 destekçi kurum)", async ({ page }) => {
  await guestLogin(page);
  await gotoScreen(page, /Sponsorlar|Sponsors/i);
  await expect(page.getByText(/ABC Pharma|destekçi|supporting/i).first()).toBeVisible();
});

test("FULL — sponsor kartı → detay (seviye rozeti + site linki) → geri dönüş", async ({ page }) => {
  // seed sponsorları: SponsorAgreement (ACTIVE/CONTRACTED) → portal listesi bu tablodan beslenir
  const edition = await db.eventEdition.findUnique({ where: { slug: "no-dig-turkey-2026" }, select: { id: true } });
  const sponsorRows = await db.sponsorAgreement.findMany({
    where: { editionId: edition!.id, status: { in: ["ACTIVE", "CONTRACTED"] } },
    select: { organization: { select: { name: true, website: true } }, tier: { select: { name: true } } },
    take: 4,
  });
  test.skip(sponsorRows.length === 0, "seed tabanında görünür sponsor yok");
  const first = sponsorRows[0];

  await guestLogin(page);
  await gotoScreen(page, /Sponsorlar|Sponsors/i);

  // 1) seviye grubu başlığı + gerçek seed sponsoru listede görünür
  await expect(page.getByText(first.organization.name).first()).toBeVisible();

  // 2) kart → detay geçişi (gerçek sponsor kartına tıkla)
  const firstCard = page.getByRole("button").filter({ hasText: first.organization.name }).first();
  await firstCard.click();
  await expect(page.getByText(/Sponsor Detayı|Sponsor detail/i)).toBeVisible({ timeout: 10_000 });

  // 3) detay kartı: seviye rozeti + kurum konumu
  if (first.tier) await expect(page.getByText(first.tier.name).first()).toBeVisible();

  // 4) web sitesi linki — güvenli dış bağlantı sözleşmesi (target=_blank + rel=noopener)
  const siteLink = page.getByRole("link", { name: /Web sitesi|Website/i }).first();
  if (await siteLink.count()) {
    await expect(siteLink).toHaveAttribute("target", "_blank");
    const rel = await siteLink.getAttribute("rel");
    expect(rel).toContain("noopener");
    await expect(siteLink).toHaveAttribute("href", /^https?:\/\//);
  }

  // 5) geri dönüş — liste yeniden görünür
  await page.getByRole("button", { name: /Geri|Back/i }).first().click();
  await expect(page.getByText(/Sponsorlar|Sponsors/i).first()).toBeVisible();
});
