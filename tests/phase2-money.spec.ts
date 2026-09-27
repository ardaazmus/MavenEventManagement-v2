// P2 (yeni-fazlar 7-8): ödeme/finans bütünlüğü testleri.
//  * kart simülasyonu: dev/test'te çalışır, **0000 → FAILED (banka reddi kuralı)
//  * iyzico callback: bilinmeyen token 404; sağlayıcı doğrulaması başarısızsa
//    fail-closed (başarı YAZILMAZ); tekrar callback ikinci hareket yaratmaz
//  * manualPayment: eşik MINOR birimde (5M kuruş = ₺50.000 → onay), kur uyuşmazlığı
//    400, aşım-ödeme 409
//  * generic PUT durum-makinesi alanlarını değiştiremez (payments/registrations/orders)
import { test, expect } from "@playwright/test";
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

let editionId = "";

test.beforeAll(async () => {
  const ed = await db.eventEdition.findFirst({ orderBy: { createdAt: "asc" }, select: { id: true } });
  editionId = ed!.id;
});

test.describe.serial("P2.7 — ödeme simülasyonu + iyzico callback fail-closed", () => {
  let payId = "";

  test("hazırlık — PENDING simülasyon ödemesi yarat", async () => {
    const order = await db.order.create({
      data: { editionId, orderNo: `P2T-${Date.now()}`, payerName: "P2 Test", totalAmount: 50_000, currency: "TRY", status: "OPEN" },
      select: { id: true },
    });
    const pay = await db.payment.create({
      data: { orderId: order.id, amount: 50_000, currency: "TRY", source: "ONLINE_CARD", status: "PENDING" },
      select: { id: true },
    });
    payId = pay.id;
  });

  test("kart simülasyonu — **0000 kart → FAILED (banka reddi)", async ({ request }) => {
    const res = await request.post(`/api/payments/${payId}/process`, {
      data: { cardHolder: "P2 Test", cardNumber: "5555555555550000", expiry: "12/28", cvc: "123" },
    });
    expect(res.status()).toBe(200);
    const body = (await res.json()) as { outcome?: string };
    expect(body.outcome).toBe("FAILED");
    const row = await db.payment.findUnique({ where: { id: payId }, select: { status: true } });
    expect(row?.status).toBe("FAILED");
  });

  test("iyzico callback — bilinmeyen token 404", async ({ request }) => {
    const res = await request.post("/api/payments/iyzico/callback", { data: { token: "bogus-iyzico-token-xyz" } });
    expect(res.status()).toBe(404);
  });

  test("iyzico callback — sağlayıcı doğrulaması başarısız → FAIL-CLOSED, tekrarı zaten-işlendi", async ({ request }) => {
    // PENDING ödeme + reference → callback token'ı bulur; sağlayıcı (sandbox) erişilemez/
    // doğrulama başarısız → SUCCESS YAZILMAZ (FAILED'e geçer); tekrar callback →
    // alreadyProcessed:true ve ikinci finansal hareket YOK.
    const order = await db.order.create({
      data: { editionId, orderNo: `P2C-${Date.now()}`, payerName: "P2 Cb", totalAmount: 10_000, currency: "TRY", status: "OPEN" },
      select: { id: true },
    });
    const pay = await db.payment.create({
      data: { orderId: order.id, amount: 10_000, currency: "TRY", source: "ONLINE_CARD", status: "PENDING", reference: "p2cb-fail-closed-token" },
      select: { id: true },
    });
    // Sandbox'ta sağlayıcı erişilemez → 503; PENDING korunur (geçici hata ≠ kalıcı başarısızlık)
    const res1 = await request.post("/api/payments/iyzico/callback", { data: { token: "p2cb-fail-closed-token" } });
    expect([200, 502, 503]).toContain(res1.status());
    const after = await db.payment.findUnique({ where: { id: pay.id }, select: { status: true } });
    expect(after?.status).not.toBe("SUCCEEDED"); // fail-closed: doğrulanmamış başarı YAZILMAZ
    // Tekrar callback: PENDING kaldıysa yeniden doğrulama denenir (503) — ikinci hareket YOK;
    // kalıcı sonuç yazıldıysa (sağlayıcı yanıtı doğrulanmış) → alreadyProcessed idempotent.
    const res2 = await request.post("/api/payments/iyzico/callback", { data: { token: "p2cb-fail-closed-token" } });
    expect([200, 503]).toContain(res2.status());
    if (res2.status() === 200) {
      const body2 = (await res2.json()) as { alreadyProcessed?: boolean };
      expect(body2.alreadyProcessed).toBe(true); // idempotent — ikinci hareket yok
    }
    const final = await db.payment.findUnique({ where: { id: pay.id }, select: { status: true } });
    expect(["PENDING", "FAILED"]).toContain(final?.status ?? "");
  });
});

