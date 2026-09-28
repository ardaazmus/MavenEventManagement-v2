// /api/accounting/export — Muhasebe Excel/CSV çıktısı (Faz D)
// GET /api/accounting/export?editionId=...&type=ledger|income|expense&format=xlsx|csv
// - format=xlsx: type=ledger → 3 sayfalı workbook (Genel Defter / Gelir Kalemleri / Gider Kalemleri)
//                type=income|expense → tek sayfa
// - format=csv : tek veri kümesi, BOM + ; ayracı (TR Excel uyumu), ondalık virgül
// Dosya adı: muhasebe-<slug>-<tarih>.xlsx
import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { db } from "@/lib/db";
import { resolveEditionContext, GuardError } from "@/lib/api/tenant-guard";
import { requireStaff, requestActor } from "@/lib/auth/request-context";
import { fromMinor } from "@/lib/money";
import { enforceRateLimit } from "@/lib/rate-limit";
import { logExport } from "@/lib/privacy/export-guard";

const INCOME_EXPENSE_STATUSES = ["APPROVED", "PAID", "REIMBURSED"];

const trDate = (d: Date | string | null | undefined): string => {
  if (!d) return "";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString("tr-TR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
};

const trDay = (d: Date | string | null | undefined): string => {
  if (!d) return "";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString("tr-TR", { day: "2-digit", month: "2-digit", year: "numeric" });
};

// CSV hücresi: ; ayracı + ondalık virgül + tırnak kaçışı
const csvNum = (n: number): string => n.toFixed(2).replace(".", ",");

export async function GET(req: NextRequest) {
  try {
  // S3: finansal çıktı indirme istismarı kapısı — 10 indirme/dk/IP
  const denied = enforceRateLimit(req, { key: "accounting-export", limit: 10, windowMs: 60_000 });
  if (denied) return denied;
  // P14.2: finansal çıktı payerName PII taşır — kadro kapısı zorunlu (eksikti).
  const staffGate = await requireStaff();
  if (staffGate) return staffGate;

    const sp = req.nextUrl.searchParams;
    const editionId = sp.get("editionId");
    const type = sp.get("type") ?? "ledger";
    const format = sp.get("format") ?? "xlsx";
    if (!editionId) return NextResponse.json({ error: "editionId zorunlu" }, { status: 400 });

    // G0-b: edisyon kiracı bağlamına doğrulanır — yabancı edisyondan Excel indirme 404
    try {
      await resolveEditionContext(editionId, { required: true });
    } catch (e) {
      if (e instanceof GuardError) return NextResponse.json({ error: e.message }, { status: e.status });
      throw e;
    }

    const edition = await db.eventEdition.findUnique({
      where: { id: editionId },
      select: { name: true, slug: true, tenantId: true },
    });
    if (!edition) return NextResponse.json({ error: "Etkinlik bulunamadı" }, { status: 404 });

    const [payments, expenses, incomes] = await Promise.all([
      db.payment.findMany({
        where: { order: { editionId }, status: "SUCCEEDED" },
        include: { order: { select: { orderNo: true, payerName: true } } },
        orderBy: { createdAt: "desc" },
      }),
      db.expense.findMany({ where: { editionId }, orderBy: { incurredAt: "desc" } }),
      db.income.findMany({ where: { editionId }, orderBy: { incomeDate: "desc" } }),
    ]);

    const realizedExpenses = expenses.filter((e) => INCOME_EXPENSE_STATUSES.includes(e.status));
    const receivedIncomes = incomes.filter((i) => i.status === "RECEIVED");

    // ── veri kümeleri (TR başlıklar) ──
    const ledgerRows = [
      ...payments.map((p) => ({
        Tarih: trDate(p.paidAt ?? p.createdAt), Tür: "Gelir (online)",
        Açıklama: `${p.order.payerName ?? "Katılımcı"} — ${p.order.orderNo}`,
        Referans: p.reference ?? p.order.orderNo, Yöntem: p.source, Durum: p.status,
        Tutar: fromMinor(p.amount), Para: p.currency,
      })),
      ...receivedIncomes.map((i) => ({
        Tarih: trDate(i.incomeDate), Tür: "Manuel Gelir",
        Açıklama: `${i.title}${i.payer ? ` — ${i.payer}` : ""}`,
        Referans: i.code, Yöntem: i.method, Durum: i.status,
        Tutar: fromMinor(i.amount), Para: i.currency,
      })),
      ...realizedExpenses.map((e) => ({
        Tarih: trDate(e.incurredAt), Tür: "Gider",
        Açıklama: `${e.title}${e.vendor ? ` — ${e.vendor}` : ""}`,
        Referans: e.code, Yöntem: e.paymentMethod, Durum: e.status,
        Tutar: fromMinor(e.amount), Para: e.currency,
      })),
    ].sort((a, b) => (a.Tarih < b.Tarih ? 1 : -1));

    const incomeRows = incomes.map((i) => ({
      Kod: i.code, Başlık: i.title, Kategori: i.category, Ödeyen: i.payer ?? "",
      Tarih: trDay(i.incomeDate), Yöntem: i.method, Durum: i.status,
      Tutar: fromMinor(i.amount), Para: i.currency, "Dekont No": i.receiptNo ?? "",
      Onaylayan: i.approvedBy ?? "", Not: i.notes ?? "",
    }));

    const expenseRows = expenses.map((e) => ({
      Kod: e.code, Başlık: e.title, Kategori: e.category, Tedarikçi: e.vendor ?? "",
      Tarih: trDay(e.incurredAt), "Ödeme Yöntemi": e.paymentMethod, Durum: e.status,
      Tutar: fromMinor(e.amount), Para: e.currency, "Fiş No": e.receiptNo ?? "",
      Harcayan: e.spentBy ?? "", Not: e.notes ?? "",
    }));

    const stamp = new Date().toISOString().slice(0, 10);
    const baseName = `muhasebe-${edition.slug}-${stamp}`;

    if (format === "csv") {
      // CSV: tek veri kümesi — type param seçimi (ledger → defter)
      let rows: Record<string, string | number>[];
      if (type === "income") rows = incomeRows;
      else if (type === "expense") rows = expenseRows;
      else rows = ledgerRows;
      if (rows.length === 0) rows = [{ Bilgi: "Kayıt yok" }];
      const headers = Object.keys(rows[0]);
      const lines = [headers.join(";")];
      for (const r of rows) {
        lines.push(headers.map((h) => {
          const v = r[h];
          return typeof v === "number" ? csvNum(v) : `"${String(v ?? "").replace(/"/g, '""')}"`;
        }).join(";"));
      }
      const bom = "\uFEFF";
      const actorCsv = await requestActor();
      await logExport(db, { tenantId: edition.tenantId ?? null, editionId, type: "ACCOUNTING", count: rows.length, actorName: actorCsv?.uid ?? null });
      return new NextResponse(bom + lines.join("\r\n"), {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="${baseName}-${type === "ledger" ? "defter" : type === "income" ? "gelir" : "gider"}.csv"`,
        },
      });
    }

    // ── XLSX ──
    const wb = XLSX.utils.book_new();
    const toSheet = (rows: Record<string, string | number>[]) => {
      const ws = XLSX.utils.json_to_sheet(rows.length ? rows : [{ Bilgi: "Kayıt yok" }]);
      // sayı kolonuna TR sayı biçimi uygula
      const headers = Object.keys(rows[0] ?? { Bilgi: "" });
      const idx = headers.indexOf("Tutar");
      if (idx >= 0 && rows.length > 0) {
        const col = XLSX.utils.encode_col(idx);
        const range = XLSX.utils.decode_range(ws["!ref"] ?? "A1");
        for (let R = range.s.r + 1; R <= range.e.r; R++) {
          const cell = ws[`${col}${R}`];
          if (cell && typeof cell.v === "number") cell.z = "#,##0.00";
        }
      }
      ws["!cols"] = headers.map((h) => ({ wch: Math.max(10, Math.min(42, h.length + 8)) }));
      return ws;
    };

    if (type === "income") {
      XLSX.utils.book_append_sheet(wb, toSheet(incomeRows), "Gelir Kalemleri");
    } else if (type === "expense") {
      XLSX.utils.book_append_sheet(wb, toSheet(expenseRows), "Gider Kalemleri");
    } else {
      XLSX.utils.book_append_sheet(wb, toSheet(ledgerRows), "Genel Defter");
      XLSX.utils.book_append_sheet(wb, toSheet(incomeRows), "Gelir Kalemleri");
      XLSX.utils.book_append_sheet(wb, toSheet(expenseRows), "Gider Kalemleri");
    }

    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
    const actor = await requestActor();
    await logExport(db, { tenantId: edition.tenantId ?? null, editionId, type: "ACCOUNTING", count: ledgerRows.length + incomeRows.length + expenseRows.length, actorName: actor?.uid ?? null });
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${baseName}-${type === "ledger" ? "defter" : type === "income" ? "gelir" : "gider"}.xlsx"`,
      },
    });
  } catch (e) {
    console.error("GET /api/accounting/export", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Excel çıktısı üretilemedi" }, { status: 500 });
  }
}
