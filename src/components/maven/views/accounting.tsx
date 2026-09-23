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
        <TabsList>
          <TabsTrigger value="defter"><Icons.BookOpen className="size-4" /> Genel Defter</TabsTrigger>
          <TabsTrigger value="expenses"><Icons.ReceiptText className="size-4" /> Gider Kalemleri</TabsTrigger>
          <TabsTrigger value="breakdown"><Icons.ChartBar className="size-4" /> Kırılım &amp; Analiz</TabsTrigger>
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
