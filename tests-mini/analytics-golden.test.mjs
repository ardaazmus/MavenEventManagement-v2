import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createIsolatedTestDb } from "../tests/support/test-db.mjs";

const aggLib = path.resolve("src/lib/analytics/aggregations.ts");

// P21 golden: sabit veri kumesi uzerinde formul sonuclari.
// Kapsar: UTC gun siniri (TR gece-yarisi), iade, no-show, iptal.

test("P21-golden - UTC gun dilimi + iade/no-show/iptal eslemesi", async () => {
  const { buildFunnel, utcDay } = await import(pathToFileURL(aggLib).href);

  // 2026-09-01T21:30:00Z = TR'de 02 Eylul 00:30 — katalog graini UTC oldugundan 09-01'e duser
  assert.strictEqual(utcDay(new Date("2026-09-01T21:30:00.000Z")), "2026-09-01");
  assert.strictEqual(utcDay(new Date("2026-09-01T00:15:00.000Z")), "2026-09-01");
  assert.strictEqual(utcDay(null), null);

  const rows = [
    // tam yol: gonderdi/onaylandi/odedi/girdi
    { participationId: "g1", categoryCode: "REG", submittedDay: "2026-09-01", submitted: true, confirmed: true, paid: true, checkedIn: true },
    // iade alan: odedi sayilir (PAID satir), giris yapti — net gelir ayri hesapta duser
    { participationId: "g2", categoryCode: "REG", submittedDay: "2026-09-01", submitted: true, confirmed: true, paid: true, checkedIn: true },
    // no-show: onayli + odemeli ama giris yok
    { participationId: "g3", categoryCode: "STU", submittedDay: "2026-09-02", submitted: true, confirmed: true, paid: true, checkedIn: false },
    // kayit iptali: gondermis sayilir (DRAFT degil), onay/odeme/giris yok
    { participationId: "g4", categoryCode: "REG", submittedDay: "2026-09-02", submitted: true, confirmed: false, paid: false, checkedIn: false },
    // taslak: hicbir asamada yok (sadece REGISTERED)
    { participationId: "g5", categoryCode: null, submittedDay: null, submitted: false, confirmed: false, paid: false, checkedIn: false },
    // ucretsiz davetli: odemesiz onay + giris (oran 1'i asabilir)
    { participationId: "g6", categoryCode: "VIP", submittedDay: "2026-09-02", submitted: true, confirmed: true, paid: false, checkedIn: true },
  ];
  const f = buildFunnel(rows);
  assert.deepStrictEqual(f.stages.map((s) => [s.key, s.count]), [
    ["REGISTERED", 6],
    ["SUBMITTED", 5],
    ["CONFIRMED", 4],
    ["PAID", 3],
    ["CHECKED_IN", 3],
  ]);
  assert.strictEqual(f.stages[2].rate, 0.8); // 4/5
  assert.strictEqual(f.stages[4].rate, 1); // 3/3 (ucretsiz giris dahil)
  assert.deepStrictEqual(f.byDay, [
    { day: "2026-09-01", submitted: 2, confirmed: 2, paid: 2, checkedIn: 2 },
    { day: "2026-09-02", submitted: 3, confirmed: 2, paid: 1, checkedIn: 1 },
  ]);
  const vip = f.byCategory.find((c) => c.code === "VIP");
  assert.deepStrictEqual(vip, { code: "VIP", total: 1, confirmed: 1, paid: 0, checkedIn: 1 });
});

test("P21-golden - net gelir: odeme - islenmis iade (DB)", async () => {
  const iso = await createIsolatedTestDb("p21-golden");
  try {
    const tag = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const tenant = await iso.prisma.tenant.create({ data: { name: "T", slug: `t-g-${tag}` } });
    const edition = await iso.prisma.eventEdition.create({ data: { tenantId: tenant.id, name: "E", slug: `e-g-${tag}` } });
    const order = await iso.prisma.order.create({ data: { editionId: edition.id, totalAmount: 100000, status: "PAID" } });
    await iso.prisma.payment.createMany({
      data: [
        { orderId: order.id, amount: 60000, status: "SUCCEEDED" },
        { orderId: order.id, amount: 40000, status: "SUCCEEDED" },
        { orderId: order.id, amount: 50000, status: "FAILED" }, // basarisiz sayilmaz
      ],
    });
    await iso.prisma.refund.createMany({
      data: [
        { orderId: order.id, amount: 30000, status: "PROCESSED" }, // netten duser
        { orderId: order.id, amount: 10000, status: "REQUESTED" }, // islenmemis dusmez
      ],
    });
    const paid = await iso.prisma.payment.aggregate({ where: { order: { editionId: edition.id }, status: "SUCCEEDED" }, _sum: { amount: true } });
    const refunded = await iso.prisma.refund.aggregate({ where: { order: { editionId: edition.id }, status: "PROCESSED" }, _sum: { amount: true } });
    assert.strictEqual(paid._sum.amount, 100000);
    assert.strictEqual(refunded._sum.amount, 30000);
    assert.strictEqual((paid._sum.amount ?? 0) - (refunded._sum.amount ?? 0), 70000);
  } finally {
    await iso.cleanup();
  }
});
