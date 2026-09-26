// CRON-E2E — Modül: Profil (GUEST/AUTH)
// Tam akış: guest CTA'ları → AUTH kimlik kartı (ad/şirket) + Bilet/Kayıt bölümü +
// AUTH rozeti + çıkış akışı (oturum temizlenir, guest CTA'ya dönüş)
import { test, expect } from "@playwright/test";
import { createHash, randomBytes } from "crypto";
import { PrismaClient } from "@prisma/client";
import { guestLogin, gotoScreen } from "./_helpers";

const db = new PrismaClient();
const SLUG = "no-dig-turkey-2026";

test("SMOKE — profil ekranı + giriş CTA (guest)", async ({ page }) => {
  await guestLogin(page);
  await gotoScreen(page, /Profil|Profile/i);
  await expect(page.getByRole("button", { name: /Giriş Yap|Sign in/i })).toBeVisible();
});

test("FULL — AUTH profil: kimlik kartı + bilet bölümü + çıkış → guest'e dönüş", async ({ page }) => {
  const edition = await db.eventEdition.findUnique({ where: { slug: SLUG }, select: { id: true, tenantId: true } });
  expect(edition).not.toBeNull();
  const suffix = Date.now();
  const person = await db.person.create({
    data: { tenantId: edition!.tenantId, firstName: "E2E", lastName: `Profil-${suffix}`, email: `e2e-profile-${suffix}@test.local`, company: "Profil A.Ş." },
    select: { id: true, firstName: true, lastName: true },
  });
  const raw = `pt_${randomBytes(16).toString("hex")}`;
  await db.portalToken.create({
    data: { tokenHash: createHash("sha256").update(raw).digest("hex"), scope: "PARTICIPANT", editionId: edition!.id, personId: person.id, issuedBy: "E2E", expiresAt: new Date(Date.now() + 3_600_000) },
  });

  try {
    // 1) magic-link girişi → profil ekranı
    await page.goto(`/?portal=${SLUG}&t=${raw}`);
    await expect(page.getByRole("list", { name: /Modüller|Modules/i })).toBeVisible({ timeout: 20_000 });
    await page.getByRole("navigation", { name: /Ana gezinme|Main navigation/i }).getByRole("button", { name: /Profil|Profile/i }).click();

    // 2) kimlik kartı — ad + şirket + AUTH rozeti (Kayıtlı Katılımcı)
    await expect(page.getByText(`${person.firstName} ${person.lastName}`)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/Profil A\.Ş\./)).toBeVisible();
    await expect(page.getByText(/Kayıtlı Katılımcı|Verified participant/i).first()).toBeVisible();

    // 3) Bilet / Kayıt bölümü — kayıt yoksa dostu boş durum görünür
    await expect(page.getByText(/Bilet \/ Kayıt|Tickets/i)).toBeVisible();
    await expect(page.getByText(/Kayıt bulunmuyor|No registration/i)).toBeVisible();

    // 4) çıkış — oturum temizlenir, portal GİRİŞ ekranına döner (bootstrap LOGIN fazı)
    await page.getByRole("button", { name: /Çıkış Yap|Sign out/i }).click();
    await expect(page.getByRole("button", { name: /Portala Gir|Enter portal/i })).toBeVisible({ timeout: 15_000 });
    // localStorage'daki oturum anahtarı temizlenmiş olmalı
    const stored = await page.evaluate(() => localStorage.getItem("maven.portal.no-dig-turkey-2026"));
    expect(stored).toBeNull();
  } finally {
    await db.person.delete({ where: { id: person.id } }).catch(() => undefined);
  }
});
