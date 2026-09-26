// CRON-E2E — Modül: Kimlik & Giriş (AUTH/GUEST/PortalToken)
// Tam akış: PortalToken üretimi → /?t=<raw> AUTH girişi → oturum kalıcılığı → çıkış
import { test, expect } from "@playwright/test";
import { createHash, randomBytes } from "crypto";
import { PrismaClient } from "@prisma/client";
import { guestLogin } from "./_helpers";

const db = new PrismaClient();
const SLUG = "no-dig-turkey-2026";

test("SMOKE — portal giriş ekranı render + health", async ({ page }) => {
  await page.goto("/?portal=no-dig-turkey-2026");
  await expect(page.getByRole("heading", { name: /No-Dig Turkey 2026/ })).toBeVisible();
  const health = await page.request.get("/api/health");
  expect(health.status()).toBe(200);
});

test("FULL — PortalToken AUTH girişi → kimlik + oturum kalıcılığı → çıkış", async ({ page }) => {
  // 1) PortalToken üret (sha256(pt_<32hex>)) — seed person + demo edisyon
  const edition = await db.eventEdition.findUnique({ where: { slug: SLUG }, select: { id: true, tenantId: true } });
  expect(edition).not.toBeNull();
  const person = await db.person.create({
    data: {
      tenantId: edition!.tenantId,
      firstName: "E2E",
      lastName: "Tokenlı",
      email: `e2e-token-${Date.now()}@test.local`,
      company: "E2E A.Ş.",
    },
    select: { id: true, firstName: true, lastName: true },
  });
  const raw = `pt_${randomBytes(16).toString("hex")}`;
  const tokenHash = createHash("sha256").update(raw).digest("hex");
  const token = await db.portalToken.create({
    data: {
      tokenHash,
      scope: "PARTICIPANT",
      editionId: edition!.id,
      personId: person.id,
      issuedBy: "E2E",
      expiresAt: new Date(Date.now() + 86_400_000),
    },
    select: { id: true },
  });

  try {
    // 2) magic-link ile giriş — AUTH oturumu açılır
    await page.goto(`/?portal=${SLUG}&t=${raw}`);
    const nav = page.getByRole("navigation", { name: /Ana gezinme|Main navigation/i });
    await expect(nav).toBeVisible({ timeout: 20_000 });
    await expect(page.getByRole("list", { name: /Modüller|Modules/i })).toBeVisible({ timeout: 20_000 });

    // 3) profil kimlik kartı person adını gösterir (AUTH oturumu kanıtı)
    await nav.getByRole("button", { name: /Profil|Profile/i }).click();
    await expect(page.getByText("E2E Tokenlı")).toBeVisible({ timeout: 10_000 });

    // 4) oturum kalıcılığı — yenileme sonrası hâlâ AUTH (login ekranına düşmez)
    await page.reload();
    await expect(page.getByRole("list", { name: /Modüller|Modules/i })).toBeVisible({ timeout: 20_000 });
    await page.getByRole("navigation", { name: /Ana gezinme|Main navigation/i }).getByRole("button", { name: /Profil|Profile/i }).click();
    await expect(page.getByText("E2E Tokenlı")).toBeVisible({ timeout: 10_000 });

    // 5) çıkış — oturum temizlenir, portal GİRİŞ ekranına döner (bootstrap: session yok → LOGIN)
    await page.getByRole("button", { name: /Çıkış Yap|Sign out/i }).click();
    await expect(page.getByRole("button", { name: /Portala Gir|Enter portal/i })).toBeVisible({ timeout: 15_000 });
    const stored = await page.evaluate(() => localStorage.getItem("maven.portal.no-dig-turkey-2026"));
    expect(stored).toBeNull();
  } finally {
    // 6) geçersiz/süresi-dolmuş belirteç reddedilir (410/404) — tekrar kullanım kapanır
    await db.portalToken.delete({ where: { id: token.id } }).catch(() => undefined);
    const resp = await page.request.post("/api/portal/access", {
      data: { editionSlug: SLUG, mode: "TOKEN", token: raw },
    });
    expect([404, 410]).toContain(resp.status());
    await db.person.delete({ where: { id: person.id } }).catch(() => undefined);
  }
});

test("FULL — GUEST kod girişi → yanlış kod reddedilir → doğru kod ACCEPTED", async ({ page }) => {
  await page.goto("/?portal=no-dig-turkey-2026");
  await page.getByRole("tab", { name: /Etkinlik Kodu|Event code/i }).click();

  // yanlış kod → hata, portal açılmaz
  const input = page.getByLabel(/Etkinlik Kodu|Event code/i);
  const enterBtn = page.getByRole("button", { name: /Portala Gir|Enter portal/i });
  for (let attempt = 0; attempt < 4; attempt++) {
    await input.fill("YANLIS-KOD");
    if (await enterBtn.isEnabled()) break;
    await page.waitForTimeout(400);
  }
  const badResp = page.waitForResponse(
    (r) => r.url().includes("/api/portal/access") && r.request().method() === "POST",
    { timeout: 12_000 },
  ).catch(() => null);
  await enterBtn.click();
  const resp = await badResp;
  if (resp) expect(resp.status()).toBeGreaterThanOrEqual(400);
  await expect(page.getByRole("navigation", { name: /Ana gezinme|Main navigation/i })).toHaveCount(0);

  // doğru kod → portal açılır (guestLogin helper'ı hydration yarışına dayanıklıdır)
  await guestLogin(page);
  await expect(page.getByText(/Sıradaki oturum|Next session/i)).toBeVisible();
});
