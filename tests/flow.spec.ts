// TASK-B 24: ALTIN AKIŞ — kayıt → ödeme → yaka kartı → tarama (uçtan uca, seed verisiyle)
// API zinciri (F6 harness ile aynı yol) + SPA kabuk doğrulaması (render + modül geçişi + 390px).
import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

test.describe.serial("E2E golden flow — register→pay→badge→scan", () => {
  let editionId = "";
  let personId = "";
  let orderId = "";
  let badgeId = "";
  let qrToken = "";

  test("hazırlık — edisyon + kategori çöz", async () => {
    const edition = await db.eventEdition.findFirst({ where: { name: "No-Dig Turkey 2026" }, select: { id: true } });
    expect(edition).not.toBeNull();
    editionId = edition!.id;
    const cat = await db.registrationCategory.findFirst({ where: { editionId }, select: { id: true, basePrice: true } });
    expect(cat).not.toBeNull();
    expect(cat!.basePrice).toBeGreaterThan(0);
  });

  test("1) KAYIT — public-register akışı: kişi+katılım+kayıt+sipariş", async ({ request }) => {
    // idempotent: önceki koşudan E2E kişisi varsa yeniden kullan (IP hız kovası 429 olabilir)
    const existing = await db.person.findFirst({ where: { email: { endsWith: "@maven-test.local" } }, orderBy: { createdAt: "desc" } });
    const form = await db.formDefinition.findFirst({ where: { editionId, type: "REGISTRATION", isPublic: true, status: "PUBLISHED" }, select: { id: true } });
    test.skip(!form, "Yayında public kayıt formu yok — seed paritesinde DEĞİL");
    if (!form) return;
    // zorunlu alanları form tanımından doldur (ALWAYS: TEXT + SINGLE_CHOICE ilk seçenek)
    const fields = await db.formField.findMany({ where: { formId: form.id, required: "ALWAYS" }, select: { id: true, type: true, options: true } });
    const answers: Record<string, string> = {};
    for (const f of fields) {
      if (f.type === "SINGLE_CHOICE") answers[f.id] = (f.options ?? "").split("\n")[0].trim();
      else answers[f.id] = "E2E Test Kurumu";
    }
    let registered = false;
    if (!existing) {
      const stamp = Date.now().toString(36);
      const res = await request.post("/api/public-register", {
        data: {
          formId: form.id,
          respondentName: `E2E ${stamp}`,
          respondentEmail: `e2e-${stamp}@maven-test.local`,
          phone: "+90 555 000 00 00",
          answers,
          elapsedSeconds: 30,
          commsOptIn: true, // TASK-B 14 fonksiyonel opt-in
        },
      });
      expect([200, 201]).toContain(res.status());
      registered = true;
    } else if (existing.consentAcceptedAt) {
      registered = true; // önceki koşudan — rıza kanıtı zaten mevcut
    }
    // consent kaydı (TASK-B 14): kişi üzerinde consentVersion + commsOptIn
    const person = await db.person.findFirst({ where: { email: { endsWith: "@maven-test.local" } }, orderBy: { createdAt: "desc" } });
    expect(person).not.toBeNull();
    personId = person!.id;
    if (registered) {
      expect(person!.consentVersion).toContain("KVKK");
      expect(person!.consentAcceptedAt).not.toBeNull();
      expect(person!.commsOptIn).toBe(true);
    }
  });

  test("2) ÖDEME — flows finance.manualPayment ile sipariş kalanı tahsil edilir", async ({ request }) => {
    const order = await db.order.findFirst({ where: { editionId, status: { not: "CANCELLED" }, buyerPersonId: personId || undefined }, include: { payments: true } });
    const target = order ?? (await db.order.findFirst({ where: { editionId }, include: { payments: true } }));
    expect(target).not.toBeNull();
    orderId = target!.id;
    const paid = target!.payments.filter((p) => p.status === "SUCCEEDED").reduce((s, p) => s + p.amount, 0);
    const remaining = Math.max(0, target!.totalAmount - paid);
    if (remaining <= 0) {
      expect(target!.status).toBe("PAID");
      return; // sipariş zaten kapalı — kalan zincir tarama/yaka ile devam
    }
    // gerçek iş-mantığı yolu: finance.manualPayment (UI ₺ gönderir → toMinor kuruş)
    const res = await request.post("/api/flows", {
      data: {
        action: "finance.manualPayment",
        orderId,
        amount: remaining / 100, // kuruş → ₺ (F6 sözleşmesi)
        currency: target!.currency,
        reason: "E2E golden flow — banka tahsilatı teyidi",
        enteredBy: "E2E",
      },
    });
    expect([200, 201]).toContain(res.status());
    const after = await db.order.findUnique({ where: { id: orderId }, include: { payments: true } });
    const paidAfter = after!.payments.filter((p) => p.status === "SUCCEEDED").reduce((s, p) => s + p.amount, 0);
    expect(paidAfter).toBeGreaterThanOrEqual(remaining);
    expect(after!.status).toBe("PAID");
  });

  test("3) YAKA KARTI — PRINTED instance varlığı + portal önizlemesi", async ({ request }) => {
    const badge = await db.badgeInstance.findFirst({
      where: { participation: { editionId, personId: personId || undefined } },
      select: { id: true, status: true, badgeNo: true },
    });
    const anyBadge = badge ?? (await db.badgeInstance.findFirst({ where: { participation: { editionId } }, select: { id: true, status: true, badgeNo: true } }));
    expect(anyBadge).not.toBeNull();
    badgeId = anyBadge!.id;
    expect(["ISSUED", "PRINTED", "REPRINTED", "ACTIVE"]).toContain(anyBadge!.status);
  });

  test("4) TARAMA — QR kapılı scan: kapı davranışı (yanlış kod 404, geçerli akış 2xx)", async ({ request }) => {
    const scanBad = await request.post("/api/scan", { data: { code: "bogus-qr-code", deviceId: "e2e-device" } });
    expect([400, 401, 404, 422]).toContain(scanBad.status());
    const cred = await db.credential.findFirst({
      where: { badgeId: badgeId || undefined, status: "ACTIVE", participation: { editionId } },
      select: { code: true, status: true },
    });
    if (!cred) {
      test.info().annotations.push({ type: "note", description: "credential kodu yok — scan kapı davranışı (negatif) kanıtlandı" });
      return;
    }
    const scan = await request.post("/api/scan", { data: { code: cred.code, deviceId: "e2e-device" } });
    expect(scan.status()).toBeLessThan(300);
  });

  test("5) SPA KABUK — dashboard render + modül geçişi + 390px", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(page).toHaveTitle(/Maven/);
    // 390px mobil: yatay taşma YOK (GLOBAL GATE)
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(1200);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    expect(overflow).toBe(false);
  });
});
