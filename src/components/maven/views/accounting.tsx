"use client";
// Muhasebe — kayıt tahsilatları, bekleyen ödemeler ve saha/ek harcamalar tek defterde (§36: gelir ≠ gider ≠ alacak)
import { useMemo, useState } from "react";
import { listEntity, apiSend, apiGet } from "@/lib/client";
import { useApp } from "@/lib/store";
import { SectionCard, EmptyState, Loading, ErrorState, useApi, PageHeader, StatusBadge, Chip, KpiCard } from "../bits";
import { EXPENSE_STATUS, EXPENSE_CATEGORY, EXPENSE_PAYMENT_METHOD, INCOME_STATUS, INCOME_CATEGORY, INCOME_METHOD, PAYMENT_METHODS, STATUS_TONE, label, fmtDate, fmtDateTime, fmtMoney, fmtMoneyMajor } from "@/lib/constants";
import { toMinor } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { useLang, t, tLabel } from "@/lib/i18n";
import * as Icons from "lucide-react";
import { InlineEditableCell, QuickAddRow, BulkPasteDialog } from "@/components/maven/data-tools";


// ─── Tipler ──────────────────────────────────────────────────────────────────

interface AccountingData {
  summary: { incomeTotal: number; onlineIncome: number; manualIncomeTotal: number; plannedIncome: number; incomeCount: number; pendingIncome: number; pendingCount: number; expenseTotal: number; plannedExpense: number; net: number; margin: number | null; paymentCount: number; expenseCount: number };
  receivable: { amount: number; openOrders: number };
  incomeBySource: { key: string; total: number; count: number }[];
  incomeByCategory: { key: string; total: number; count: number }[];
  expenseByCategory: { key: string; total: number; count: number }[];
  expenseByStatus: { key: string; total: number; count: number }[];
  daily: { date: string; income: number; expense: number }[];
  ledger: { id: string; kind: "INCOME" | "MANUAL_INCOME" | "EXPENSE" | "RECEIVABLE"; date: string; description: string; ref: string | null; method: string; status: string; amount: number; currency: string }[];
}

// Mutabakat raporu (§7) — kapanış öncesi finansal denetim
interface ReconciliationData {
  generatedAt: string;
  orders: { total: number; paid: number; open: number; partiallyPaid: number; cancelled: number; mismatches: { orderNo: string; payer: string; issue: string; expected: number; actual: number; delta: number }[] };
  unverifiedPayments: { id: string; orderNo: string; payer: string; amount: number; currency: string; source: string; paidAt: string | null; reason: string | null }[];
  expenseAudit: { awaitingReceipt: { count: number; amount: number }; awaitingOld: { count: number; amount: number }; approvedUnpaid: { count: number; amount: number }; reimbursable: { count: number; amount: number } };
  aging: { buckets: { label: string; count: number; amount: number }[]; totalReceivable: number; openOrders: number };
  period: { month: string; income: number; expense: number; net: number }[];
  readiness: { ok: boolean; blockers: string[]; warnings: string[] };
}

interface ExpenseRow {
  id: string; code: string; category: string; title: string; description?: string | null;
  amount: number; currency: string; vendor?: string | null; incurredAt: string; spentBy?: string | null;
  paymentMethod: string; status: string; receiptNo?: string | null; approvedBy?: string | null; notes?: string | null;
}

interface ExpenseForm {
  title: string; category: string; amount: string; currency: string; vendor: string; spentBy: string;
  paymentMethod: string; incurredAt: string; status: string; description: string; receiptNo: string; notes: string;
}

interface QuickForm { title: string; amount: string; spentBy: string; paymentMethod: string; }

// Faz B: manuel gelir — Expense aynası
interface IncomeRow {
  id: string; code: string; category: string; title: string; description?: string | null;
  amount: number; currency: string; method: string; payer?: string | null; incomeDate: string;
  status: string; receiptNo?: string | null; approvedBy?: string | null; notes?: string | null;
}

// 12 alan: başlık, kategori, tutar, para birimi, yöntem, ödeyen, gelir tarihi, durum, dekont no, açıklama, not, onaylayan
interface IncomeForm {
  title: string; category: string; amount: string; currency: string; method: string; payer: string;
  incomeDate: string; status: string; receiptNo: string; description: string; notes: string; approvedBy: string;
}

interface QuickIncomeForm { title: string; amount: string; payer: string; method: string; category: string; }

type ChipTone = "neutral" | "teal" | "amber" | "rose" | "violet" | "emerald";

// ─── Sabitler ────────────────────────────────────────────────────────────────

const CURRENCIES = ["TRY", "USD", "EUR"] as const;
const QUICK_METHODS = ["CASH", "COMPANY_CARD", "PERSONAL_REIMBURSE"] as const;

const EMPTY_EXPENSE_FORM: ExpenseForm = {
  title: "", category: "OTHER", amount: "", currency: "TRY", vendor: "", spentBy: "",
  paymentMethod: "COMPANY_CARD", incurredAt: "", status: "PENDING_RECEIPT", description: "", receiptNo: "", notes: "",
};

const EMPTY_QUICK_FORM: QuickForm = { title: "", amount: "", spentBy: "", paymentMethod: "CASH" };

const EMPTY_INCOME_FORM: IncomeForm = {
  title: "", category: "SPONSORLUK", amount: "", currency: "TRY", method: "BANK_TRANSFER", payer: "",
  incomeDate: "", status: "PLANNED", receiptNo: "", description: "", notes: "", approvedBy: "",
};

const EMPTY_QUICK_INCOME: QuickIncomeForm = { title: "", amount: "", payer: "", method: "CASH", category: "KAYIT" };

// defterde ödeme + gider + gelir durumları karışık gelir — birleşik etiket haritası
const LEDGER_STATUS_LABEL: Record<string, string> = {
  SUCCEEDED: "Tahsil Edildi",
  PENDING: "Bekliyor",
  FAILED: "Başarısız",
  ...INCOME_STATUS,
  ...EXPENSE_STATUS,
};

// kategori → Chip tonu (TECH için sky yok, en yakın teal)
const CATEGORY_TONE: Record<string, ChipTone> = {
  FIELD_EXPENSE: "amber",
  TECH: "teal",
  CATERING: "violet",
  LOGISTICS: "neutral",
};

const categoryTone = (key: string): ChipTone => CATEGORY_TONE[key] ?? "neutral";

// durum rengini STATUS_TONE'dan Chip tonuna çevir (kırılımda tutarlı renk)
const toneFromStatus = (status: string): ChipTone => {
  const cls = STATUS_TONE[status] ?? "";
  if (cls.includes("emerald")) return "emerald";
  if (cls.includes("amber")) return "amber";
  if (cls.includes("rose")) return "rose";
  if (cls.includes("sky")) return "teal";
  if (cls.includes("purple")) return "violet";
  return "neutral";
};

const todayStr = (): string => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};

// benzersiz gider kodu: GSN-YYYY-XXX (sayaç = mevcut adet + 1; çakışırsa +1 dene)
const nextExpenseCode = (existing: ExpenseRow[]): string => {
  const year = new Date().getFullYear();
  const taken = new Set(existing.map((e) => e.code));
  let n = existing.length + 1;
  let code = `GSN-${year}-${String(n).padStart(3, "0")}`;
  while (taken.has(code)) {
    n += 1;
    code = `GSN-${year}-${String(n).padStart(3, "0")}`;
  }
  return code;
};

// benzersiz gelir kodu: GLR-YYYY-XXX (giderdeki desenin aynası)
const nextIncomeCode = (existing: IncomeRow[]): string => {
  const year = new Date().getFullYear();
  const taken = new Set(existing.map((e) => e.code));
  let n = existing.length + 1;
  let code = `GLR-${year}-${String(n).padStart(3, "0")}`;
  while (taken.has(code)) {
    n += 1;
    code = `GLR-${year}-${String(n).padStart(3, "0")}`;
  }
  return code;
};

// ay etiketi: "2026-09" → "Eyl 2026"
const monthLabel = (m: string): string => {
  const d = new Date(`${m}-01`);
  return Number.isNaN(d.getTime()) ? m : d.toLocaleDateString("tr-TR", { month: "short", year: "numeric" });
};

// mutabakat temiz durum bloğu — yeşil EmptyState
function ReconCleanState({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="flex min-h-40 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-emerald-200 bg-emerald-50/40 p-6 text-center">
      <Icons.CheckCircle2 className="size-8 text-emerald-500/70" />
      <p className="text-sm font-medium">{title}</p>
      <p className="max-w-sm text-xs text-muted-foreground">{desc}</p>
    </div>
  );
}

// kırılım barları için ortak satır
function BreakdownBar({ text, count, total, max, barClass }: { text: string; count: number; total: number; max: number; barClass: string }) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className="min-w-0 truncate font-medium">{text}</span>
        <span className="shrink-0 tabular-nums text-muted-foreground">
          {count} adet · <span className="font-semibold text-foreground">{fmtMoney(total)}</span>
        </span>
      </div>
      <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted">
        <div className={`h-full rounded-full ${barClass}`} style={{ width: `${Math.max(4, Math.round((total / max) * 100))}%` }} />
      </div>
    </div>
  );
}

// ─── View ────────────────────────────────────────────────────────────────────

