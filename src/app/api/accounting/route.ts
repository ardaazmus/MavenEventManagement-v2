// Entegre muhasebe — kayıt tahsilatları (Order/Payment) + ek/saha harcamaları (Expense) tek defterde
// GET /api/accounting?editionId=...
// Dönen: gelir/gider/net özeti, kaynak & kategori kırılımları, açık alacaklar, 30 günlük seri, birleşik defter
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

const INCOME_EXPENSE_STATUSES = ["APPROVED", "PAID", "REIMBURSED"]; // giderde gerçekleşen sayılanlar

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const editionId = searchParams.get("editionId");
    if (!editionId) return NextResponse.json({ error: "editionId zorunlu" }, { status: 400 });

    const [orders, payments, expenses] = await Promise.all([
      db.order.findMany({
        where: { editionId },
        include: { payments: true, lines: true },
        orderBy: { createdAt: "desc" },
      }),
      db.payment.findMany({
        where: { order: { editionId } },
        include: { order: { select: { orderNo: true, payerName: true } } },
        orderBy: { createdAt: "desc" },
      }),
      db.expense.findMany({ where: { editionId }, orderBy: { incurredAt: "desc" } }),
    ]);

    // ── GELİR (tahsil edilen) ──
    const succeeded = payments.filter((p) => p.status === "SUCCEEDED");
    const incomeTotal = succeeded.reduce((a, p) => a + p.amount, 0);
    const pendingIncome = payments
      .filter((p) => p.status === "PENDING")
      .reduce((a, p) => a + p.amount, 0);
    const pendingCount = payments.filter((p) => p.status === "PENDING").length;

    const bySource = Object.entries(
      succeeded.reduce<Record<string, { total: number; count: number }>>((acc, p) => {
        acc[p.source] = acc[p.source] ?? { total: 0, count: 0 };
        acc[p.source].total += p.amount;
        acc[p.source].count += 1;
        return acc;
      }, {})
    ).map(([key, v]) => ({ key, total: v.total, count: v.count }));

    // ── GİDER ──
    const realizedExpenses = expenses.filter((e) => INCOME_EXPENSE_STATUSES.includes(e.status));
    const expenseTotal = realizedExpenses.reduce((a, e) => a + e.amount, 0);
    const plannedExpense = expenses
      .filter((e) => ["PLANNED", "PENDING_RECEIPT"].includes(e.status))
      .reduce((a, e) => a + e.amount, 0);
    const byCategory = Object.entries(
      realizedExpenses.reduce<Record<string, { total: number; count: number }>>((acc, e) => {
        acc[e.category] = acc[e.category] ?? { total: 0, count: 0 };
        acc[e.category].total += e.amount;
        acc[e.category].count += 1;
        return acc;
      }, {})
    ).map(([key, v]) => ({ key, total: v.total, count: v.count }));
    const byExpenseStatus = Object.entries(
      expenses.reduce<Record<string, { total: number; count: number }>>((acc, e) => {
        acc[e.status] = acc[e.status] ?? { total: 0, count: 0 };
        acc[e.status].total += e.amount;
        acc[e.status].count += 1;
        return acc;
      }, {})
    ).map(([key, v]) => ({ key, total: v.total, count: v.count }));

    // ─AÇIK ALACAK (sipariş bakiyesi) ──
    const openOrders = orders.filter((o) => ["OPEN", "PARTIALLY_PAID"].includes(o.status));
    const receivable = openOrders.reduce(
      (a, o) => a + Math.max(0, o.totalAmount - o.payments.filter((p) => p.status === "SUCCEEDED").reduce((x, p) => x + p.amount, 0)),
      0
    );

    // ── NET ──
    const net = incomeTotal - expenseTotal;
    const margin = incomeTotal > 0 ? Math.round((net / incomeTotal) * 100) : null;

    // ── 30 günlük seri (gelir paidAt, gider incurredAt) ──
    const daily: { date: string; income: number; expense: number }[] = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() - i);
      const next = new Date(d);
      next.setDate(next.getDate() + 1);
      daily.push({
        date: d.toISOString().slice(0, 10),
        income: succeeded
          .filter((p) => p.paidAt && new Date(p.paidAt) >= d && new Date(p.paidAt) < next)
          .reduce((a, p) => a + p.amount, 0),
        expense: realizedExpenses
          .filter((e) => new Date(e.incurredAt) >= d && new Date(e.incurredAt) < next)
          .reduce((a, e) => a + e.amount, 0),
      });
    }

    // ── BİRLEŞİK DEFTER (son 60 hareket) ──
    const incomeRows = succeeded.map((p) => ({
      id: p.id,
      kind: "INCOME" as const,
      date: p.paidAt ?? p.createdAt,
      description: `${p.order.payerName ?? "Katılımcı"} — ${p.order.orderNo}`,
      ref: p.reference ?? p.order.orderNo,
      method: p.source,
      status: p.status,
      amount: p.amount,
      currency: p.currency,
    }));
    const expenseRows = realizedExpenses.map((e) => ({
      id: e.id,
      kind: "EXPENSE" as const,
      date: e.incurredAt,
      description: `${e.title}${e.vendor ? ` — ${e.vendor}` : ""}`,
      ref: e.code,
      method: e.paymentMethod,
      status: e.status,
      amount: e.amount,
      currency: e.currency,
    }));
    const pendingRows = payments
      .filter((p) => p.status === "PENDING")
      .map((p) => ({
        id: p.id,
        kind: "RECEIVABLE" as const,
        date: p.createdAt,
        description: `Bekleyen tahsilat — ${p.order.payerName ?? "Katılımcı"} (${p.order.orderNo})`,
        ref: p.order.orderNo,
        method: p.source,
        status: p.status,
        amount: p.amount,
        currency: p.currency,
      }));
    const ledger = [...incomeRows, ...expenseRows, ...pendingRows]
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 60);

    return NextResponse.json({
      summary: {
        incomeTotal,
        pendingIncome,
        pendingCount,
        expenseTotal,
        plannedExpense,
        net,
        margin,
        paymentCount: succeeded.length,
        expenseCount: realizedExpenses.length,
      },
      receivable: { amount: receivable, openOrders: openOrders.length },
      incomeBySource: bySource,
      expenseByCategory: byCategory,
      expenseByStatus: byExpenseStatus,
      daily,
      ledger,
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Muhasebe özeti alınamadı" }, { status: 500 });
  }
}
