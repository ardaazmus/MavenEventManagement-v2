"use client";
// Ödeme & Ek Hizmet — sipariş ≠ tahsilat ≠ iade (§36-39); manuel teyit = ayrı kayıt
import { useState } from "react";
import { listEntity, apiSend } from "@/lib/client";
import { useApp } from "@/lib/store";
import { SectionCard, EmptyState, Loading, ErrorState, useApi, PageHeader, StatusBadge, Chip, KpiCard } from "../bits";
import { fmtDate, fmtMoney, PAYMENT_STATUS } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import * as Icons from "lucide-react";

interface OrderRow {
  id: string; orderNo: string; totalAmount: number; status: string; currency: string; payerName?: string | null; createdAt: string;
  buyerOrganization?: { name: string } | null;
  lines: { id: string; description: string; quantity: number; unitPrice: number; total: number; participation?: { person: { firstName: string; lastName: string } } | null }[];
  payments: { id: string; amount: number; source: string; status: string; paidAt?: string | null; enteredBy?: string | null; reason?: string | null; approvedBy?: string | null }[];
  refunds: { id: string; amount: number; status: string; reason?: string | null; processedAt?: string | null }[];
}
interface CatalogRow { id: string; name: string; category: string; price: number; currency: string; quantity?: number | null; availableFor: string; isActive: boolean }

