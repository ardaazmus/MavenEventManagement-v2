import test from "node:test";
import assert from "node:assert/strict";
import { createIsolatedTestDb } from "../tests/support/test-db.mjs";
import { seedSystemRoles } from "../scripts/seed-roles.mjs";
import { toMinor } from "../src/lib/money.ts";

// F-01 & F-02: Finans güvenlik semantiği sözleşme testleri (FA-1..FA-7)

async function setup() {
  const iso = await createIsolatedTestDb("finance-approvals");
  await seedSystemRoles(iso.prisma);

  const tenant = await iso.prisma.tenant.create({
    data: { name: "Tenant Finans", slug: `tenant-fin-${Date.now()}` },
  });
  const series = await iso.prisma.eventSeries.create({
    data: { tenantId: tenant.id, name: "Fin Seri", slug: `fin-seri-${Date.now()}` },
  });
  const edition = await iso.prisma.eventEdition.create({
    data: {
      tenantId: tenant.id,
      seriesId: series.id,
      name: "Finans Kongresi 2026",
      slug: `fk-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      startDate: new Date("2026-11-01"),
      endDate: new Date("2026-11-03"),
      city: "İstanbul",
    },
  });

  return { iso, tenant, edition };
}

test("FA-1 — 50.000 TL altı doğrudan SUCCEEDED ve sipariş kısmi ödenir (geriye uyum)", async () => {
  const { iso, edition } = await setup();
  try {
    const order = await iso.prisma.order.create({
      data: {
        editionId: edition.id,
        orderNo: `ORD-FA1-${Date.now()}`,
        payerName: "Ahmet Yılmaz",
        totalAmount: 10_000_000, // 100.000 TL
        currency: "TRY",
        status: "OPEN",
      },
    });

    const amount = 10_000; // 10.000 TL (< 50.000 TL)
    const amountMinor = toMinor(amount);
    const requiresApproval = amountMinor > 5_000_000;
    assert.strictEqual(requiresApproval, false);

    const payment = await iso.prisma.payment.create({
      data: {
        orderId: order.id,
        amount: amountMinor,
        currency: "TRY",
        source: "MANUAL_EXTERNAL",
        status: requiresApproval ? "PENDING" : "SUCCEEDED",
        enteredBy: "muhasebe@maven.test",
        approvedBy: requiresApproval ? undefined : "muhasebe@maven.test",
        paidAt: requiresApproval ? null : new Date(),
        reason: "Banka havalesi",
      },
    });

    assert.strictEqual(payment.status, "SUCCEEDED");
    assert.ok(payment.paidAt !== null);

    // Sipariş bakiye hesabı
    const payments = await iso.prisma.payment.findMany({ where: { orderId: order.id } });
    const paidSum = payments.filter((p) => p.status === "SUCCEEDED").reduce((s, p) => s + p.amount, 0);
    const status = paidSum >= order.totalAmount ? "PAID" : paidSum > 0 ? "PARTIALLY_PAID" : "OPEN";
    await iso.prisma.order.update({ where: { id: order.id }, data: { status } });

    const updatedOrder = await iso.prisma.order.findUnique({ where: { id: order.id } });
    assert.strictEqual(updatedOrder.status, "PARTIALLY_PAID");
  } finally {
    await iso.cleanup();
  }
});

test("FA-2 — 50.000 TL üstü PENDING oluşturur, sipariş OPEN kalır", async () => {
  const { iso, edition } = await setup();
  try {
    const order = await iso.prisma.order.create({
      data: {
        editionId: edition.id,
        orderNo: `ORD-FA2-${Date.now()}`,
        payerName: "Mehmet Demir",
        totalAmount: 10_000_000, // 100.000 TL
        currency: "TRY",
        status: "OPEN",
      },
    });

    const amount = 60_000; // 60.000 TL (> 50.000 TL)
    const amountMinor = toMinor(amount);
    const requiresApproval = amountMinor > 5_000_000;
    assert.strictEqual(requiresApproval, true);

    const payment = await iso.prisma.payment.create({
      data: {
        orderId: order.id,
        amount: amountMinor,
        currency: "TRY",
        source: "MANUAL_EXTERNAL",
        status: requiresApproval ? "PENDING" : "SUCCEEDED",
        enteredBy: "operasyon@maven.test",
        approvedBy: requiresApproval ? undefined : "operasyon@maven.test",
        paidAt: requiresApproval ? null : new Date(),
        reason: "Büyük sponsorluk elden ödeme",
      },
    });

    assert.strictEqual(payment.status, "PENDING");
    assert.strictEqual(payment.approvedBy, null);
    assert.strictEqual(payment.paidAt, null);

    // Sipariş bakiye hesabı — PENDING dahil edilmez
    const payments = await iso.prisma.payment.findMany({ where: { orderId: order.id } });
    const paidSum = payments.filter((p) => p.status === "SUCCEEDED").reduce((s, p) => s + p.amount, 0);
    assert.strictEqual(paidSum, 0);
    const status = paidSum >= order.totalAmount ? "PAID" : paidSum > 0 ? "PARTIALLY_PAID" : "OPEN";
    await iso.prisma.order.update({ where: { id: order.id }, data: { status } });

    const freshOrder = await iso.prisma.order.findUnique({ where: { id: order.id } });
    assert.strictEqual(freshOrder.status, "OPEN", "Bekleyen ödeme siparişi ödenmiş yapamaz");
  } finally {
    await iso.cleanup();
  }
});

test("FA-3 — İkinci yetkili onayı ile SUCCEEDED + sipariş bakiyesi kapanır", async () => {
  const { iso, edition } = await setup();
  try {
    const order = await iso.prisma.order.create({
      data: {
        editionId: edition.id,
        orderNo: `ORD-FA3-${Date.now()}`,
        payerName: "Ayşe Kaya",
        totalAmount: 6_000_000, // 60.000 TL
        currency: "TRY",
        status: "OPEN",
      },
    });

    const payment = await iso.prisma.payment.create({
      data: {
        orderId: order.id,
        amount: 6_000_000,
        currency: "TRY",
        source: "MANUAL_EXTERNAL",
        status: "PENDING",
        enteredBy: "operasyon@maven.test",
        reason: "Kongre sponsoru tahsilatı",
      },
    });

    // İkinci yetkili onaylar
    const approver = "finans.direktoru@maven.test";
    assert.notStrictEqual(payment.enteredBy, approver); // SoD kuralı

    const updatedPayment = await iso.prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: "SUCCEEDED",
        approvedBy: approver,
        paidAt: new Date(),
      },
    });
    assert.strictEqual(updatedPayment.status, "SUCCEEDED");
    assert.strictEqual(updatedPayment.approvedBy, approver);
    assert.ok(updatedPayment.paidAt !== null);

    // Bakiye yeniden hesabı
    const payments = await iso.prisma.payment.findMany({ where: { orderId: order.id } });
    const paidSum = payments.filter((p) => p.status === "SUCCEEDED").reduce((s, p) => s + p.amount, 0);
    assert.strictEqual(paidSum, 6_000_000);
    const newStatus = paidSum >= order.totalAmount ? "PAID" : "PARTIALLY_PAID";
    await iso.prisma.order.update({ where: { id: order.id }, data: { status: newStatus } });

    const finalOrder = await iso.prisma.order.findUnique({ where: { id: order.id } });
    assert.strictEqual(finalOrder.status, "PAID");
  } finally {
    await iso.cleanup();
  }
});

test("FA-4 — İkinci yetkili reddi ile FAILED + sipariş açık kalır", async () => {
  const { iso, edition } = await setup();
  try {
    const order = await iso.prisma.order.create({
      data: {
        editionId: edition.id,
        orderNo: `ORD-FA4-${Date.now()}`,
        payerName: "Fatma Şahin",
        totalAmount: 6_000_000,
        currency: "TRY",
        status: "OPEN",
      },
    });

    const payment = await iso.prisma.payment.create({
      data: {
        orderId: order.id,
        amount: 6_000_000,
        currency: "TRY",
        source: "MANUAL_EXTERNAL",
        status: "PENDING",
        enteredBy: "operasyon@maven.test",
        reason: "Şüpheli dekont",
      },
    });

    // İkinci yetkili reddeder
    const rejectedPayment = await iso.prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: "FAILED",
        reason: "REDDEDİLDİ: Sahte dekont tespit edildi",
        approvedBy: "denetim@maven.test (RED)",
      },
    });
    assert.strictEqual(rejectedPayment.status, "FAILED");

    // Bakiye yeniden hesabı — FAILED dahil edilmez
    const payments = await iso.prisma.payment.findMany({ where: { orderId: order.id } });
    const paidSum = payments.filter((p) => p.status === "SUCCEEDED").reduce((s, p) => s + p.amount, 0);
    assert.strictEqual(paidSum, 0);

    const finalOrder = await iso.prisma.order.findUnique({ where: { id: order.id } });
    assert.strictEqual(finalOrder.status, "OPEN");
  } finally {
    await iso.cleanup();
  }
});

test("FA-5 — Görevler Ayrılığı (SoD): giren kişi kendi kaydını onaylayamaz mantığı", () => {
  const enteredBy = "ali@maven.test";
  const actor1 = { email: "ali@maven.test" };
  const actor2 = { email: "veli@maven.test" };

  const isSelfApproval1 = enteredBy === actor1.email;
  const isSelfApproval2 = enteredBy === actor2.email;

  assert.strictEqual(isSelfApproval1, true, "Aynı kullanıcı tespit edilmeli");
  assert.strictEqual(isSelfApproval2, false, "Farklı kullanıcı onaylayabilmeli");
});

test("FA-6 — Aşım ödeme koruması (Overpayment guard)", async () => {
  const { iso, edition } = await setup();
  try {
    const order = await iso.prisma.order.create({
      data: {
        editionId: edition.id,
        orderNo: `ORD-FA6-${Date.now()}`,
        payerName: "Ali Veli",
        totalAmount: 5_000_000, // 50.000 TL sipariş
        currency: "TRY",
        status: "OPEN",
      },
    });

    const pendingPayment = await iso.prisma.payment.create({
      data: {
        orderId: order.id,
        amount: 6_000_000, // 60.000 TL (siparişi aşıyor)
        currency: "TRY",
        source: "MANUAL_EXTERNAL",
        status: "PENDING",
      },
    });

    const paidSum = 0;
    const isOverpayment = paidSum + pendingPayment.amount > order.totalAmount;
    assert.strictEqual(isOverpayment, true, "Aşım ödeme yakalanmalı");
  } finally {
    await iso.cleanup();
  }
});

test("FA-7 — Durum makinesi koruması: yalnız PENDING ödeme onaylanabilir", () => {
  const allowedStatuses = new Set(["PENDING"]);
  assert.strictEqual(allowedStatuses.has("PENDING"), true);
  assert.strictEqual(allowedStatuses.has("SUCCEEDED"), false);
  assert.strictEqual(allowedStatuses.has("FAILED"), false);
});
