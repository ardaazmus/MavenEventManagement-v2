// Mutabakat raporu (§7 RECONCILIATION aşaması) — finansal kapanış öncesi denetim
// GET /api/reconciliation?editionId=
// Denetler: sipariş tutar/kalem ve durum/ödeme tutarlılığı, doğrulanmamış tahsilatlar (§38),
// gider fiş/onay durumu, açık alacak yaşlandırması (0-30/31-60/60+), son 6 ay dönem özeti.
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

const REALIZED_EXPENSE = ["APPROVED", "PAID", "REIMBURSED"];

export async function GET(req: NextRequest) {
  try {
    const editionId = new URL(req.url).searchParams.get("editionId");
    if (!editionId) return NextResponse.json({ error: "editionId zorunlu" }, { status: 400 });

    const [orders, expenses, refunds] = await Promise.all([
      db.order.findMany({
        where: { editionId },
        include: {
          lines: true,
          payments: true,
          refunds: true,
          buyerOrganization: { select: { name: true } },
        },
        orderBy: { createdAt: "asc" },
      }),
      db.expense.findMany({ where: { editionId }, orderBy: { incurredAt: "asc" } }),
      db.refund.findMany({ where: { order: { editionId } } }),
    ]);

    // ── Sipariş tutarlılığı ──
    type Mismatch = { orderNo: string; payer: string; issue: string; expected: number; actual: number; delta: number };
    const mismatches: Mismatch[] = [];
    for (const o of orders) {
      const linesTotal = o.lines.reduce((s, l) => s + l.total, 0);
      const succeeded = o.payments.filter((p) => p.status === "SUCCEEDED").reduce((s, p) => s + p.amount, 0);
      const processedRefunds = o.refunds.filter((r) => r.status === "PROCESSED").reduce((s, r) => s + r.amount, 0);
      const payer = o.buyerOrganization?.name ?? o.payerName ?? o.orderNo;

      if (o.status !== "CANCELLED" && Math.abs(linesTotal - o.totalAmount) > 0.01) {
        mismatches.push({
          orderNo: o.orderNo, payer,
          issue: "Sipariş tutarı ≠ kalem toplamı",
          expected: o.totalAmount, actual: linesTotal, delta: Math.round((o.totalAmount - linesTotal) * 100) / 100,
        });
      }
      const netPaid = succeeded - processedRefunds;
      if (o.status === "PAID" && netPaid + 0.01 < o.totalAmount) {
        mismatches.push({
          orderNo: o.orderNo, payer,
          issue: "Durum PAID ama tahsilat toplamı yetersiz",
          expected: o.totalAmount, actual: netPaid, delta: Math.round((o.totalAmount - netPaid) * 100) / 100,
        });
      }
      if (o.status === "OPEN" && succeeded > 0) {
        mismatches.push({
          orderNo: o.orderNo, payer,
          issue: "Durum OPEN ama tahsilat var",
          expected: 0, actual: succeeded, delta: succeeded,
        });
      }
    }

    // ── Doğrulanmamış tahsilatlar (§38: manuel teyit entered_by + reason zorunlu) ──
    const unverifiedPayments = orders
      .flatMap((o) => o.payments.map((p) => ({ p, o })))
      .filter(({ p }) =>
        p.status === "SUCCEEDED" &&
        (!p.reference || (p.source === "MANUAL_EXTERNAL" && (!p.enteredBy || !p.reason)))
      )
      .map(({ p, o }) => ({
        id: p.id,
        orderNo: o.orderNo,
        payer: o.buyerOrganization?.name ?? o.payerName ?? o.orderNo,
        amount: p.amount,
        currency: p.currency,
        source: p.source,
        paidAt: p.paidAt,
        reason: p.reference ? null : "Referans numarası eksik",
      }));

    // ── Gider denetimi ──
    const now = Date.now();
    const awaitingReceipt = expenses.filter((e) => e.status === "PENDING_RECEIPT");
    const awaitingOld = awaitingReceipt.filter((e) => now - new Date(e.incurredAt).getTime() > 7 * 86400000);
    const approvedUnpaid = expenses.filter((e) => e.status === "APPROVED");
    const reimbursable = expenses.filter((e) => e.status === "REIMBURSED" || (e.paymentMethod === "PERSONAL_REIMBURSE" && REALIZED_EXPENSE.includes(e.status)));
    const expenseAudit = {
      awaitingReceipt: { count: awaitingReceipt.length, amount: awaitingReceipt.reduce((a, e) => a + e.amount, 0) },
      awaitingOld: { count: awaitingOld.length, amount: awaitingOld.reduce((a, e) => a + e.amount, 0) },
      approvedUnpaid: { count: approvedUnpaid.length, amount: approvedUnpaid.reduce((a, e) => a + e.amount, 0) },
      reimbursable: { count: reimbursable.length, amount: reimbursable.reduce((a, e) => a + e.amount, 0) },
    };

    // ── Açık alacak yaşlandırması ──
    const openOrders = orders.filter((o) => ["OPEN", "PARTIALLY_PAID"].includes(o.status));
    const bucketOf = (d: Date) => {
      const days = Math.floor((now - d.getTime()) / 86400000);
      return days <= 30 ? 0 : days <= 60 ? 1 : 2;
    };
    const buckets = [
      { label: "0-30 gün", count: 0, amount: 0 },
      { label: "31-60 gün", count: 0, amount: 0 },
      { label: "60+ gün", count: 0, amount: 0 },
    ];
    for (const o of openOrders) {
      const paid = o.payments.filter((p) => p.status === "SUCCEEDED").reduce((s, p) => s + p.amount, 0);
      const remain = Math.max(0, o.totalAmount - paid);
      if (remain <= 0) continue;
      const b = bucketOf(new Date(o.createdAt));
      buckets[b].count += 1;
      buckets[b].amount += remain;
    }
    const totalReceivable = buckets.reduce((a, b) => a + b.amount, 0);

    // ── Son 6 ay dönem özeti ──
    const succeededPayments = orders.flatMap((o) => o.payments.filter((p) => p.status === "SUCCEEDED"));
    const period: { month: string; income: number; expense: number; net: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setDate(1);
      d.setHours(0, 0, 0, 0);
      d.setMonth(d.getMonth() - i);
      const next = new Date(d);
      next.setMonth(next.getMonth() + 1);
      const income = succeededPayments
        .filter((p) => p.paidAt && new Date(p.paidAt) >= d && new Date(p.paidAt) < next)
        .reduce((a, p) => a + p.amount, 0);
      const expense = expenses
        .filter((e) => REALIZED_EXPENSE.includes(e.status) && new Date(e.incurredAt) >= d && new Date(e.incurredAt) < next)
        .reduce((a, e) => a + e.amount, 0);
      period.push({
        month: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`,
        income, expense, net: income - expense,
      });
    }

    // ── Kapanış hazırlığı (§7 mutabakat denetimi) ──
    const blockers: string[] = [];
    const warnings: string[] = [];
    if (mismatches.length > 0) blockers.push(`${mismatches.length} sipariş tutarsızlığı düzeltilmeli`);
    if (unverifiedPayments.length > 0) blockers.push(`${unverifiedPayments.length} tahsilat referans/teyit bilgisi eksik (§38)`);
    if (awaitingOld.length > 0) warnings.push(`${awaitingOld.length} giderin fişi 7+ gündür bekliyor`);
    if (buckets[2].count > 0) warnings.push(`${buckets[2].count} açık alacak 60+ gün eski (toplam ₺${Math.round(buckets[2].amount).toLocaleString("tr-TR")})`);
    if (approvedUnpaid.length > 0) warnings.push(`${approvedUnpaid.length} onaylı gider henüz ödenmedi`);
    if (blockers.length === 0 && warnings.length === 0) blockers.length = 0;

    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      orders: {
        total: orders.length,
        paid: orders.filter((o) => o.status === "PAID").length,
        open: orders.filter((o) => o.status === "OPEN").length,
        partiallyPaid: orders.filter((o) => o.status === "PARTIALLY_PAID").length,
        cancelled: orders.filter((o) => o.status === "CANCELLED").length,
        mismatches,
      },
      unverifiedPayments,
      expenseAudit,
      aging: { buckets, totalReceivable, openOrders: openOrders.length },
      period,
      readiness: {
        ok: blockers.length === 0,
        blockers,
        warnings,
      },
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Mutabakat raporu alınamadı" }, { status: 500 });
  }
}
