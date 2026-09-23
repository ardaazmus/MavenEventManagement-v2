"use client";
// Muhasebe — kayıt tahsilatları, bekleyen ödemeler ve saha/ek harcamalar tek defterde (§36: gelir ≠ gider ≠ alacak)
import { useMemo, useState } from "react";
import { listEntity, apiSend, apiGet } from "@/lib/client";
import { useApp } from "@/lib/store";
import { SectionCard, EmptyState, Loading, ErrorState, useApi, PageHeader, StatusBadge, Chip, KpiCard } from "../bits";
import { EXPENSE_STATUS, EXPENSE_CATEGORY, EXPENSE_PAYMENT_METHOD, PAYMENT_METHODS, STATUS_TONE, label, fmtDate, fmtDateTime, fmtMoney } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import * as Icons from "lucide-react";

// ─── Tipler ──────────────────────────────────────────────────────────────────

interface AccountingData {
  summary: { incomeTotal: number; pendingIncome: number; pendingCount: number; expenseTotal: number; plannedExpense: number; net: number; margin: number | null; paymentCount: number; expenseCount: number };
  receivable: { amount: number; openOrders: number };
  incomeBySource: { key: string; total: number; count: number }[];
  expenseByCategory: { key: string; total: number; count: number }[];
  expenseByStatus: { key: string; total: number; count: number }[];
  daily: { date: string; income: number; expense: number }[];
  ledger: { id: string; kind: "INCOME" | "EXPENSE" | "RECEIVABLE"; date: string; description: string; ref: string | null; method: string; status: string; amount: number; currency: string }[];
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

type ChipTone = "neutral" | "teal" | "amber" | "rose" | "violet" | "emerald";

// ─── Sabitler ────────────────────────────────────────────────────────────────

const CURRENCIES = ["TRY", "USD", "EUR"] as const;
const QUICK_METHODS = ["CASH", "COMPANY_CARD", "PERSONAL_REIMBURSE"] as const;

const EMPTY_EXPENSE_FORM: ExpenseForm = {
  title: "", category: "OTHER", amount: "", currency: "TRY", vendor: "", spentBy: "",
  paymentMethod: "COMPANY_CARD", incurredAt: "", status: "PENDING_RECEIPT", description: "", receiptNo: "", notes: "",
};

const EMPTY_QUICK_FORM: QuickForm = { title: "", amount: "", spentBy: "", paymentMethod: "CASH" };

// defterde ödeme + gider durumları karışık gelir — birleşik etiket haritası
const LEDGER_STATUS_LABEL: Record<string, string> = {
  SUCCEEDED: "Tahsil Edildi",
  PENDING: "Bekliyor",
  FAILED: "Başarısız",
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

  const [kindFilter, setKindFilter] = useState("ALL");
  const [expStatus, setExpStatus] = useState("ALL");
  const [expCategory, setExpCategory] = useState("ALL");
  const [expSearch, setExpSearch] = useState("");
  const [newOpen, setNewOpen] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);
  const [form, setForm] = useState<ExpenseForm>(EMPTY_EXPENSE_FORM);
  const [quick, setQuick] = useState<QuickForm>(EMPTY_QUICK_FORM);
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
  const ledgerIncome = useMemo(() => ledger.filter((r) => r.kind === "INCOME").reduce((a, r) => a + r.amount, 0), [ledger]);
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

  // kırılım ölçekleri
  const incomeBySource = acc?.incomeBySource ?? [];
  const expenseByCategory = acc?.expenseByCategory ?? [];
  const expenseByStatus = acc?.expenseByStatus ?? [];
  const daily = acc?.daily ?? [];
  const maxIncomeSource = Math.max(1, ...incomeBySource.map((r) => r.total));
  const maxExpenseCategory = Math.max(1, ...expenseByCategory.map((r) => r.total));
  const dailyMax = Math.max(1, ...daily.map((d) => Math.max(d.income, d.expense)));
  const dailyIncomeTotal = daily.reduce((a, d) => a + d.income, 0);
  const dailyExpenseTotal = daily.reduce((a, d) => a + d.expense, 0);
  const CHART_H = 112;