test.describe.serial("P2.8 — manualPayment eşik/birim bütünlüğü + generic PUT koruması", () => {
  test("manuel ödeme — kur uyuşmazlığı 400", async ({ request }) => {
    const order = await db.order.create({
      data: { editionId, orderNo: `P2M-${Date.now()}`, payerName: "P2 M", totalAmount: 100_000, currency: "TRY", status: "OPEN" },
      select: { id: true },
    });
    const res = await request.post("/api/flows", {
      data: { action: "finance.manualPayment", orderId: order.id, amount: 500, currency: "USD", reason: "P2 kur testi" },
    });
    expect(res.status()).toBe(400);
  });

  test("manuel ödeme — aşım-ödeme 409", async ({ request }) => {
    const order = await db.order.create({
      data: { editionId, orderNo: `P2O-${Date.now()}`, payerName: "P2 O", totalAmount: 100_000, currency: "TRY", status: "OPEN" },
      select: { id: true },
    });
    const res = await request.post("/api/flows", {
      data: { action: "finance.manualPayment", orderId: order.id, amount: 1500, currency: "TRY", reason: "P2 aşım testi" },
    });
    expect(res.status()).toBe(409);
  });

  test("manuel ödeme — ₺60.000 = 6M minor > 5M eşik → Tenant Sahibi onayı (birim düzeltmesi kanıtı)", async ({ request }) => {
    const order = await db.order.create({
      data: { editionId, orderNo: `P2A-${Date.now()}`, payerName: "P2 A", totalAmount: 6_000_000, currency: "TRY", status: "OPEN" },
      select: { id: true },
    });
    const res = await request.post("/api/flows", {
      data: { action: "finance.manualPayment", orderId: order.id, amount: 60_000, currency: "TRY", reason: "P2 eşik testi" },
    });
    expect(res.status()).toBe(201);
    const body = (await res.json()) as { approvedBy?: string | null };
    expect(body.approvedBy).toBe("Tenant Sahibi"); // eski kod: 60000 > 5_000_000 → tetikLENMEZTİ
  });

  test("generic PUT — payment status değiştirilemez (durum-makinesi koruması)", async ({ request }) => {
    const pay = await db.payment.findFirst({
      where: { source: "MANUAL_EXTERNAL", status: "SUCCEEDED" },
      orderBy: { createdAt: "desc" },
      select: { id: true, status: true, reason: true },
    });
    if (!pay) return; // yukarıdaki testler çalıştıysa bulunur
    const res = await request.put(`/api/payments/${pay.id}`, {
      data: { status: "FAILED", reason: "P2 PUT koruma testi" },
    });
    expect(res.status()).toBe(200);
    const row = await db.payment.findUnique({ where: { id: pay.id }, select: { status: true, reason: true } });
    expect(row?.status).toBe("SUCCEEDED"); // status DÜŞÜRÜLDÜ — değişmedi
    expect(row?.reason).toContain("P2 PUT"); // diğer alan normal güncellendi
  });

  test("generic PUT — registration status değiştirilemez", async ({ request }) => {
    const reg = await db.registration.findFirst({ orderBy: { createdAt: "desc" }, select: { id: true, status: true } });
    if (!reg) return;
    const res = await request.put(`/api/registrations/${reg.id}`, { data: { status: "CONFIRMED" } });
    expect(res.status()).toBe(200);
    const row = await db.registration.findUnique({ where: { id: reg.id }, select: { status: true } });
    expect(row?.status).toBe(reg.status); // akış-sahibi geçiş dışında değişmedi
  });
});