export function AccountingView() {
  const { currentEditionId, bump, refreshKey } = useApp();
  const { toast } = useToast();
  useLang(); // dil değişiminde yeniden render

  const [kindFilter, setKindFilter] = useState("ALL");
  const [expStatus, setExpStatus] = useState("ALL");
  const [expCategory, setExpCategory] = useState("ALL");
  const [expSearch, setExpSearch] = useState("");
  const [newOpen, setNewOpen] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);
  const [form, setForm] = useState<ExpenseForm>(EMPTY_EXPENSE_FORM);
  const [quick, setQuick] = useState<QuickForm>(EMPTY_QUICK_FORM);
  const [bulkExpenseOpen, setBulkExpenseOpen] = useState(false);
  const [expenseViewMode, setExpenseViewMode] = useState<"table" | "cards">("table");
  // Faz B: manuel gelir state
  const [incOpen, setIncOpen] = useState(false);
  const [incQuickOpen, setIncQuickOpen] = useState(false);
  const [incForm, setIncForm] = useState<IncomeForm>(EMPTY_INCOME_FORM);
  const [incQuick, setIncQuick] = useState<QuickIncomeForm>(EMPTY_QUICK_INCOME);
  const [incStatus, setIncStatus] = useState("ALL");
  const [incCategory, setIncCategory] = useState("ALL");
  const [incSearch, setIncSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  // entegre muhasebe özeti + defter
  const { data: acc, error, reload, loading } = useApi<AccountingData | null>(() => {
    if (!currentEditionId) return Promise.resolve(null);
    return apiGet<AccountingData>("/api/accounting?editionId=" + currentEditionId);
  }, [currentEditionId, refreshKey]);

  // gider kalemleri (tümü — filtreler istemci tarafında, kod üretimi de tam listeden)
  const { data: expenses, error: expError, reload: reloadExpenses, loading: loadingExpenses } = useApi<ExpenseRow[]>(
    () => listEntity<ExpenseRow>("expenses", { editionId: currentEditionId ?? undefined }),
    [currentEditionId, refreshKey]
  );

  // Faz B: manuel gelir kalemleri
  const { data: incomes, error: incError, reload: reloadIncomes, loading: loadingIncomes } = useApi<IncomeRow[]>(
    () => listEntity<IncomeRow>("incomes", { editionId: currentEditionId ?? undefined }),
    [currentEditionId, refreshKey]
  );

  // mutabakat raporu — kapanış öncesi denetim (ayrı istek, aynı yenileme döngüsü)
  const { data: recon, error: reconError, reload: reloadRecon, loading: loadingRecon } = useApi<ReconciliationData | null>(() => {
    if (!currentEditionId) return Promise.resolve(null);
    return apiGet<ReconciliationData>("/api/reconciliation?editionId=" + currentEditionId);
  }, [currentEditionId, refreshKey]);

  const sum = acc?.summary;
  const net = sum?.net ?? 0;
  const NetIcon = net >= 0 ? Icons.TrendingUp : Icons.TrendingDown;

  // defter: kind filtresi (istemci tarafı)
  const ledger = useMemo(() => {
    const rows = acc?.ledger ?? [];
    return kindFilter === "ALL" ? rows : rows.filter((r) => r.kind === kindFilter);
  }, [acc, kindFilter]);
  const ledgerIncome = useMemo(() => ledger.filter((r) => r.kind === "INCOME" || r.kind === "MANUAL_INCOME").reduce((a, r) => a + r.amount, 0), [ledger]);
  const ledgerExpense = useMemo(() => ledger.filter((r) => r.kind === "EXPENSE").reduce((a, r) => a + r.amount, 0), [ledger]);

  // gider listesi: durum + kategori + arama (istemci tarafı)
  const filteredExpenses = useMemo(() => {
    const q = expSearch.trim().toLocaleLowerCase("tr-TR");
    return (expenses ?? []).filter((e) => {
      if (expStatus !== "ALL" && e.status !== expStatus) return false;
      if (expCategory !== "ALL" && e.category !== expCategory) return false;
      if (q) {
        const hay = `${e.title} ${e.vendor ?? ""} ${e.code}`.toLocaleLowerCase("tr-TR");
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [expenses, expStatus, expCategory, expSearch]);

  // gelir listesi: durum + kategori + arama (istemci tarafı)
  const filteredIncomes = useMemo(() => {
    const q = incSearch.trim().toLocaleLowerCase("tr-TR");
    return (incomes ?? []).filter((e) => {
      if (incStatus !== "ALL" && e.status !== incStatus) return false;
      if (incCategory !== "ALL" && e.category !== incCategory) return false;
      if (q) {
        const hay = `${e.title} ${e.payer ?? ""} ${e.code}`.toLocaleLowerCase("tr-TR");
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [incomes, incStatus, incCategory, incSearch]);

  // kırılım ölçekleri
  const incomeBySource = acc?.incomeBySource ?? [];
  const incomeByCategory = acc?.incomeByCategory ?? [];
  const expenseByCategory = acc?.expenseByCategory ?? [];
  const expenseByStatus = acc?.expenseByStatus ?? [];
  const daily = acc?.daily ?? [];
  const maxIncomeSource = Math.max(1, ...incomeBySource.map((r) => r.total));
  const maxIncomeCategory = Math.max(1, ...incomeByCategory.map((r) => r.total));
  const maxExpenseCategory = Math.max(1, ...expenseByCategory.map((r) => r.total));
  const dailyMax = Math.max(1, ...daily.map((d) => Math.max(d.income, d.expense)));
  const dailyIncomeTotal = daily.reduce((a, d) => a + d.income, 0);
  const dailyExpenseTotal = daily.reduce((a, d) => a + d.expense, 0);
  const CHART_H = 112;

  // Faz E: sabit map'leri tLabel ile çevir (status/kategori/yöntem)
  const ledgerStatusMap = Object.fromEntries(Object.entries(LEDGER_STATUS_LABEL).map(([k]) => [k, tLabel(LEDGER_STATUS_LABEL, k)]));
  const expStatusMap = Object.fromEntries(Object.entries(EXPENSE_STATUS).map(([k]) => [k, tLabel(EXPENSE_STATUS, k)]));
  const expCategoryMap = Object.fromEntries(Object.entries(EXPENSE_CATEGORY).map(([k]) => [k, tLabel(EXPENSE_CATEGORY, k)]));
  const incStatusMap = Object.fromEntries(Object.entries(INCOME_STATUS).map(([k]) => [k, tLabel(INCOME_STATUS, k)]));
  const incCategoryMap = Object.fromEntries(Object.entries(INCOME_CATEGORY).map(([k]) => [k, tLabel(INCOME_CATEGORY, k)]));
  const payMethodMap = Object.fromEntries(Object.entries(PAYMENT_METHODS).map(([k]) => [k, tLabel(PAYMENT_METHODS, k)]));
  const expMethodMap = Object.fromEntries(Object.entries(EXPENSE_PAYMENT_METHOD).map(([k]) => [k, tLabel(EXPENSE_PAYMENT_METHOD, k)]));
  const incMethodMap = Object.fromEntries(Object.entries(INCOME_METHOD).map(([k]) => [k, tLabel(INCOME_METHOD, k)]));

  // mutabakat: dönem özeti türevleri
  const reconPeriod = recon?.period ?? [];
  const periodIncome = reconPeriod.reduce((a, p) => a + p.income, 0);
  const periodExpense = reconPeriod.reduce((a, p) => a + p.expense, 0);
  const periodNet = periodIncome - periodExpense;
  const periodMaxNet = Math.max(1, ...reconPeriod.map((p) => Math.abs(p.net)));

  const refreshAll = () => { reload(); reloadExpenses(); reloadIncomes(); bump(); };

  // ── Faz D: Excel/CSV indirme ──
  const downloadExport = async (type: "ledger" | "income" | "expense", format: "xlsx" | "csv") => {
    if (!currentEditionId) return;
    try {
      const res = await fetch(`/api/accounting/export?editionId=${currentEditionId}&type=${type}&format=${format}`, { cache: "no-store" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? "Çıktı üretilemedi");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = format === "xlsx"
        ? `muhasebe-${type === "ledger" ? "defter" : type === "income" ? "gelir" : "gider"}.xlsx`
        : `muhasebe-${type === "ledger" ? "defter" : type === "income" ? "gelir" : "gider"}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast({ title: t("accounting.downloadStarted"), description: t(format === "xlsx" ? "accounting.downloadXlsx" : "accounting.downloadCsv") });
    } catch (err) {
      toast({ title: t("accounting.downloadFailed"), description: err instanceof Error ? err.message : "Hata", variant: "destructive" });
    }
  };

  // ── aksiyonlar ──

  const patchExpense = async (id: string, body: Record<string, unknown>) => {
    setBusyId(id);
    try {
      await apiSend(`/api/expenses/${id}`, "PUT", body);
      toast({ title: t("accounting.expenseUpdated"), description: t("accounting.expenseUpdatedDesc") });
      refreshAll();
    } catch (err) {
      toast({ title: t("accounting.expenseUpdateFailed"), description: err instanceof Error ? err.message : "Hata", variant: "destructive" });
    } finally {
      setBusyId(null);
    }
  };

  const openNew = () => { setForm({ ...EMPTY_EXPENSE_FORM, incurredAt: todayStr() }); setNewOpen(true); };
  const openQuick = () => { setQuick(EMPTY_QUICK_FORM); setQuickOpen(true); };
  const openNewIncome = () => { setIncForm({ ...EMPTY_INCOME_FORM, incomeDate: todayStr() }); setIncOpen(true); };
  const openQuickIncome = () => { setIncQuick(EMPTY_QUICK_INCOME); setIncQuickOpen(true); };

  const submitNewExpense = async () => {
    if (!currentEditionId) return;
    setBusy(true);
    try {
      await apiSend("/api/expenses", "POST", {
        editionId: currentEditionId,
        code: nextExpenseCode(expenses ?? []),
        category: form.category,
        title: form.title.trim(),
        description: form.description,
        amount: toMinor(Number(form.amount) || 0), // F6: ₺ girdi → kuruş
        currency: form.currency,
        vendor: form.vendor,
        spentBy: form.spentBy,
        paymentMethod: form.paymentMethod,
        incurredAt: form.incurredAt ? new Date(form.incurredAt).toISOString() : undefined,
        status: form.status,
        receiptNo: form.receiptNo,
        notes: form.notes,
      });
      toast({ title: t("accounting.expenseSaved"), description: `${form.title.trim()} — ${fmtMoneyMajor(Number(form.amount), form.currency)} ${t("accounting.expenseSavedToLedger")}` });
      setNewOpen(false);
      setForm(EMPTY_EXPENSE_FORM);
      refreshAll();
    } catch (err) {
      toast({ title: t("accounting.expenseSaveFailed"), description: err instanceof Error ? err.message : "Hata", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const submitQuickExpense = async () => {
    if (!currentEditionId) return;
    setBusy(true);
    try {
      await apiSend("/api/expenses", "POST", {
        editionId: currentEditionId,
        code: nextExpenseCode(expenses ?? []),
        category: "FIELD_EXPENSE",
        title: quick.title.trim(),
        description: "Sahada anlık harcama — fiş sonradan eklenebilir.",
        amount: toMinor(Number(quick.amount) || 0),
        currency: "TRY",
        spentBy: quick.spentBy,
        paymentMethod: quick.paymentMethod,
        incurredAt: new Date().toISOString(),
        status: "APPROVED",
        approvedBy: "Saha Onayı",
      });
      toast({ title: t("accounting.quickExpenseSaved"), description: `${quick.title.trim()} — ${fmtMoneyMajor(Number(quick.amount))}` });
      setQuickOpen(false);
      setQuick(EMPTY_QUICK_FORM);
      refreshAll();
    } catch (err) {
      toast({ title: t("accounting.quickExpenseSaveFailed"), description: err instanceof Error ? err.message : "Hata", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const patchIncome = async (id: string, body: { status: string; approvedBy?: string }) => {
    setBusyId(id);
    try {
      await apiSend(`/api/incomes/${id}`, "PUT", body);
      toast({ title: t("accounting.incomeUpdated"), description: t("accounting.incomeUpdatedDesc") });
      refreshAll();
    } catch (err) {
      toast({ title: t("accounting.incomeUpdateFailed"), description: err instanceof Error ? err.message : "Hata", variant: "destructive" });
    } finally {
      setBusyId(null);
    }
  };

  const submitNewIncome = async () => {
    if (!currentEditionId) return;
    setBusy(true);
    try {
      await apiSend("/api/incomes", "POST", {
        editionId: currentEditionId,
        code: nextIncomeCode(incomes ?? []),
        category: incForm.category,
        title: incForm.title.trim(),
        description: incForm.description,
        amount: toMinor(Number(incForm.amount) || 0),
        currency: incForm.currency,
        method: incForm.method,
        payer: incForm.payer,
        incomeDate: incForm.incomeDate ? new Date(incForm.incomeDate).toISOString() : undefined,
        status: incForm.status,
        receiptNo: incForm.receiptNo,
        approvedBy: incForm.approvedBy,
        notes: incForm.notes,
      });
      toast({
        title: t("accounting.incomeSaved"),
        description: `${incForm.title.trim()} — ${fmtMoneyMajor(Number(incForm.amount), incForm.currency)} ${t("accounting.incomeSavedToLedger")}`,
      });
      setIncOpen(false);
      setIncForm(EMPTY_INCOME_FORM);
      refreshAll();
    } catch (err) {
      toast({ title: t("accounting.incomeSaveFailed"), description: err instanceof Error ? err.message : "Hata", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const submitQuickIncome = async () => {
    if (!currentEditionId) return;
    setBusy(true);
    try {
      await apiSend("/api/incomes", "POST", {
        editionId: currentEditionId,
        code: nextIncomeCode(incomes ?? []),
        category: incQuick.category,
        title: incQuick.title.trim(),
        description: "Hızlı tahsilat — anında deftere işlendi.",
        amount: toMinor(Number(incQuick.amount) || 0),
        currency: "TRY",
        method: incQuick.method,
        payer: incQuick.payer,
        incomeDate: new Date().toISOString(),
        status: "RECEIVED",
        approvedBy: "Hızlı Tahsilat",
      });
      toast({ title: t("accounting.quickIncomeSaved"), description: `${incQuick.title.trim()} — ${fmtMoneyMajor(Number(incQuick.amount))}` });
      setIncQuickOpen(false);
      setIncQuick(EMPTY_QUICK_INCOME);
      refreshAll();
    } catch (err) {
      toast({ title: t("accounting.quickIncomeSaveFailed"), description: err instanceof Error ? err.message : "Hata", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  // ── render ──

  return (
    <div className="space-y-5">
      <PageHeader title={t("accounting.title")} desc={t("accounting.desc")}>
        <Button variant="outline" className="border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100 hover:text-amber-900" onClick={openQuick}>
          <Icons.Zap className="size-4" /> {t("accounting.quickExpense")}
        </Button>
        <Button variant="outline" className="border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 hover:text-emerald-900" onClick={openQuickIncome}>
          <Icons.Banknote className="size-4" /> {t("accounting.quickIncome")}
        </Button>
        <Button className="bg-emerald-600 text-white hover:bg-emerald-700" onClick={openNewIncome}>
          <Icons.Plus className="size-4" /> {t("accounting.newIncome")}
        </Button>
        <Button onClick={openNew}>
          <Icons.Plus className="size-4" /> {t("accounting.newExpense")}
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" aria-label={t("accounting.excelAria")}>
              <Icons.FileSpreadsheet className="size-4 text-emerald-600" /> {t("accounting.excel")}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
            <DropdownMenuLabel className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Icons.FileSpreadsheet className="size-3.5" /> {t("accounting.excelLabel")}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => downloadExport("ledger", "xlsx")}>
              <Icons.TableProperties className="size-4" /> {t("accounting.excelLedger")}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => downloadExport("income", "xlsx")}>
              <Icons.HandCoins className="size-4" /> {t("accounting.excelIncome")}
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => downloadExport("expense", "xlsx")}>
              <Icons.ReceiptText className="size-4" /> {t("accounting.excelExpense")}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => downloadExport("ledger", "csv")}>
              <Icons.Braces className="size-4" /> {t("accounting.excelCsv")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </PageHeader>

      {/* Üst KPI sırası — 8 kart: tahsilat, manuel gelir, bekleyen, gider, planlanan, net, alacak, planlanan gelir */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
        <KpiCard label={t("accounting.kpiCollected")} value={fmtMoney(sum?.incomeTotal ?? 0)} sub={t("accounting.kpiCollectedSub", { online: sum?.paymentCount ?? 0, manual: sum?.incomeCount ?? 0 })} tone="emerald" icon={<Icons.Banknote className="size-4" />} />
        <KpiCard label={t("accounting.kpiManual")} value={fmtMoney(sum?.manualIncomeTotal ?? 0)} sub={t("accounting.kpiManualSub", { amount: fmtMoney(sum?.plannedIncome ?? 0) })} tone="teal" icon={<Icons.HandCoins className="size-4" />} />
        <KpiCard label={t("accounting.kpiPending")} value={fmtMoney(sum?.pendingIncome ?? 0)} sub={t("accounting.kpiPendingSub", { count: sum?.pendingCount ?? 0, orders: acc?.receivable.openOrders ?? 0 })} tone="amber" icon={<Icons.Hourglass className="size-4" />} />
        <KpiCard label={t("accounting.kpiExpense")} value={fmtMoney(sum?.expenseTotal ?? 0)} sub={t("accounting.kpiExpenseSub", { count: sum?.expenseCount ?? 0 })} tone="rose" icon={<Icons.ReceiptText className="size-4" />} />
        <KpiCard label={t("accounting.kpiPlannedExpense")} value={fmtMoney(sum?.plannedExpense ?? 0)} sub={t("accounting.kpiPlannedExpenseSub")} tone="violet" icon={<Icons.NotebookText className="size-4" />} />
        <KpiCard
          label={t("accounting.kpiNet")}
          value={<span className={net >= 0 ? "text-emerald-600" : "text-rose-600"}>{fmtMoney(net)}</span>}
          sub={sum && sum.margin !== null ? t("accounting.kpiNetSub", { margin: sum.margin }) : t("accounting.kpiNetSubFallback")}
          tone={net >= 0 ? "emerald" : "rose"}
          icon={<NetIcon className="size-4" />}
        />
        <KpiCard label={t("accounting.kpiReceivable")} value={fmtMoney(acc?.receivable.amount ?? 0)} sub={t("accounting.kpiReceivableSub", { count: acc?.receivable.openOrders ?? 0 })} tone="amber" icon={<Icons.Coins className="size-4" />} />
        <KpiCard label={t("accounting.kpiIncomeItems")} value={sum?.incomeCount ?? 0} sub={t("accounting.kpiIncomeItemsSub")} tone="emerald" icon={<Icons.Landmark className="size-4" />} />
      </div>

      <Tabs defaultValue="defter" className="gap-4">
        {/* 4. sekmeyle birlikte mobilde taşma — form-center ile aynı konvansiyon (h-auto flex-wrap) */}
        <TabsList className="h-auto flex-wrap">
          <TabsTrigger value="defter"><Icons.BookOpen className="size-4" /> {t("accounting.tabLedger")}</TabsTrigger>
          <TabsTrigger value="incomes"><Icons.HandCoins className="size-4" /> {t("accounting.tabIncomes")}</TabsTrigger>
          <TabsTrigger value="expenses"><Icons.ReceiptText className="size-4" /> {t("accounting.tabExpenses")}</TabsTrigger>
          <TabsTrigger value="breakdown"><Icons.ChartBar className="size-4" /> {t("accounting.tabBreakdown")}</TabsTrigger>
          <TabsTrigger value="recon"><Icons.FileCheck className="size-4" /> {t("accounting.tabRecon")}</TabsTrigger>
        </TabsList>

        {/* ── TAB: Genel Defter ── */}
        <TabsContent value="defter" className="space-y-4">
          <SectionCard
            title={t("accounting.ledgerTitle")}
            desc={t("accounting.ledgerDesc")}
            action={
              <Select value={kindFilter} onValueChange={setKindFilter}>
                <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">{t("accounting.ledgerAll")}</SelectItem>
                  <SelectItem value="INCOME">{t("accounting.ledgerIncomeOnline")}</SelectItem>
                  <SelectItem value="MANUAL_INCOME">{t("accounting.ledgerManualIncome")}</SelectItem>
                  <SelectItem value="EXPENSE">{t("accounting.ledgerExpense")}</SelectItem>
                  <SelectItem value="RECEIVABLE">{t("accounting.ledgerReceivable")}</SelectItem>
                </SelectContent>
              </Select>
            }
          >
            {loading ? <Loading rows={6} /> : error ? <ErrorState message={error} onRetry={reload} /> : ledger.length === 0 ? (
              <EmptyState title={t("accounting.ledgerEmpty")} desc={t("accounting.ledgerEmptyDesc")} />
            ) : (
              <>
                <div className="maven-scroll max-h-96 overflow-y-auto rounded-lg border">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 z-10 bg-card text-left text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2 font-medium">{t("accounting.colDate")}</th>
                        <th className="px-3 py-2 font-medium">{t("accounting.colDescription")}</th>
                        <th className="hidden px-3 py-2 font-medium md:table-cell">{t("accounting.colReference")}</th>
                        <th className="hidden px-3 py-2 font-medium sm:table-cell">{t("accounting.colMethod")}</th>
                        <th className="px-3 py-2 font-medium">{t("accounting.colStatus")}</th>
                        <th className="px-3 py-2 text-right font-medium">{t("accounting.colAmount")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ledger.map((r) => (
                        <tr key={`${r.kind}-${r.id}`} className="border-t transition hover:bg-muted/40">
                          <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">{fmtDateTime(r.date)}</td>
                          <td className="max-w-44 truncate px-3 py-2 font-medium md:max-w-64">{r.description}</td>
                          <td className="hidden px-3 py-2 font-mono text-[11px] text-muted-foreground md:table-cell">{r.ref ?? "—"}</td>
                          <td className="hidden whitespace-nowrap px-3 py-2 text-muted-foreground sm:table-cell">
                            {r.kind === "EXPENSE" ? tLabel(EXPENSE_PAYMENT_METHOD, r.method) : tLabel(PAYMENT_METHODS, r.method)}
                          </td>
                          <td className="px-3 py-2"><StatusBadge map={ledgerStatusMap} value={r.status} /></td>
                          <td className={`whitespace-nowrap px-3 py-2 text-right font-semibold tabular-nums ${r.kind === "INCOME" || r.kind === "MANUAL_INCOME" ? "text-emerald-600" : r.kind === "EXPENSE" ? "text-rose-600" : "text-amber-600"}`}>
                            {r.kind === "INCOME" || r.kind === "MANUAL_INCOME" ? `+${fmtMoney(r.amount, r.currency)}` : r.kind === "EXPENSE" ? `−${fmtMoney(r.amount, r.currency)}` : t("accounting.amountPending", { amount: fmtMoney(r.amount, r.currency) })}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {/* alt toplam — görünür filtrede */}
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-muted/50 px-3 py-2 text-xs">
                  <span className="text-muted-foreground">{t("accounting.showingRows", { count: ledger.length })}</span>
                  <span className="flex flex-wrap gap-3">
                    <span className="font-medium text-emerald-700">{t("accounting.sumIncome")} +{fmtMoney(ledgerIncome)}</span>
                    <span className="font-medium text-rose-700">{t("accounting.sumExpense")} −{fmtMoney(ledgerExpense)}</span>
                  </span>
                </div>
              </>
            )}
          </SectionCard>
        </TabsContent>

        {/* ── TAB: Gider Kalemleri ── */}
        <TabsContent value="expenses" className="space-y-4">
          <SectionCard
            title={t("accounting.expensesTitle")}
            desc={t("accounting.expensesDesc")}
            action={
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" onClick={() => setExpenseViewMode((m) => (m === "table" ? "cards" : "table"))}>
                  {expenseViewMode === "table" ? <Icons.LayoutGrid className="size-3.5 mr-1" /> : <Icons.Table className="size-3.5 mr-1" />}
                  {expenseViewMode === "table" ? "Kart Görünümü" : "Tablo Görünümü"}
                </Button>
                <Button size="sm" variant="outline" onClick={() => setBulkExpenseOpen(true)}>
                  <Icons.ClipboardPaste className="size-3.5 mr-1" /> Toplu Yapıştır
                </Button>
                <Button size="sm" variant="outline" onClick={openNew}>
                  <Icons.Plus className="size-3.5 mr-1" /> {t("accounting.newExpense")}
                </Button>
              </div>
            }
          >
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <Select value={expStatus} onValueChange={setExpStatus}>
                <SelectTrigger className="w-full sm:w-44"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">{t("accounting.allStatuses")}</SelectItem>
                  {Object.entries(EXPENSE_STATUS).map(([k]) => <SelectItem key={k} value={k}>{expStatusMap[k]}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={expCategory} onValueChange={setExpCategory}>
                <SelectTrigger className="w-full sm:w-48"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">{t("accounting.allCategories")}</SelectItem>
                  {Object.entries(EXPENSE_CATEGORY).map(([k]) => <SelectItem key={k} value={k}>{expCategoryMap[k]}</SelectItem>)}
                </SelectContent>
              </Select>
              <div className="relative flex-1">
                <Icons.Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input value={expSearch} onChange={(e) => setExpSearch(e.target.value)} placeholder={t("accounting.searchExpense")} className="pl-8" />
              </div>
            </div>

            {/* Hızlı Satır Ekleme (Enter tuşu ile anında kayıt) */}
            <div className="mt-3">
              <QuickAddRow
                columns={[
                  { key: "title", placeholder: "Gider Başlığı / Fatura Açıklaması", width: "w-64" },
                  { key: "amount", placeholder: "Tutar (TL)", type: "number", width: "w-28" },
                  { key: "vendor", placeholder: "Tedarikçi Firma", width: "w-40" },
                  { key: "spentBy", placeholder: "Harcayan Kişi", width: "w-40" },
                ]}
                onAdd={async (values) => {
                  if (!currentEditionId || !values.title || !values.amount) return false;
                  try {
                    await apiSend("/api/expenses", "POST", {
                      editionId: currentEditionId,
                      code: nextExpenseCode(expenses ?? []),
                      category: values.category || "FIELD_EXPENSE",
                      title: String(values.title).trim(),
                      amount: toMinor(Number(values.amount) || 0),
                      currency: "TRY",
                      vendor: values.vendor ? String(values.vendor).trim() : undefined,
                      spentBy: values.spentBy ? String(values.spentBy).trim() : undefined,
                      paymentMethod: "COMPANY_CARD",
                      incurredAt: new Date().toISOString(),
                      status: "APPROVED",
                    });
                    toast({ title: "Gider Eklendi", description: `${values.title} — ${values.amount} TRY` });
                    refreshAll();
                    return true;
                  } catch (e: any) {
                    toast({ title: "Kayıt Başarısız", description: e.message, variant: "destructive" });
                    return false;
                  }
                }}
              />
            </div>

            <div className="mt-3">
              {loadingExpenses ? <Loading rows={4} /> : expError ? <ErrorState message={expError} onRetry={reloadExpenses} /> : filteredExpenses.length === 0 ? (
                <EmptyState title={t("accounting.expensesEmpty")} desc={t("accounting.expensesEmptyDesc")} />
              ) : expenseViewMode === "table" ? (
                <div className="overflow-x-auto rounded-lg border">
                  <table className="w-full text-left text-xs">
                    <thead className="border-b bg-muted/50 text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2 font-medium">Kod</th>
                        <th className="px-3 py-2 font-medium">Başlık / Açıklama</th>
                        <th className="px-3 py-2 font-medium">Tedarikçi</th>
                        <th className="px-3 py-2 font-medium">Harcayan</th>
                        <th className="px-3 py-2 font-medium">Kategori</th>
                        <th className="px-3 py-2 font-medium">Fiş/Fatura No</th>
                        <th className="px-3 py-2 font-medium">Durum</th>
                        <th className="px-3 py-2 text-right font-medium">Tutar</th>
                        <th className="px-3 py-2 text-center font-medium">İşlem</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {filteredExpenses.map((e) => (
                        <tr key={e.id} className="transition hover:bg-muted/30">
                          <td className="whitespace-nowrap px-3 py-2 font-mono text-[11px] text-muted-foreground">{e.code}</td>
                          <td className="min-w-48 px-3 py-2 font-medium">
                            <InlineEditableCell
                              value={e.title}
                              onSave={async (val) => {
                                try {
                                  await patchExpense(e.id, { title: val });
                                  return true;
                                } catch {
                                  return false;
                                }
                              }}
                            />
                          </td>
                          <td className="min-w-32 px-3 py-2 text-muted-foreground">
                            <InlineEditableCell
                              value={e.vendor ?? ""}
                              placeholder="—"
                              onSave={async (val) => {
                                try {
                                  await patchExpense(e.id, { vendor: val });
                                  return true;
                                } catch {
                                  return false;
                                }
                              }}
                            />
                          </td>
                          <td className="min-w-32 px-3 py-2 text-muted-foreground">
                            <InlineEditableCell
                              value={e.spentBy ?? ""}
                              placeholder="—"
                              onSave={async (val) => {
                                try {
                                  await patchExpense(e.id, { spentBy: val });
                                  return true;
                                } catch {
                                  return false;
                                }
                              }}
                            />
                          </td>
                          <td className="whitespace-nowrap px-3 py-2">
                            <Chip tone={categoryTone(e.category)}>{expCategoryMap[e.category] ?? e.category}</Chip>
                          </td>
                          <td className="whitespace-nowrap px-3 py-2 font-mono text-[11px]">
                            <InlineEditableCell
                              value={e.receiptNo ?? ""}
                              placeholder="—"
                              onSave={async (val) => {
                                try {
                                  await patchExpense(e.id, { receiptNo: val });
                                  return true;
                                } catch {
                                  return false;
                                }
                              }}
                            />
                          </td>
                          <td className="whitespace-nowrap px-3 py-2">
                            <StatusBadge map={expStatusMap} value={e.status} />
                          </td>
                          <td className="whitespace-nowrap px-3 py-2 text-right font-bold tabular-nums text-rose-600">
                            {fmtMoney(e.amount, e.currency)}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2 text-center">
                            <div className="flex items-center justify-center gap-1">
                              {(e.status === "PLANNED" || e.status === "PENDING_RECEIPT") && (
                                <Button size="sm" variant="ghost" className="h-7 px-2 text-emerald-600 hover:bg-emerald-50" onClick={() => patchExpense(e.id, { status: "APPROVED", approvedBy: "Muhasebe" })}>
                                  <Icons.Check className="size-3.5" />
                                </Button>
                              )}
                              {(e.status === "PLANNED" || e.status === "PENDING_RECEIPT" || e.status === "APPROVED") && (
                                <Button size="sm" variant="ghost" className="h-7 px-2 text-blue-600 hover:bg-blue-50" onClick={() => patchExpense(e.id, { status: "PAID" })}>
                                  <Icons.Banknote className="size-3.5" />
                                </Button>
                              )}
                              {e.status === "PAID" && e.paymentMethod === "PERSONAL_REIMBURSE" && (
                                <Button size="sm" variant="ghost" className="h-7 px-2 text-amber-600 hover:bg-amber-50" onClick={() => patchExpense(e.id, { status: "REIMBURSED" })}>
                                  <Icons.HandCoins className="size-3.5" />
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="maven-scroll max-h-96 space-y-3 overflow-y-auto pr-1">
                  {filteredExpenses.map((e) => (
                    <div key={e.id} className="rounded-xl border p-4 transition hover:border-primary/30">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-xs text-muted-foreground">{e.code}</span>
                        <StatusBadge map={expStatusMap} value={e.status} />
                        <Chip tone={categoryTone(e.category)}>{expCategoryMap[e.category] ?? e.category}</Chip>
                        <span className="ml-auto text-sm font-bold tabular-nums">{fmtMoney(e.amount, e.currency)}</span>
                      </div>
                      <p className="mt-1.5 text-sm font-semibold">
                        {e.title}
                        {e.vendor ? <span className="font-normal text-muted-foreground"> · {e.vendor}</span> : null}
                      </p>
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1"><Icons.CalendarDays className="size-3.5" /> {fmtDate(e.incurredAt)}</span>
                        {e.spentBy && <span className="inline-flex items-center gap-1"><Icons.UserRound className="size-3.5" /> {t("accounting.spentByPrefix")} {e.spentBy}</span>}
                        <span className="inline-flex items-center gap-1"><Icons.Wallet className="size-3.5" /> {expMethodMap[e.paymentMethod] ?? e.paymentMethod}</span>
                        {e.receiptNo && <Badge variant="outline" className="font-mono text-[11px]">{t("accounting.fisBadge")}: {e.receiptNo}</Badge>}
                      </div>
                      {e.description && <p className="mt-1 text-xs text-muted-foreground">{e.description}</p>}
                      {(e.status === "PLANNED" || e.status === "PENDING_RECEIPT" || e.status === "APPROVED" || (e.status === "PAID" && e.paymentMethod === "PERSONAL_REIMBURSE")) && (
                        <div className="mt-2.5 flex flex-wrap gap-2 border-t pt-2.5">
                          {(e.status === "PLANNED" || e.status === "PENDING_RECEIPT") && (
                            <>
                              <Button size="sm" variant="outline" disabled={busyId === e.id} onClick={() => patchExpense(e.id, { status: "APPROVED", approvedBy: "Muhasebe" })}>
                                <Icons.Check className="size-3.5" /> {t("accounting.approve")}
                              </Button>
                              <Button size="sm" variant="outline" disabled={busyId === e.id} onClick={() => patchExpense(e.id, { status: "PAID" })}>
                                <Icons.Banknote className="size-3.5" /> {t("accounting.markPaid")}
                              </Button>
                            </>
                          )}
                          {e.status === "APPROVED" && (
                            <Button size="sm" variant="outline" disabled={busyId === e.id} onClick={() => patchExpense(e.id, { status: "PAID" })}>
                              <Icons.Banknote className="size-3.5" /> {t("accounting.paid")}
                            </Button>
                          )}
                          {e.status === "PAID" && e.paymentMethod === "PERSONAL_REIMBURSE" && (
                            <Button size="sm" variant="outline" disabled={busyId === e.id} onClick={() => patchExpense(e.id, { status: "REIMBURSED" })}>
                              <Icons.HandCoins className="size-3.5" /> {t("accounting.reimburse")}
                            </Button>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </SectionCard>
        </TabsContent>

        {/* ── TAB: Gelir Kalemleri (Faz B) ── */}
        <TabsContent value="incomes" className="space-y-4">
          <SectionCard
            title={t("accounting.incomesTitle")}
            desc={t("accounting.incomesDesc")}
            action={
              <Button size="sm" variant="outline" className="border-emerald-300 text-emerald-800 hover:bg-emerald-50" onClick={openNewIncome}>
                <Icons.Plus className="size-3.5" /> {t("accounting.newIncome")}
              </Button>
            }
          >
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <Select value={incStatus} onValueChange={setIncStatus}>
                <SelectTrigger className="w-full sm:w-44"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">{t("accounting.allStatuses")}</SelectItem>
                  {Object.entries(INCOME_STATUS).map(([k]) => <SelectItem key={k} value={k}>{incStatusMap[k]}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={incCategory} onValueChange={setIncCategory}>
                <SelectTrigger className="w-full sm:w-44"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">{t("accounting.allCategories")}</SelectItem>
                  {Object.entries(INCOME_CATEGORY).map(([k]) => <SelectItem key={k} value={k}>{incCategoryMap[k]}</SelectItem>)}
                </SelectContent>
              </Select>
              <div className="relative flex-1">
                <Icons.Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input value={incSearch} onChange={(e) => setIncSearch(e.target.value)} placeholder={t("accounting.searchIncome")} className="pl-8" />
              </div>
            </div>

            <div className="mt-3">
              {loadingIncomes ? <Loading rows={4} /> : incError ? <ErrorState message={incError} onRetry={reloadIncomes} /> : filteredIncomes.length === 0 ? (
                <EmptyState title={t("accounting.incomesEmpty")} desc={t("accounting.incomesEmptyDesc")} />
              ) : (
                <div className="maven-scroll max-h-96 space-y-3 overflow-y-auto pr-1">
                  {filteredIncomes.map((e) => (
                    <div key={e.id} className="rounded-xl border p-4 transition hover:border-primary/30">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-xs text-muted-foreground">{e.code}</span>
                        <StatusBadge map={incStatusMap} value={e.status} />
                        <Chip tone="emerald">{incCategoryMap[e.category] ?? e.category}</Chip>
                        <span className="ml-auto text-sm font-bold tabular-nums text-emerald-700">+{fmtMoney(e.amount, e.currency)}</span>
                      </div>
                      <p className="mt-1.5 text-sm font-semibold">
                        {e.title}
                        {e.payer ? <span className="font-normal text-muted-foreground"> · {e.payer}</span> : null}
                      </p>
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1"><Icons.CalendarDays className="size-3.5" /> {fmtDate(e.incomeDate)}</span>
                        <span className="inline-flex items-center gap-1"><Icons.Wallet className="size-3.5" /> {incMethodMap[e.method] ?? e.method}</span>
                        {e.receiptNo && <Badge variant="outline" className="font-mono text-[11px]">{t("accounting.receiptBadge")}: {e.receiptNo}</Badge>}
                        {e.approvedBy && <span className="inline-flex items-center gap-1"><Icons.UserRoundCheck className="size-3.5" /> {e.approvedBy}</span>}
                      </div>
                      {e.description && <p className="mt-1 text-xs text-muted-foreground">{e.description}</p>}
                      {(e.status === "PLANNED" || e.status === "PENDING_RECEIPT" || e.status === "APPROVED") && (
                        <div className="mt-2.5 flex flex-wrap gap-2 border-t pt-2.5">
                          {e.status !== "APPROVED" && (
                            <Button size="sm" variant="outline" disabled={busyId === e.id} onClick={() => patchIncome(e.id, { status: "APPROVED", approvedBy: "Muhasebe" })}>
                              <Icons.Check className="size-3.5" /> {t("accounting.approve")}
                            </Button>
                          )}
                          {e.status === "APPROVED" && (
                            <Button size="sm" variant="outline" disabled={busyId === e.id} onClick={() => patchIncome(e.id, { status: "RECEIVED" })}>
                              <Icons.Banknote className="size-3.5" /> {t("accounting.collect")}
                            </Button>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </SectionCard>
        </TabsContent>

        {/* ── TAB: Kırılım & Analiz ── */}
        <TabsContent value="breakdown" className="space-y-4">
          {loading && !acc ? <Loading rows={6} /> : error ? <ErrorState message={error} onRetry={reload} /> : (
            <>
              <div className="grid gap-4 lg:grid-cols-2">
                <div className="space-y-4">
                  <SectionCard title={t("accounting.incomeCategories")} desc={t("accounting.incomeCategoriesDesc")}>
                    {incomeByCategory.length === 0 ? (
                      <EmptyState title={t("accounting.incomeCategoriesEmpty")} desc={t("accounting.incomeCategoriesEmptyDesc")} />
                    ) : (
                      <div className="space-y-3">
                        {incomeByCategory.map((row) => (
                          <BreakdownBar key={row.key} text={incCategoryMap[row.key] ?? row.key} count={row.count} total={row.total} max={maxIncomeCategory} barClass="bg-emerald-500" />
                        ))}
                      </div>
                    )}
                  </SectionCard>
                  <SectionCard title={t("accounting.incomeSources")} desc={t("accounting.incomeSourcesDesc")}>
                    {incomeBySource.length === 0 ? (
                      <EmptyState title={t("accounting.incomeSourcesEmpty")} desc={t("accounting.incomeSourcesEmptyDesc")} />
                    ) : (
                      <div className="space-y-3">
                        {incomeBySource.map((row) => (
                          <BreakdownBar key={row.key} text={payMethodMap[row.key] ?? row.key} count={row.count} total={row.total} max={maxIncomeSource} barClass="bg-teal-500" />
                        ))}
                      </div>
                    )}
                  </SectionCard>
                  <SectionCard title={t("accounting.expenseCategories")} desc={t("accounting.expenseCategoriesDesc")}>
                    {expenseByCategory.length === 0 ? (
                      <EmptyState title={t("accounting.expenseCategoriesEmpty")} desc={t("accounting.expenseCategoriesEmptyDesc")} />
                    ) : (
                      <div className="space-y-3">
                        {expenseByCategory.map((row) => (
                          <BreakdownBar
                            key={row.key}
                            text={expCategoryMap[row.key] ?? row.key}
                            count={row.count}
                            total={row.total}
                            max={maxExpenseCategory}
                            barClass={row.key === "FIELD_EXPENSE" ? "bg-amber-500" : "bg-rose-400"}
                          />
                        ))}
                      </div>
                    )}
                  </SectionCard>
                </div>
                <div className="space-y-4">
                  <SectionCard title={t("accounting.expenseStatuses")} desc={t("accounting.expenseStatusesDesc")}>
                    {expenseByStatus.length === 0 ? (
                      <EmptyState title={t("accounting.expenseStatusesEmpty")} desc={t("accounting.expenseStatusesEmptyDesc")} />
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {expenseByStatus.map((row) => (
                          <Chip key={row.key} tone={toneFromStatus(row.key)}>
                            {expStatusMap[row.key] ?? row.key} · {row.count} {t("accounting.items")} · {fmtMoney(row.total)}
                          </Chip>
                        ))}
                      </div>
                    )}
                  </SectionCard>
                  <SectionCard title={t("accounting.dailyFlow")} desc={t("accounting.dailyFlowDesc")}>
                    {daily.length === 0 ? (
                      <EmptyState title={t("accounting.dailyFlowEmpty")} />
                    ) : (
                      <>
                        <div className="flex h-28 items-end gap-[3px]">
                          {daily.map((d) => {
                            const dt = new Date(`${d.date}T00:00:00`);
                            const dd = String(dt.getDate()).padStart(2, "0");
                            const mm = String(dt.getMonth() + 1).padStart(2, "0");
                            return (
                              <div key={d.date} className="flex h-full min-w-0 flex-1 flex-col justify-end gap-[2px]" title={`${dd}.${mm} — ${fmtMoney(d.income)} / ${fmtMoney(d.expense)}`}>
                                <div className={`w-full rounded-t-[2px] bg-teal-500 ${d.income > 0 ? "" : "opacity-30"}`} style={{ height: Math.max(2, Math.round((d.income / dailyMax) * CHART_H)) }} />
                                <div className={`w-full rounded-b-[2px] bg-rose-500 ${d.expense > 0 ? "" : "opacity-30"}`} style={{ height: Math.max(2, Math.round((d.expense / dailyMax) * CHART_H)) }} />
                              </div>
                            );
                          })}
                        </div>
                        <div className="mt-3 flex flex-wrap items-center gap-4 border-t pt-2 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-teal-500" /> {t("accounting.dailyIncome")} {fmtMoney(dailyIncomeTotal)}</span>
                          <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-rose-500" /> {t("accounting.dailyExpense")} {fmtMoney(dailyExpenseTotal)}</span>
                        </div>
                      </>
                    )}
                  </SectionCard>
                </div>
              </div>

              <SectionCard title={t("accounting.reconNote")} desc={t("accounting.reconNoteDesc")}>
                <ul className="list-disc space-y-1.5 pl-4 text-xs text-muted-foreground">
                  <li>Net bakiye = tahsil edilen gelir − gerçekleşen gider (APPROVED / PAID / REIMBURSED kalemler); marj bu iki büyüklükten türetilir.</li>
                  <li>Planlanan gider (PLANNED / PENDING_RECEIPT) net&apos;e henüz yansımaz; onay ve ödeme tamamlandığında deftere işlenir ve net&apos;e etki eder.</li>
                  <li>RECEIVABLE satırları açık sipariş bakiyeleridir; tahsil edilince INCOME&apos;a döner ve bekleyen tahsilat tutarından düşer.</li>
                </ul>
                <Separator className="my-3" />
                <p className="text-xs text-muted-foreground">
                  Defter son 60 hareketi gösterir; tüm kırılımlar edisyon bazlı hesaplanır. Kalemler kendi para birimiyle listelenir, kur dönüştürmesi yapılmaz.
                </p>
              </SectionCard>
            </>
          )}
        </TabsContent>

        {/* ── TAB: Mutabakat ── */}
        <TabsContent value="recon" className="space-y-4">
          {loadingRecon && !recon ? <Loading rows={6} /> : reconError ? <ErrorState message={reconError} onRetry={reloadRecon} /> : recon ? (
            <>
              {/* Kapanış Hazırlığı — engelleyici (kırmızı) vs uyarı (amber) ayrımı */}
              <SectionCard
                title={t("accounting.reconReady")}
                desc={t("accounting.reconReadyDesc")}
                action={
                  <div className="flex items-center gap-2">
                    <span className="hidden text-xs text-muted-foreground md:inline">{t("accounting.generated")} {fmtDateTime(recon.generatedAt)}</span>
                    <Button size="sm" variant="outline" onClick={reloadRecon} disabled={loadingRecon}>
                      <Icons.RefreshCw className={`size-3.5 ${loadingRecon ? "animate-spin" : ""}`} /> {t("accounting.refresh")}
                    </Button>
                  </div>
                }
              >
                <div className={`rounded-lg border p-4 ${recon.readiness.ok ? "border-emerald-200 bg-emerald-50/60" : "border-rose-200 bg-rose-50/60"}`}>
                  <div className="flex items-center gap-2">
                    {recon.readiness.ok
                      ? <Icons.CheckCircle2 className="size-5 shrink-0 text-emerald-600" />
                      : <Icons.AlertTriangle className="size-5 shrink-0 text-rose-600" />}
                    <p className={`text-sm font-semibold ${recon.readiness.ok ? "text-emerald-700" : "text-rose-700"}`}>
                      {recon.readiness.ok ? t("accounting.reconReadyOk") : t("accounting.reconReadyBlocked")}
                    </p>
                  </div>
                  {recon.readiness.blockers.length > 0 && (
                    <div className="mt-3">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-rose-700">{t("accounting.reconBlockers")} ({recon.readiness.blockers.length})</p>
                      <ul className="mt-1 space-y-1">
                        {recon.readiness.blockers.map((b) => (
                          <li key={b} className="flex items-start gap-1.5 text-xs text-rose-700">
                            <Icons.OctagonAlert className="mt-0.5 size-3.5 shrink-0" /> {b}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {recon.readiness.warnings.length > 0 && (
                    <div className="mt-2">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-700">{t("accounting.reconWarnings")} ({recon.readiness.warnings.length})</p>
                      <ul className="mt-1 space-y-1">
                        {recon.readiness.warnings.map((w) => (
                          <li key={w} className="flex items-start gap-1.5 text-xs text-amber-700">
                            <Icons.TriangleAlert className="mt-0.5 size-3.5 shrink-0" /> {w}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </SectionCard>

              {/* Sipariş özeti — mini durum çipleri */}
              <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-card px-4 py-3 shadow-sm">
                <span className="mr-1 inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <Icons.ShoppingCart className="size-3.5" /> {t("accounting.ordersSummary")}
                </span>
                <Chip tone="neutral">{t("accounting.ordersTotal")} · {recon.orders.total}</Chip>
                <Chip tone="emerald">{t("accounting.ordersPaid")} · {recon.orders.paid}</Chip>
                <Chip tone="amber">{t("accounting.ordersOpen")} · {recon.orders.open}</Chip>
                <Chip tone="amber">{t("accounting.ordersPartial")} · {recon.orders.partiallyPaid}</Chip>
                <Chip tone="rose">{t("accounting.ordersCancelled")} · {recon.orders.cancelled}</Chip>
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                {/* Sipariş Tutarsızlıkları */}
                <SectionCard title={t("accounting.mismatchesTitle")} desc={t("accounting.mismatchesDesc")}>
                  {recon.orders.mismatches.length === 0 ? (
                    <ReconCleanState title={t("accounting.mismatchesClean")} desc={t("accounting.mismatchesCleanDesc")} />
                  ) : (
                    <div className="maven-scroll max-h-96 space-y-3 overflow-y-auto pr-1">
                      {recon.orders.mismatches.map((m, i) => (
                        <div key={`${m.orderNo}-${i}`} className="rounded-xl border border-rose-200 bg-rose-50/40 p-4">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-mono text-xs font-bold">{m.orderNo}</span>
                            <span className="min-w-0 truncate text-xs text-muted-foreground">{m.payer}</span>
                            <Badge variant="outline" className="ml-auto shrink-0 border-rose-200 bg-rose-50 font-semibold text-rose-700">
                              {t("accounting.mismatchDelta")} {m.delta > 0 ? "+" : ""}{fmtMoney(m.delta)}
                            </Badge>
                          </div>
                          <p className="mt-1.5 text-sm font-medium">{m.issue}</p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {t("accounting.mismatchExpected")} <span className="font-semibold text-foreground">{fmtMoney(m.expected)}</span>
                            {" ≠ "}{t("accounting.mismatchActual")} <span className="font-semibold text-foreground">{fmtMoney(m.actual)}</span>
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </SectionCard>

                {/* Doğrulanmamış Tahsilatlar (§38) */}
                <SectionCard title={t("accounting.unverifiedTitle")} desc={t("accounting.unverifiedDesc")}>
                  {recon.unverifiedPayments.length === 0 ? (
                    <ReconCleanState title={t("accounting.unverifiedClean")} desc={t("accounting.unverifiedCleanDesc")} />
                  ) : (
                    <div className="maven-scroll max-h-96 space-y-3 overflow-y-auto pr-1">
                      {recon.unverifiedPayments.map((p) => (
                        <div key={p.id} className="rounded-xl border border-amber-200 bg-amber-50/40 p-4">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-mono text-xs font-bold">{p.orderNo}</span>
                            <span className="min-w-0 truncate text-xs text-muted-foreground">{p.payer}</span>
                            <span className="ml-auto text-sm font-bold tabular-nums">{fmtMoney(p.amount, p.currency)}</span>
                          </div>
                          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                            <span className="inline-flex items-center gap-1"><Icons.Wallet className="size-3.5" /> {payMethodMap[p.source] ?? p.source}</span>
                            <span className="inline-flex items-center gap-1"><Icons.CalendarDays className="size-3.5" /> {fmtDateTime(p.paidAt)}</span>
                          </div>
                          {p.reason && (
                            <p className="mt-2 inline-flex items-center gap-1 rounded-md border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[11px] font-medium text-amber-700">
                              <Icons.TriangleAlert className="size-3" /> {p.reason}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </SectionCard>
              </div>

              {/* Gider Denetimi — 4 denetim kartı */}
              <SectionCard title={t("accounting.auditTitle")} desc={t("accounting.auditDesc")}>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <KpiCard label={t("accounting.auditAwaitingReceipt")} value={recon.expenseAudit.awaitingReceipt.count} sub={fmtMoney(recon.expenseAudit.awaitingReceipt.amount)} tone="amber" icon={<Icons.ReceiptText className="size-4" />} />
                  <KpiCard
                    label={t("accounting.auditAwaitingOld")}
                    value={recon.expenseAudit.awaitingOld.count}
                    sub={fmtMoney(recon.expenseAudit.awaitingOld.amount)}
                    tone={recon.expenseAudit.awaitingOld.count > 0 ? "amber" : "neutral"}
                    icon={<Icons.Clock4 className="size-4" />}
                  />
                  <KpiCard label={t("accounting.auditApprovedUnpaid")} value={recon.expenseAudit.approvedUnpaid.count} sub={fmtMoney(recon.expenseAudit.approvedUnpaid.amount)} tone="violet" icon={<Icons.CircleDollarSign className="size-4" />} />
                  <KpiCard label={t("accounting.auditReimbursable")} value={recon.expenseAudit.reimbursable.count} sub={fmtMoney(recon.expenseAudit.reimbursable.amount)} tone="teal" icon={<Icons.HandCoins className="size-4" />} />
                </div>
              </SectionCard>

              <div className="grid gap-4 lg:grid-cols-2">
                {/* Açık Alacak Yaşlandırması */}
                <SectionCard title={t("accounting.agingTitle")} desc={t("accounting.agingDesc", { count: recon.aging.openOrders })}>
                  <div className="grid gap-3 sm:grid-cols-3">
                    {recon.aging.buckets.map((b, i) => {
                      const warn = i === 2 && b.amount > 0;
                      return (
                        <div key={b.label} className={`rounded-xl border p-4 ${warn ? "border-rose-300 bg-rose-50/60" : "border-border bg-muted/30"}`}>
                          <div className="flex items-center justify-between gap-1">
                            <span className={`text-xs font-medium ${warn ? "text-rose-700" : "text-muted-foreground"}`}>{b.label}</span>
                            {warn && <Icons.TriangleAlert className="size-3.5 shrink-0 text-rose-500" />}
                          </div>
                          <p className={`mt-1 text-xl font-semibold tracking-tight tabular-nums ${warn ? "text-rose-700" : ""}`}>{fmtMoney(b.amount)}</p>
                          <p className="text-xs text-muted-foreground">{t("accounting.agingOrders", { count: b.count })}</p>
                        </div>
                      );
                    })}
                  </div>
                  <Separator className="my-3" />
                  <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                    <span className="text-muted-foreground">{t("accounting.agingTotal")}</span>
                    <span className="font-bold tabular-nums">{fmtMoney(recon.aging.totalReceivable)}</span>
                  </div>
                </SectionCard>

                {/* Son 6 Ay Dönem Özeti */}
                <SectionCard title={t("accounting.periodTitle")} desc={t("accounting.periodDesc")}>
                  {reconPeriod.length === 0 ? (
                    <EmptyState title={t("accounting.periodEmpty")} desc={t("accounting.periodEmptyDesc")} />
                  ) : (
                    <div className="maven-scroll max-h-96 overflow-y-auto rounded-lg border">
                      <table className="w-full text-xs">
                        <thead className="sticky top-0 z-10 bg-card text-left text-muted-foreground">
                          <tr>
                            <th className="px-3 py-2 font-medium">{t("accounting.colMonth")}</th>
                            <th className="px-3 py-2 text-right font-medium">{t("accounting.dailyIncome").replace(":", "")}</th>
                            <th className="px-3 py-2 text-right font-medium">{t("accounting.dailyExpense").replace(":", "")}</th>
                            <th className="px-3 py-2 text-right font-medium">{t("accounting.colNet")}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {reconPeriod.map((p) => (
                            <tr key={p.month} className="border-t transition hover:bg-muted/40">
                              <td className="whitespace-nowrap px-3 py-2 font-medium">{monthLabel(p.month)}</td>
                              <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-emerald-600">{fmtMoney(p.income)}</td>
                              <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-rose-600">{fmtMoney(p.expense)}</td>
                              <td className="whitespace-nowrap px-3 py-2 text-right">
                                <span className={`inline-flex items-center justify-end gap-1.5 font-semibold tabular-nums ${p.net >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                                  <span
                                    className={`hidden h-1 rounded-full sm:inline-block ${p.net >= 0 ? "bg-emerald-400" : "bg-rose-400"}`}
                                    style={{ width: `${Math.max(2, Math.round((Math.abs(p.net) / periodMaxNet) * 56))}px` }}
                                  />
                                  {p.net >= 0 ? "+" : ""}{fmtMoney(p.net)}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr className="border-t bg-muted/50">
                            <td className="px-3 py-2 font-semibold">{t("accounting.total")}</td>
                            <td className="whitespace-nowrap px-3 py-2 text-right font-semibold tabular-nums">{fmtMoney(periodIncome)}</td>
                            <td className="whitespace-nowrap px-3 py-2 text-right font-semibold tabular-nums">{fmtMoney(periodExpense)}</td>
                            <td className={`whitespace-nowrap px-3 py-2 text-right font-bold tabular-nums ${periodNet >= 0 ? "text-emerald-700" : "text-rose-700"}`}>{fmtMoney(periodNet)}</td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  )}
                </SectionCard>
              </div>
            </>
          ) : (
            <EmptyState title={t("accounting.reconDataEmpty")} desc={t("accounting.reconDataEmptyDesc")} />
          )}
        </TabsContent>
      </Tabs>

      {/* Yeni Gider dialogu — tam form */}
      <Dialog open={newOpen} onOpenChange={setNewOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t("accounting.newExpenseTitle")}</DialogTitle>
            <DialogDescription>{t("accounting.newExpenseDesc")}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="exp-title">{t("accounting.fTitle")}</Label>
              <Input id="exp-title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder={t("accounting.fTitlePh")} />
            </div>
            <div className="space-y-1.5">
              <Label>{t("accounting.fCategory")}</Label>
              <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                <SelectTrigger><SelectValue placeholder={t("accounting.selectOne")} /></SelectTrigger>
                <SelectContent>
                  {Object.entries(EXPENSE_CATEGORY).map(([k, v]) => <SelectItem key={k} value={k}>{expCategoryMap[k]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{t("accounting.fAmount")}</Label>
              <Input type="number" min={0} step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="0" />
            </div>
            <div className="space-y-1.5">
              <Label>{t("accounting.fCurrency")}</Label>
              <Select value={form.currency} onValueChange={(v) => setForm({ ...form, currency: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{t("accounting.fPayMethod")}</Label>
              <Select value={form.paymentMethod} onValueChange={(v) => setForm({ ...form, paymentMethod: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(EXPENSE_PAYMENT_METHOD).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{t("accounting.fVendor")}</Label>
              <Input value={form.vendor} onChange={(e) => setForm({ ...form, vendor: e.target.value })} placeholder={t("accounting.fVendorPh")} />
            </div>
            <div className="space-y-1.5">
              <Label>{t("accounting.fSpentBy")}</Label>
              <Input value={form.spentBy} onChange={(e) => setForm({ ...form, spentBy: e.target.value })} placeholder={t("accounting.fSpentByPh")} />
            </div>
            <div className="space-y-1.5">
              <Label>{t("accounting.fExpenseDate")}</Label>
              <Input type="date" value={form.incurredAt} onChange={(e) => setForm({ ...form, incurredAt: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>{t("accounting.fStatus")}</Label>
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(EXPENSE_STATUS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="exp-desc">{t("accounting.fDescription")}</Label>
              <Textarea id="exp-desc" rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>{t("accounting.fisBadge")} No</Label>
              <Input value={form.receiptNo} onChange={(e) => setForm({ ...form, receiptNo: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>{t("accounting.fNotes")}</Label>
              <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewOpen(false)} disabled={busy}>{t("common.cancel")}</Button>
            <Button onClick={submitNewExpense} disabled={busy || !form.title.trim() || !form.category || !(Number(form.amount) > 0)}>
              {busy ? t("common.saving") : t("accounting.saveExpense")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Hızlı Saha Harcaması dialogu — kategori/durum sabit */}
      <Dialog open={quickOpen} onOpenChange={setQuickOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("accounting.quickExpenseTitle")}</DialogTitle>
            <DialogDescription>Kategori &quot;Saha Harcaması&quot; olarak onaylı kaydedilir ve doğrudan deftere işlenir; fiş sonradan eklenebilir.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="quick-title">{t("accounting.fTitle")}</Label>
              <Input id="quick-title" value={quick.title} onChange={(e) => setQuick({ ...quick, title: e.target.value })} placeholder={t("accounting.fQuickExpenseTitlePh")} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>{t("accounting.fAmount")}</Label>
                <Input type="number" min={0} value={quick.amount} onChange={(e) => setQuick({ ...quick, amount: e.target.value })} placeholder="0" />
              </div>
              <div className="space-y-1.5">
                <Label>Harcayan</Label>
                <Input value={quick.spentBy} onChange={(e) => setQuick({ ...quick, spentBy: e.target.value })} placeholder={t("accounting.fSpentByShort")} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Ödeme Yöntemi</Label>
              <Select value={quick.paymentMethod} onValueChange={(v) => setQuick({ ...quick, paymentMethod: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {QUICK_METHODS.map((m) => <SelectItem key={m} value={m}>{expMethodMap[m]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <p className="text-xs text-muted-foreground">{t("accounting.quickExpenseNote")}</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setQuickOpen(false)} disabled={busy}>{t("common.cancel")}</Button>
            <Button onClick={submitQuickExpense} disabled={busy || !quick.title.trim() || !(Number(quick.amount) > 0)}>
              {busy ? t("common.saving") : t("accounting.saveHarcama")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Yeni Gelir dialogu — 12 alanlı tam form (Faz B) */}
      <Dialog open={incOpen} onOpenChange={setIncOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{t("accounting.newIncomeTitle")}</DialogTitle>
            <DialogDescription>{t("accounting.newIncomeDesc")}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="inc-title">{t("accounting.fTitle")}</Label>
              <Input id="inc-title" value={incForm.title} onChange={(e) => setIncForm({ ...incForm, title: e.target.value })} placeholder={t("accounting.fIncomeTitlePh")} />
            </div>
            <div className="space-y-1.5">
              <Label>{t("accounting.fCategory")}</Label>
              <Select value={incForm.category} onValueChange={(v) => setIncForm({ ...incForm, category: v })}>
                <SelectTrigger><SelectValue placeholder={t("accounting.selectOne")} /></SelectTrigger>
                <SelectContent>
                  {Object.entries(INCOME_CATEGORY).map(([k, v]) => <SelectItem key={k} value={k}>{incCategoryMap[k]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{t("accounting.fAmount")}</Label>
              <Input type="number" min={0} step="0.01" value={incForm.amount} onChange={(e) => setIncForm({ ...incForm, amount: e.target.value })} placeholder="0" />
            </div>
            <div className="space-y-1.5">
              <Label>Para Birimi</Label>
              <Select value={incForm.currency} onValueChange={(v) => setIncForm({ ...incForm, currency: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{t("accounting.fMethod")}</Label>
              <Select value={incForm.method} onValueChange={(v) => setIncForm({ ...incForm, method: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(INCOME_METHOD).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{t("accounting.fPayer")}</Label>
              <Input value={incForm.payer} onChange={(e) => setIncForm({ ...incForm, payer: e.target.value })} placeholder={t("accounting.fPayerPh")} />
            </div>
            <div className="space-y-1.5">
              <Label>{t("accounting.fIncomeDate")}</Label>
              <Input type="date" value={incForm.incomeDate} onChange={(e) => setIncForm({ ...incForm, incomeDate: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Durum</Label>
              <Select value={incForm.status} onValueChange={(v) => setIncForm({ ...incForm, status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(INCOME_STATUS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{t("accounting.fReceiptNo")}</Label>
              <Input value={incForm.receiptNo} onChange={(e) => setIncForm({ ...incForm, receiptNo: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>{t("accounting.fApprovedBy")}</Label>
              <Input value={incForm.approvedBy} onChange={(e) => setIncForm({ ...incForm, approvedBy: e.target.value })} placeholder={t("accounting.fApprovedByPh")} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="inc-desc">{t("accounting.fDescription")}</Label>
              <Textarea id="inc-desc" rows={2} value={incForm.description} onChange={(e) => setIncForm({ ...incForm, description: e.target.value })} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Not</Label>
              <Input value={incForm.notes} onChange={(e) => setIncForm({ ...incForm, notes: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIncOpen(false)} disabled={busy}>{t("common.cancel")}</Button>
            <Button className="bg-emerald-600 text-white hover:bg-emerald-700" onClick={submitNewIncome} disabled={busy || !incForm.title.trim() || !(Number(incForm.amount) > 0)}>
              {busy ? t("common.saving") : t("accounting.saveIncome")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Hızlı Tahsilat dialogu — doğrudan RECEIVED (Faz B) */}
      <Dialog open={incQuickOpen} onOpenChange={setIncQuickOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("accounting.quickIncomeTitle")}</DialogTitle>
            <DialogDescription>{t("accounting.quickIncomeDesc")}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="qinc-title">{t("accounting.fTitle")}</Label>
              <Input id="qinc-title" value={incQuick.title} onChange={(e) => setIncQuick({ ...incQuick, title: e.target.value })} placeholder={t("accounting.fQuickIncomeTitlePh")} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>{t("accounting.fAmount")}</Label>
                <Input type="number" min={0} value={incQuick.amount} onChange={(e) => setIncQuick({ ...incQuick, amount: e.target.value })} placeholder="0" />
              </div>
              <div className="space-y-1.5">
                <Label>Ödeyen</Label>
                <Input value={incQuick.payer} onChange={(e) => setIncQuick({ ...incQuick, payer: e.target.value })} placeholder={t("accounting.fPayerShort")} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>{t("accounting.fCategory")}</Label>
                <Select value={incQuick.category} onValueChange={(v) => setIncQuick({ ...incQuick, category: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(INCOME_CATEGORY).map(([k, v]) => <SelectItem key={k} value={k}>{incCategoryMap[k]}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>{t("accounting.fMethod")}</Label>
                <Select value={incQuick.method} onValueChange={(v) => setIncQuick({ ...incQuick, method: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {["CASH", "POS", "BANK_TRANSFER", "ONLINE_CARD"].map((m) => <SelectItem key={m} value={m}>{incMethodMap[m]}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">{t("accounting.quickIncomeNote")}</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIncQuickOpen(false)} disabled={busy}>{t("common.cancel")}</Button>
            <Button className="bg-emerald-600 text-white hover:bg-emerald-700" onClick={submitQuickIncome} disabled={busy || !incQuick.title.trim() || !(Number(incQuick.amount) > 0)}>
              {busy ? t("common.saving") : t("accounting.saveCollect")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Toplu Gider Yapıştırma Modalı */}
      <BulkPasteDialog
        open={bulkExpenseOpen}
        onOpenChange={setBulkExpenseOpen}
        targetEntityName="Gider Kalemleri"
        availableColumns={[
          { key: "title", label: "Gider Başlığı / Açıklama", synonyms: ["title", "başlık", "açıklama", "gider", "tanım", "harcama"], required: true },
          { key: "amount", label: "Tutar (TL)", synonyms: ["amount", "tutar", "bedel", "fiyat", "ücret"], required: true },
          { key: "vendor", label: "Tedarikçi", synonyms: ["vendor", "tedarikçi", "firma", "satıcı", "kurum"] },
          { key: "spentBy", label: "Harcayan Kişi", synonyms: ["spentby", "harcayan", "personel", "ödeyen"] },
          { key: "category", label: "Kategori", synonyms: ["category", "kategori", "tür", "tip"] },
          { key: "receiptNo", label: "Fiş/Fatura No", synonyms: ["receiptno", "fiş", "fatura", "belge no", "makbuz"] },
        ]}
        onImport={async (parsedRows) => {
          if (!currentEditionId) return;
          let count = 0;
          for (const row of parsedRows) {
            if (!row.title || !row.amount) continue;
            try {
              await apiSend("/api/expenses", "POST", {
                editionId: currentEditionId,
                code: nextExpenseCode(expenses ?? []),
                category: row.category || "OTHER",
                title: String(row.title).trim(),
                amount: toMinor(Number(row.amount) || 0),
                currency: "TRY",
                vendor: row.vendor ? String(row.vendor).trim() : undefined,
                spentBy: row.spentBy ? String(row.spentBy).trim() : undefined,
                receiptNo: row.receiptNo ? String(row.receiptNo).trim() : undefined,
                paymentMethod: "COMPANY_CARD",
                incurredAt: new Date().toISOString(),
                status: "APPROVED",
              });
              count++;
            } catch (err) {
              console.error("Toplu gider ekleme hatası:", err);
            }
          }
          toast({ title: "Toplu Aktarım Başarılı", description: `${count} adet gider kalemi deftere işlendi.` });
          refreshAll();
          return { imported: count };
        }}
      />
    </div>
  );
}