export function FinanceView() {
  const { currentEditionId, bump, refreshKey } = useApp();
  const { toast } = useToast();
  const [manualTarget, setManualTarget] = useState<OrderRow | null>(null);
  const [manual, setManual] = useState({ amount: "", reference: "", reason: "" });
  const [busy, setBusy] = useState(false);

  const { data: orders, error, reload, loading } = useApi<OrderRow[]>(() => listEntity<OrderRow>("orders", { editionId: currentEditionId ?? undefined, limit: 200 }), [currentEditionId, refreshKey]);
  const { data: catalog } = useApi<CatalogRow[]>(() => listEntity<CatalogRow>("catalog-items", { editionId: currentEditionId ?? undefined }), [currentEditionId, refreshKey]);

  const sum = (fn: (o: OrderRow) => number) => (orders ?? []).reduce((s, o) => s + fn(o), 0);
  const paidOf = (o: OrderRow) => o.payments.filter((p) => p.status === "SUCCEEDED").reduce((s, p) => s + p.amount, 0);
  const refundedOf = (o: OrderRow) => o.refunds.filter((r) => r.status === "PROCESSED").reduce((s, r) => s + r.amount, 0);

  const submitManual = async () => {
    if (!manualTarget) return;
    setBusy(true);
    try {
      await apiSend("/api/flows", "POST", {
        action: "finance.manualPayment",
        orderId: manualTarget.id,
        amount: Number(manual.amount),
        currency: manualTarget.currency,
        reference: manual.reference,
        reason: manual.reason,
      });
      toast({ title: "Manuel tahsilat kaydedildi", description: "50.000+ tutarlarda ikinci onay istenir; finansal durum kayıttan türetilir." });
      setManualTarget(null); setManual({ amount: "", reference: "", reason: "" });
      reload(); bump();
    } catch (e) {
      toast({ title: "Tahsilat kaydedilemedi", description: e instanceof Error ? e.message : "Hata", variant: "destructive" });
    } finally { setBusy(false); }
  };

  const orderedTotal = sum((o) => o.lines.reduce((s, l) => s + l.total, 0));
  const collectedTotal = sum(paidOf);
  const refundedTotal = sum(refundedOf);
  const openTotal = sum((o) => Math.max(0, o.lines.reduce((s, l) => s + l.total, 0) - paidOf(o) + refundedOf(o)));
  const partialCount = (orders ?? []).filter((o) => paidOf(o) > 0 && o.lines.reduce((s, l) => s + l.total, 0) - paidOf(o) + refundedOf(o) > 0.01).length;
  const pendingManual = (orders ?? []).flatMap((o) => o.payments).filter((p) => p.source === "MANUAL_EXTERNAL" && p.status === "PENDING").length;

  return (
    <div className="space-y-5">
      <PageHeader title="Ödeme & Ek Hizmet" desc="Registration'da paid=true tutulmaz — finansal gerçek Order/Payment/Refund'dan türetilir (§36)" />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <KpiCard label="Sipariş Edilen" value={fmtMoney(orderedTotal)} sub="vergiler ve indirimler kalemlerde" icon={<Icons.ShoppingCart className="size-4" />} />
        <KpiCard label="Tahsil Edilen" value={fmtMoney(collectedTotal)} sub="başarılı tahsilat" tone="emerald" icon={<Icons.Banknote className="size-4" />} />
        <KpiCard label="İade Edilen" value={fmtMoney(refundedTotal)} sub="kesinleşen iade" tone="violet" icon={<Icons.Undo2 className="size-4" />} />
        <KpiCard label="Açık Bakiye" value={fmtMoney(openTotal)} sub="ödeyeni olan geçerli sipariş" tone="amber" icon={<Icons.Scale className="size-4" />} />
        <KpiCard label="Kısmi Ödeme" value={partialCount} sub="sipariş sayısı — kişi değil" tone="amber" icon={<Icons.Percent className="size-4" />} />
        <KpiCard label="Manuel Teyit Bekleyen" value={pendingManual} sub="kanıt ve ikinci onay kuyruğu" tone="rose" icon={<Icons.FileClock className="size-4" />} />
      </div>

      <SectionCard title="Siparişler" desc="satır bazında hangi katılımcıya/ek hizmete ait olduğu görünür">
        {loading ? <Loading /> : error ? <ErrorState message={error} onRetry={reload} /> : (orders ?? []).length === 0 ? (
          <EmptyState title="Henüz sipariş yok" desc="Kategori fiyatlarını ve kayıt bağlantısını kontrol edin." />
        ) : (
          <div className="space-y-3">
            {(orders ?? []).map((o) => {
              const paid = paidOf(o); const ref = refundedOf(o);
              const linesTotal = o.lines.reduce((s, l) => s + l.total, 0);
              const balance = linesTotal - paid + ref;
              return (
                <details key={o.id} className="rounded-xl border p-4" open={balance > 0.01}>
                  <summary className="flex cursor-pointer flex-wrap items-center gap-2 text-sm">
                    <span className="font-mono text-xs text-muted-foreground">{o.orderNo}</span>
                    <span className="font-semibold">{o.buyerOrganization?.name ?? o.payerName ?? "Bireysel"}</span>
                    <span className="tabular-nums font-medium">{fmtMoney(linesTotal, o.currency)}</span>
                    <StatusBadge map={{ OPEN: "Açık", PARTIALLY_PAID: "Kısmi ödendi", PAID: "Ödendi", CANCELLED: "İptal" }} value={o.status} />
                    <span className="ml-auto text-xs text-muted-foreground">{fmtDate(o.createdAt)}</span>
                  </summary>
                  <div className="mt-3 grid gap-3 lg:grid-cols-3">
                    <div className="min-w-0 lg:col-span-2">
                      <p className="mb-1 text-xs font-semibold text-muted-foreground">Kalemler</p>
                      <div className="space-y-1">
                        {o.lines.map((l) => (
                          <div key={l.id} className="flex items-center justify-between gap-2 rounded-md bg-muted/50 px-2.5 py-1.5 text-xs">
                            <span className="min-w-0 truncate">
                              {l.description}
                              {l.participation && <span className="text-muted-foreground"> → {l.participation.person.firstName} {l.participation.person.lastName}</span>}
                              <span className="text-muted-foreground"> × {l.quantity}</span>
                            </span>
                            <span className="shrink-0 tabular-nums font-medium">{fmtMoney(l.total, o.currency)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div>
                      <p className="mb-1 text-xs font-semibold text-muted-foreground">Ödeme zaman çizelgesi</p>
                      <div className="space-y-1">
                        {o.payments.map((p) => (
                          <div key={p.id} className="flex items-center justify-between gap-2 text-xs">
                            <span>{fmtMoney(p.amount, o.currency)} · {p.source}{p.enteredBy ? ` · ${p.enteredBy}` : ""}</span>
                            <StatusBadge map={{ SUCCEEDED: "Tahsil", FAILED: "Başarısız", PENDING: "Bekliyor" }} value={p.status} />
                          </div>
                        ))}
                        {o.refunds.map((r) => (
                          <div key={r.id} className="flex items-center justify-between gap-2 text-xs text-violet-700">
                            <span>−{fmtMoney(r.amount, o.currency)} iade{r.reason ? ` · ${r.reason}` : ""}</span>
                            <Chip tone="violet">{r.status}</Chip>
                          </div>
                        ))}
                      </div>
                      <div className="mt-2 rounded-lg bg-muted/60 p-2 text-xs">
                        <div className="flex justify-between"><span>Tahsil edilen</span><span className="font-medium tabular-nums">{fmtMoney(paid, o.currency)}</span></div>
                        <div className="flex justify-between"><span>İade edilen</span><span className="font-medium tabular-nums">−{fmtMoney(ref, o.currency)}</span></div>
                        <div className="mt-1 flex justify-between border-t pt-1 font-semibold"><span>Açık bakiye</span><span className="tabular-nums">{fmtMoney(Math.max(0, balance), o.currency)}</span></div>
                      </div>
                      <Button size="sm" variant="outline" className="mt-2 w-full" onClick={() => setManualTarget(o)}>
                        <Icons.HandCoins className="size-4" /> Manuel Tahsilat Gir
                      </Button>
                    </div>
                  </div>
                </details>
              );
            })}
          </div>
        )}
      </SectionCard>

      <SectionCard title="Ek Hizmet Kataloğu" desc="hakla kullanım ≠ ayrı satın alma — iki seçenek anlamı açık ayrılır">
        {(catalog ?? []).length === 0 ? (
          <EmptyState title="Bu kategoride hizmet yok" desc="Hizmet ekleyin." />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {(catalog ?? []).map((c) => (
              <div key={c.id} className="rounded-xl border p-3.5">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-semibold">{c.name}</p>
                  <Chip tone="teal">{c.category}</Chip>
                </div>
                <p className="mt-1 text-sm font-medium tabular-nums">{c.price > 0 ? fmtMoney(c.price, c.currency) : "Ücretsiz"}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {c.quantity ? `kota ${c.quantity}` : "kota sınırsız"} · hedef: {c.availableFor === "ALL" ? "tüm katılımcılar" : c.availableFor === "SPONSOR" ? "sponsorlar" : c.availableFor}
                </p>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      {/* Manuel ödeme dialogu — §38 */}
      <Dialog open={Boolean(manualTarget)} onOpenChange={(o) => !o && setManualTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Manuel Ödeme Teyidi</DialogTitle>
            <DialogDescription>{manualTarget?.orderNo} — admin "ödendi" butonuyla doğrudan status değiştirmez; ayrı ManualPayment kaydı açılır.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Tutar ({manualTarget?.currency ?? "TRY"})</Label>
                <Input type="number" min={1} value={manual.amount} onChange={(e) => setManual({ ...manual, amount: e.target.value })} />
              </div>
              <div>
                <Label>Referans (makbuz/ekstre)</Label>
                <Input value={manual.reference} onChange={(e) => setManual({ ...manual, reference: e.target.value })} />
              </div>
            </div>
            <div>
              <Label>Gerekçe (denetim zorunlu)</Label>
              <Textarea value={manual.reason} onChange={(e) => setManual({ ...manual, reason: e.target.value })} placeholder="Örn. kurum faturası havale ile ödendi — ekstre №..." />
            </div>
            <p className="text-xs text-muted-foreground">Belirlenen eşik aşılırsa ikinci onay istenir (approvedBy).</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setManualTarget(null)}>Vazgeç</Button>
            <Button onClick={submitManual} disabled={busy || !manual.amount || !manual.reason}>{busy ? "Kaydediliyor…" : "Tahsilatı Kaydet"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