  // mutabakat: dönem özeti türevleri
  const reconPeriod = recon?.period ?? [];
  const periodIncome = reconPeriod.reduce((a, p) => a + p.income, 0);
  const periodExpense = reconPeriod.reduce((a, p) => a + p.expense, 0);
  const periodNet = periodIncome - periodExpense;
  const periodMaxNet = Math.max(1, ...reconPeriod.map((p) => Math.abs(p.net)));

  const refreshAll = () => { reload(); reloadExpenses(); bump(); };

  // ── aksiyonlar ──

  const patchExpense = async (id: string, body: { status: string; approvedBy?: string }) => {
    setBusyId(id);
    try {
      await apiSend(`/api/expenses/${id}`, "PUT", body);
      toast({ title: "Gider güncellendi", description: "Defter ve kırılımlar yenilendi." });
      refreshAll();
    } catch (err) {
      toast({ title: "Gider güncellenemedi", description: err instanceof Error ? err.message : "Hata", variant: "destructive" });
    } finally {
      setBusyId(null);
    }
  };

  const openNew = () => { setForm({ ...EMPTY_EXPENSE_FORM, incurredAt: todayStr() }); setNewOpen(true); };
  const openQuick = () => { setQuick(EMPTY_QUICK_FORM); setQuickOpen(true); };

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
        amount: Number(form.amount),
        currency: form.currency,
        vendor: form.vendor,
        spentBy: form.spentBy,
        paymentMethod: form.paymentMethod,
        incurredAt: form.incurredAt ? new Date(form.incurredAt).toISOString() : undefined,
        status: form.status,
        receiptNo: form.receiptNo,
        notes: form.notes,
      });
      toast({ title: "Gider kaydedildi", description: `${form.title.trim()} — ${fmtMoney(Number(form.amount), form.currency)} deftere işlendi.` });
      setNewOpen(false);
      setForm(EMPTY_EXPENSE_FORM);
      refreshAll();
    } catch (err) {
      toast({ title: "Gider kaydedilemedi", description: err instanceof Error ? err.message : "Hata", variant: "destructive" });
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
        amount: Number(quick.amount),
        currency: "TRY",
        spentBy: quick.spentBy,
        paymentMethod: quick.paymentMethod,
        incurredAt: new Date().toISOString(),
        status: "APPROVED",
        approvedBy: "Saha Onayı",
      });
      toast({ title: "Saha harcaması kaydedildi — deftere işlendi", description: `${quick.title.trim()} — ${fmtMoney(Number(quick.amount))}` });
      setQuickOpen(false);
      setQuick(EMPTY_QUICK_FORM);
      refreshAll();
    } catch (err) {
      toast({ title: "Saha harcaması kaydedilemedi", description: err instanceof Error ? err.message : "Hata", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  // ── render ──

  return (
    <div className="space-y-5">
      <PageHeader title="Muhasebe" desc="Kayıt tahsilatları, bekleyen ödemeler ve saha/ek harcamalar tek defterde — gelir ≠ gider ≠ alacak (§36)">
        <Button variant="outline" className="border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100 hover:text-amber-900" onClick={openQuick}>
          <Icons.Zap className="size-4" /> Hızlı Saha Harcaması
        </Button>
        <Button onClick={openNew}>
          <Icons.Plus className="size-4" /> Yeni Gider
        </Button>
      </PageHeader>

      {/* Üst KPI sırası */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-6">
        <KpiCard label="Tahsil Edilen" value={fmtMoney(sum?.incomeTotal ?? 0)} sub={`${sum?.paymentCount ?? 0} tahsilat`} tone="emerald" icon={<Icons.Banknote className="size-4" />} />
        <KpiCard label="Bekleyen Tahsilat" value={fmtMoney(sum?.pendingIncome ?? 0)} sub={`${sum?.pendingCount ?? 0} ödeme + ${acc?.receivable.openOrders ?? 0} açık sipariş`} tone="amber" icon={<Icons.Hourglass className="size-4" />} />
        <KpiCard label="Gerçekleşen Gider" value={fmtMoney(sum?.expenseTotal ?? 0)} sub={`${sum?.expenseCount ?? 0} kalem`} tone="rose" icon={<Icons.ReceiptText className="size-4" />} />
        <KpiCard label="Planlanan Gider" value={fmtMoney(sum?.plannedExpense ?? 0)} sub="onay/fiş bekleyen" tone="violet" icon={<Icons.NotebookText className="size-4" />} />
        <KpiCard
          label="Net Bakiye"
          value={<span className={net >= 0 ? "text-emerald-600" : "text-rose-600"}>{fmtMoney(net)}</span>}
          sub={sum && sum.margin !== null ? `%${sum.margin} marj` : "gelir − gerçekleşen gider"}
          tone={net >= 0 ? "emerald" : "rose"}
          icon={<NetIcon className="size-4" />}
        />
        <KpiCard label="Açık Alacak" value={fmtMoney(acc?.receivable.amount ?? 0)} sub={`${acc?.receivable.openOrders ?? 0} sipariş bakiyesi`} tone="amber" icon={<Icons.Coins className="size-4" />} />
      </div>

      <Tabs defaultValue="defter" className="gap-4">
        {/* 4. sekmeyle birlikte mobilde taşma — form-center ile aynı konvansiyon (h-auto flex-wrap) */}
        <TabsList className="h-auto flex-wrap">
          <TabsTrigger value="defter"><Icons.BookOpen className="size-4" /> Genel Defter</TabsTrigger>
          <TabsTrigger value="expenses"><Icons.ReceiptText className="size-4" /> Gider Kalemleri</TabsTrigger>
          <TabsTrigger value="breakdown"><Icons.ChartBar className="size-4" /> Kırılım &amp; Analiz</TabsTrigger>
          <TabsTrigger value="recon"><Icons.FileCheck className="size-4" /> Mutabakat</TabsTrigger>
        </TabsList>

        {/* ── TAB: Genel Defter ── */}
        <TabsContent value="defter" className="space-y-4">
          <SectionCard
            title="Genel Defter"
            desc="tahsilat, gider ve bekleyen alacak tek akışta — son 60 hareket"
            action={
              <Select value={kindFilter} onValueChange={setKindFilter}>
                <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Tüm hareketler</SelectItem>
                  <SelectItem value="INCOME">Gelir</SelectItem>
                  <SelectItem value="EXPENSE">Gider</SelectItem>
                  <SelectItem value="RECEIVABLE">Alacak (bekleyen)</SelectItem>
                </SelectContent>
              </Select>
            }
          >
            {loading ? <Loading rows={6} /> : error ? <ErrorState message={error} onRetry={reload} /> : ledger.length === 0 ? (
              <EmptyState title="Defter hareketi yok" desc="Tahsilat veya gider kaydedildiğinde burada listelenir." />
            ) : (
              <>
                <div className="maven-scroll max-h-96 overflow-y-auto rounded-lg border">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 z-10 bg-card text-left text-muted-foreground">
                      <tr>
                        <th className="px-3 py-2 font-medium">Tarih</th>
                        <th className="px-3 py-2 font-medium">Açıklama</th>
                        <th className="hidden px-3 py-2 font-medium md:table-cell">Referans</th>
                        <th className="hidden px-3 py-2 font-medium sm:table-cell">Yöntem</th>
                        <th className="px-3 py-2 font-medium">Durum</th>
                        <th className="px-3 py-2 text-right font-medium">Tutar</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ledger.map((r) => (
                        <tr key={`${r.kind}-${r.id}`} className="border-t transition hover:bg-muted/40">
                          <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">{fmtDateTime(r.date)}</td>
                          <td className="max-w-44 truncate px-3 py-2 font-medium md:max-w-64">{r.description}</td>
                          <td className="hidden px-3 py-2 font-mono text-[11px] text-muted-foreground md:table-cell">{r.ref ?? "—"}</td>
                          <td className="hidden whitespace-nowrap px-3 py-2 text-muted-foreground sm:table-cell">
                            {r.kind === "EXPENSE" ? label(EXPENSE_PAYMENT_METHOD, r.method) : label(PAYMENT_METHODS, r.method)}
                          </td>
                          <td className="px-3 py-2"><StatusBadge map={LEDGER_STATUS_LABEL} value={r.status} /></td>
                          <td className={`whitespace-nowrap px-3 py-2 text-right font-semibold tabular-nums ${r.kind === "INCOME" ? "text-emerald-600" : r.kind === "EXPENSE" ? "text-rose-600" : "text-amber-600"}`}>
                            {r.kind === "INCOME" ? `+${fmtMoney(r.amount, r.currency)}` : r.kind === "EXPENSE" ? `−${fmtMoney(r.amount, r.currency)}` : `${fmtMoney(r.amount, r.currency)} (bekliyor)`}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {/* alt toplam — görünür filtrede */}
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-lg bg-muted/50 px-3 py-2 text-xs">
                  <span className="text-muted-foreground">{ledger.length} hareket gösteriliyor</span>
                  <span className="flex flex-wrap gap-3">
                    <span className="font-medium text-emerald-700">Gelir: +{fmtMoney(ledgerIncome)}</span>
                    <span className="font-medium text-rose-700">Gider: −{fmtMoney(ledgerExpense)}</span>
                  </span>
                </div>
              </>
            )}
          </SectionCard>
        </TabsContent>

        {/* ── TAB: Gider Kalemleri ── */}
        <TabsContent value="expenses" className="space-y-4">
          <SectionCard
            title="Gider Kalemleri"
            desc="saha ve ek harcamalar — onay, fiş ve ödeme adımları satır üzerinden yürütülür"
            action={
              <Button size="sm" variant="outline" onClick={openNew}>
                <Icons.Plus className="size-3.5" /> Yeni Gider
              </Button>
            }
          >
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <Select value={expStatus} onValueChange={setExpStatus}>
                <SelectTrigger className="w-full sm:w-44"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Tüm durumlar</SelectItem>
                  {Object.entries(EXPENSE_STATUS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={expCategory} onValueChange={setExpCategory}>
                <SelectTrigger className="w-full sm:w-48"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Tüm kategoriler</SelectItem>
                  {Object.entries(EXPENSE_CATEGORY).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
              <div className="relative flex-1">
                <Icons.Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input value={expSearch} onChange={(e) => setExpSearch(e.target.value)} placeholder="Başlık / tedarikçi / kod ara" className="pl-8" />
              </div>
            </div>

            <div className="mt-3">
              {loadingExpenses ? <Loading rows={4} /> : expError ? <ErrorState message={expError} onRetry={reloadExpenses} /> : filteredExpenses.length === 0 ? (
                <EmptyState title="Gider kalemi bulunamadı" desc="Filtreleri temizleyin veya yeni gider ekleyin." />
              ) : (
                <div className="maven-scroll max-h-96 space-y-3 overflow-y-auto pr-1">
                  {filteredExpenses.map((e) => (
                    <div key={e.id} className="rounded-xl border p-4 transition hover:border-primary/30">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-xs text-muted-foreground">{e.code}</span>
                        <StatusBadge map={EXPENSE_STATUS} value={e.status} />
                        <Chip tone={categoryTone(e.category)}>{label(EXPENSE_CATEGORY, e.category)}</Chip>
                        <span className="ml-auto text-sm font-bold tabular-nums">{fmtMoney(e.amount, e.currency)}</span>
                      </div>
                      <p className="mt-1.5 text-sm font-semibold">
                        {e.title}
                        {e.vendor ? <span className="font-normal text-muted-foreground"> · {e.vendor}</span> : null}
                      </p>
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1"><Icons.CalendarDays className="size-3.5" /> {fmtDate(e.incurredAt)}</span>
                        {e.spentBy && <span className="inline-flex items-center gap-1"><Icons.UserRound className="size-3.5" /> Sahada: {e.spentBy}</span>}
                        <span className="inline-flex items-center gap-1"><Icons.Wallet className="size-3.5" /> {label(EXPENSE_PAYMENT_METHOD, e.paymentMethod)}</span>
                        {e.receiptNo && <Badge variant="outline" className="font-mono text-[11px]">Fiş: {e.receiptNo}</Badge>}
                      </div>
                      {e.description && <p className="mt-1 text-xs text-muted-foreground">{e.description}</p>}
                      {(e.status === "PLANNED" || e.status === "PENDING_RECEIPT" || e.status === "APPROVED" || (e.status === "PAID" && e.paymentMethod === "PERSONAL_REIMBURSE")) && (
                        <div className="mt-2.5 flex flex-wrap gap-2 border-t pt-2.5">
                          {(e.status === "PLANNED" || e.status === "PENDING_RECEIPT") && (
                            <>
                              <Button size="sm" variant="outline" disabled={busyId === e.id} onClick={() => patchExpense(e.id, { status: "APPROVED", approvedBy: "Muhasebe" })}>
                                <Icons.Check className="size-3.5" /> Onayla
                              </Button>
                              <Button size="sm" variant="outline" disabled={busyId === e.id} onClick={() => patchExpense(e.id, { status: "PAID" })}>
                                <Icons.Banknote className="size-3.5" /> Ödendi İşaretle
                              </Button>
                            </>
                          )}
                          {e.status === "APPROVED" && (
                            <Button size="sm" variant="outline" disabled={busyId === e.id} onClick={() => patchExpense(e.id, { status: "PAID" })}>
                              <Icons.Banknote className="size-3.5" /> Ödendi
                            </Button>
                          )}
                          {e.status === "PAID" && e.paymentMethod === "PERSONAL_REIMBURSE" && (
                            <Button size="sm" variant="outline" disabled={busyId === e.id} onClick={() => patchExpense(e.id, { status: "REIMBURSED" })}>
                              <Icons.HandCoins className="size-3.5" /> Personeline Ödendi
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
                  <SectionCard title="Gelir Kaynakları" desc="tahsil edilen ödemelerin yönteme göre dökümü">
                    {incomeBySource.length === 0 ? (
                      <EmptyState title="Tahsilat yok" desc="Ödeme tamamlandığında kaynak kırılımı oluşur." />
                    ) : (
                      <div className="space-y-3">
                        {incomeBySource.map((row) => (
                          <BreakdownBar key={row.key} text={label(PAYMENT_METHODS, row.key)} count={row.count} total={row.total} max={maxIncomeSource} barClass="bg-teal-500" />
                        ))}
                      </div>
                    )}
                  </SectionCard>
                  <SectionCard title="Gider Kategorileri" desc="gerçekleşen (onaylı/ödenmiş) giderlerin kategoriye göre dökümü">
                    {expenseByCategory.length === 0 ? (
                      <EmptyState title="Gerçekleşen gider yok" desc="Gider onaylandığında kırılım oluşur." />
                    ) : (
                      <div className="space-y-3">
                        {expenseByCategory.map((row) => (
                          <BreakdownBar
                            key={row.key}
                            text={label(EXPENSE_CATEGORY, row.key)}
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
                  <SectionCard title="Gider Durumları" desc="tüm gider kalemlerinin akıştaki anlık durumu">
                    {expenseByStatus.length === 0 ? (
                      <EmptyState title="Gider hareketi yok" desc="Gider kalemi eklendiğinde durum dağılımı oluşur." />
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {expenseByStatus.map((row) => (
                          <Chip key={row.key} tone={toneFromStatus(row.key)}>
                            {label(EXPENSE_STATUS, row.key)} · {row.count} kalem · {fmtMoney(row.total)}
                          </Chip>
                        ))}
                      </div>
                    )}
                  </SectionCard>
                  <SectionCard title="30 Günlük Akış" desc="gelir ve gider hareketleri — son 30 gün">
                    {daily.length === 0 ? (
                      <EmptyState title="Akış verisi yok" />
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
                          <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-teal-500" /> Gelir: {fmtMoney(dailyIncomeTotal)}</span>
                          <span className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-rose-500" /> Gider: {fmtMoney(dailyExpenseTotal)}</span>
                        </div>
                      </>
                    )}
                  </SectionCard>
                </div>
              </div>

              <SectionCard title="Mutabakat Notu" desc="gelir ≠ gider ≠ alacak — üç eksen birbirine eşitlenmez (§36)">
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
                title="Kapanış Hazırlığı"
                desc="mutabakat öncesi engelleyici ve uyarı denetimi (§7)"
                action={
                  <div className="flex items-center gap-2">
                    <span className="hidden text-xs text-muted-foreground md:inline">Oluşturuldu: {fmtDateTime(recon.generatedAt)}</span>
                    <Button size="sm" variant="outline" onClick={reloadRecon} disabled={loadingRecon}>
                      <Icons.RefreshCw className={`size-3.5 ${loadingRecon ? "animate-spin" : ""}`} /> Yenile
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
                      {recon.readiness.ok ? "Mutabakata hazır — engelleyici bulunamadı" : "Kapanış engellendi — önce engelleyicileri çözün"}
                    </p>
                  </div>
                  {recon.readiness.blockers.length > 0 && (
                    <div className="mt-3">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-rose-700">Engelleyici ({recon.readiness.blockers.length})</p>
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
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-700">Uyarı ({recon.readiness.warnings.length})</p>
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
                  <Icons.ShoppingCart className="size-3.5" /> Sipariş Özeti
                </span>
                <Chip tone="neutral">Toplam · {recon.orders.total}</Chip>
                <Chip tone="emerald">Ödendi · {recon.orders.paid}</Chip>
                <Chip tone="amber">Açık · {recon.orders.open}</Chip>
                <Chip tone="amber">Kısmi · {recon.orders.partiallyPaid}</Chip>
                <Chip tone="rose">İptal · {recon.orders.cancelled}</Chip>
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                {/* Sipariş Tutarsızlıkları */}
                <SectionCard title="Sipariş Tutarsızlıkları" desc="sipariş tutarı, kalem toplamı ve durum-tahsilat tutarlılık denetimi">
                  {recon.orders.mismatches.length === 0 ? (
                    <ReconCleanState title="Tutarsızlık yok" desc="Tüm siparişler tutarlı — tutar, kalem ve tahsilat denetimi temiz." />
                  ) : (
                    <div className="maven-scroll max-h-96 space-y-3 overflow-y-auto pr-1">
                      {recon.orders.mismatches.map((m, i) => (
                        <div key={`${m.orderNo}-${i}`} className="rounded-xl border border-rose-200 bg-rose-50/40 p-4">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-mono text-xs font-bold">{m.orderNo}</span>
                            <span className="min-w-0 truncate text-xs text-muted-foreground">{m.payer}</span>
                            <Badge variant="outline" className="ml-auto shrink-0 border-rose-200 bg-rose-50 font-semibold text-rose-700">
                              Fark: {m.delta > 0 ? "+" : ""}{fmtMoney(m.delta)}
                            </Badge>
                          </div>
                          <p className="mt-1.5 text-sm font-medium">{m.issue}</p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            Beklenen: <span className="font-semibold text-foreground">{fmtMoney(m.expected)}</span>
                            {" ≠ "}Gerçekleşen: <span className="font-semibold text-foreground">{fmtMoney(m.actual)}</span>
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </SectionCard>

                {/* Doğrulanmamış Tahsilatlar (§38) */}
                <SectionCard title="Doğrulanmamış Tahsilatlar (§38)" desc="referans veya manuel teyit bilgisi eksik tahsilatlar">
                  {recon.unverifiedPayments.length === 0 ? (
                    <ReconCleanState title="Tümü doğrulanmış" desc="Tahsilatların referans ve teyit bilgileri eksiksiz." />
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
                            <span className="inline-flex items-center gap-1"><Icons.Wallet className="size-3.5" /> {label(PAYMENT_METHODS, p.source)}</span>
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
              <SectionCard title="Gider Denetimi" desc="fiş, onay ve personel ödemesi bekleyen gider kalemleri">
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  <KpiCard label="Fiş Bekleyen" value={recon.expenseAudit.awaitingReceipt.count} sub={fmtMoney(recon.expenseAudit.awaitingReceipt.amount)} tone="amber" icon={<Icons.ReceiptText className="size-4" />} />
                  <KpiCard
                    label="7+ Gün Bekleyen Fiş"
                    value={recon.expenseAudit.awaitingOld.count}
                    sub={fmtMoney(recon.expenseAudit.awaitingOld.amount)}
                    tone={recon.expenseAudit.awaitingOld.count > 0 ? "amber" : "neutral"}
                    icon={<Icons.Clock4 className="size-4" />}
                  />
                  <KpiCard label="Onaylı — Ödenmemiş" value={recon.expenseAudit.approvedUnpaid.count} sub={fmtMoney(recon.expenseAudit.approvedUnpaid.amount)} tone="violet" icon={<Icons.CircleDollarSign className="size-4" />} />
                  <KpiCard label="Personeline Ödenecek" value={recon.expenseAudit.reimbursable.count} sub={fmtMoney(recon.expenseAudit.reimbursable.amount)} tone="teal" icon={<Icons.HandCoins className="size-4" />} />
                </div>
              </SectionCard>

              <div className="grid gap-4 lg:grid-cols-2">
                {/* Açık Alacak Yaşlandırması */}
                <SectionCard title="Açık Alacak Yaşlandırması" desc={`${recon.aging.openOrders} açık siparişin vade yaşına göre dağılımı`}>
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
                          <p className="text-xs text-muted-foreground">{b.count} sipariş</p>
                        </div>
                      );
                    })}
                  </div>
                  <Separator className="my-3" />
                  <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                    <span className="text-muted-foreground">Toplam açık alacak</span>
                    <span className="font-bold tabular-nums">{fmtMoney(recon.aging.totalReceivable)}</span>
                  </div>
                </SectionCard>

                {/* Son 6 Ay Dönem Özeti */}
                <SectionCard title="Son 6 Ay Dönem Özeti" desc="aylık tahsilat, gerçekleşen gider ve net akış">
                  {reconPeriod.length === 0 ? (
                    <EmptyState title="Dönem verisi yok" desc="Tahsilat ve gider kaydedildikçe aylık özet oluşur." />
                  ) : (
                    <div className="maven-scroll max-h-96 overflow-y-auto rounded-lg border">
                      <table className="w-full text-xs">
                        <thead className="sticky top-0 z-10 bg-card text-left text-muted-foreground">
                          <tr>
                            <th className="px-3 py-2 font-medium">Ay</th>
                            <th className="px-3 py-2 text-right font-medium">Gelir</th>
                            <th className="px-3 py-2 text-right font-medium">Gider</th>
                            <th className="px-3 py-2 text-right font-medium">Net</th>
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
                            <td className="px-3 py-2 font-semibold">Toplam</td>
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
            <EmptyState title="Mutabakat verisi yok" desc="Bir edisyon seçildiğinde mutabakat raporu otomatik oluşturulur." />
          )}
        </TabsContent>
      </Tabs>

      {/* Yeni Gider dialogu — tam form */}
      <Dialog open={newOpen} onOpenChange={setNewOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Yeni Gider Kalemi</DialogTitle>
            <DialogDescription>Kaydedilen gider deftere işlenir; onay, fiş ve ödeme adımları Gider Kalemleri sekmesinden yürütülür.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="exp-title">Başlık *</Label>
              <Input id="exp-title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Örn. salon kurulum ekipmanı kirası" />
            </div>
            <div className="space-y-1.5">
              <Label>Kategori *</Label>
              <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                <SelectTrigger><SelectValue placeholder="Seçin" /></SelectTrigger>
                <SelectContent>
                  {Object.entries(EXPENSE_CATEGORY).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Tutar *</Label>
              <Input type="number" min={0} step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} placeholder="0" />
            </div>
            <div className="space-y-1.5">
              <Label>Para Birimi</Label>
              <Select value={form.currency} onValueChange={(v) => setForm({ ...form, currency: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Ödeme Yöntemi</Label>
              <Select value={form.paymentMethod} onValueChange={(v) => setForm({ ...form, paymentMethod: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(EXPENSE_PAYMENT_METHOD).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Tedarikçi</Label>
              <Input value={form.vendor} onChange={(e) => setForm({ ...form, vendor: e.target.value })} placeholder="Örn. AVS Teknik" />
            </div>
            <div className="space-y-1.5">
              <Label>Harcayan</Label>
              <Input value={form.spentBy} onChange={(e) => setForm({ ...form, spentBy: e.target.value })} placeholder="Örn. Mert Şahin" />
            </div>
            <div className="space-y-1.5">
              <Label>Harcama Tarihi</Label>
              <Input type="date" value={form.incurredAt} onChange={(e) => setForm({ ...form, incurredAt: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Durum</Label>
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(EXPENSE_STATUS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="exp-desc">Açıklama</Label>
              <Textarea id="exp-desc" rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Fiş No</Label>
              <Input value={form.receiptNo} onChange={(e) => setForm({ ...form, receiptNo: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>Not</Label>
              <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNewOpen(false)} disabled={busy}>Vazgeç</Button>
            <Button onClick={submitNewExpense} disabled={busy || !form.title.trim() || !form.category || !(Number(form.amount) > 0)}>
              {busy ? "Kaydediliyor…" : "Gideri Kaydet"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Hızlı Saha Harcaması dialogu — kategori/durum sabit */}
      <Dialog open={quickOpen} onOpenChange={setQuickOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Hızlı Saha Harcaması</DialogTitle>
            <DialogDescription>Kategori &quot;Saha Harcaması&quot; olarak onaylı kaydedilir ve doğrudan deftere işlenir; fiş sonradan eklenebilir.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="quick-title">Başlık *</Label>
              <Input id="quick-title" value={quick.title} onChange={(e) => setQuick({ ...quick, title: e.target.value })} placeholder="Örn. fuaye ikram alımı" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Tutar *</Label>
                <Input type="number" min={0} value={quick.amount} onChange={(e) => setQuick({ ...quick, amount: e.target.value })} placeholder="0" />
              </div>
              <div className="space-y-1.5">
                <Label>Harcayan</Label>
                <Input value={quick.spentBy} onChange={(e) => setQuick({ ...quick, spentBy: e.target.value })} placeholder="Ad Soyad" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Ödeme Yöntemi</Label>
              <Select value={quick.paymentMethod} onValueChange={(v) => setQuick({ ...quick, paymentMethod: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {QUICK_METHODS.map((m) => <SelectItem key={m} value={m}>{label(EXPENSE_PAYMENT_METHOD, m)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <p className="text-xs text-muted-foreground">Durum: Onaylandı (Saha Onayı) — harcama defterde gider olarak hemen görünür.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setQuickOpen(false)} disabled={busy}>Vazgeç</Button>
            <Button onClick={submitQuickExpense} disabled={busy || !quick.title.trim() || !(Number(quick.amount) > 0)}>
              {busy ? "Kaydediliyor…" : "Harcamayı Kaydet"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
