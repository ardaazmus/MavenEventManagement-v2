"use client";
import React, { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Kanban,
  Building,
  CheckCircle2,
  Clock,
  ArrowRight,
  Plus,
  Users,
  Calendar,
  Sparkles,
  DollarSign,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toMinor } from "@/lib/money";
import { fmtMoney } from "@/lib/constants";
import { apiGet, apiSend } from "@/lib/client";
import { useApp } from "@/lib/store";
import { useLang } from "@/lib/i18n";
import { canProceed } from "@/lib/sponsorship/wizard";

export interface KanbanAgreement {
  id: string;
  amount: number; // MINOR unit (kuruş) — gösterim fmtMoney ile
  currency: string;
  status: string; // kanonik: PROSPECT|NEGOTIATION|CONTRACTED|ACTIVE|COMPLETED|CANCELLED
  signedAt?: string | null;
  organization: { id: string; name: string };
  package?: { id: string; name: string } | null;
  tier?: { id: string; name: string } | null;
}

export interface MoveStageOpts {
  transitionReason?: string;
  signedAt?: string;
}

export interface TierOption {
  id: string;
  name: string;
  price: number;
  currency: string;
}

export interface PackageOption {
  id: string;
  name: string;
  price: number;
  currency: string;
  tierId: string | null;
  rightsSpec: string | null;
}

export interface TierUsage {
  used: number;
  capacity: number | null;
}

interface B2bPlanRow {
  id: string;
  subject: string;
  status: string;
  startsAt: string | null;
  endsAt: string | null;
  venue: string | null;
  location: string | null;
  assignments: {
    id: string;
    status: string;
    organizerApproved: boolean;
    personApproved: boolean;
    person: { id: string; firstName: string; lastName: string; company: string | null };
  }[];
}

export interface SponsorshipKanbanProps {
  agreements: KanbanAgreement[];
  organizations: { id: string; name: string }[];
  tiers: TierOption[];
  packages: PackageOption[];
  tierUsage: Record<string, TierUsage>;
  onMoveStage?: (agreementId: string, targetStage: string, opts?: MoveStageOpts) => Promise<void>;
  onNewDeal?: (deal: { organizationId: string; amountMinor: number; stage: string; tierId?: string | null; packageId?: string | null; notes?: string | null }) => Promise<{ id: string }>;
  onOrganizationsChanged?: () => void;
}

// P08.3: kolonlar kanonik durumlarla birebir (ödeme verisi olmadığı için PAID kolonu yok).
const STAGES = [
  { key: "PROSPECT", label: "1. Aday", color: "border-blue-300 bg-blue-50/50 dark:bg-blue-950/20 text-blue-700" },
  { key: "NEGOTIATION", label: "2. Görüşme", color: "border-amber-300 bg-amber-50/50 dark:bg-amber-950/20 text-amber-700" },
  { key: "CONTRACTED", label: "3. Sözleşmeli", color: "border-purple-300 bg-purple-50/50 dark:bg-purple-950/20 text-purple-700" },
  { key: "ACTIVE", label: "4. Aktif", color: "border-teal-300 bg-teal-50/50 dark:bg-teal-950/20 text-teal-700" },
  { key: "COMPLETED", label: "5. Tamamlandı", color: "border-emerald-300 bg-emerald-50/50 dark:bg-emerald-950/20 text-emerald-700" },
];

// P07.4: yeni anlaşma yalnız bu iki durumla başlar.
const INITIAL_DEAL_STAGES = [
  { key: "PROSPECT", label: "Aday (Prospect)" },
  { key: "NEGOTIATION", label: "Görüşme (Negotiation)" },
];

function DealCard({
  deal,
  nextKey,
  onMoveStage,
}: {
  deal: KanbanAgreement;
  nextKey: string | null;
  onMoveStage?: SponsorshipKanbanProps["onMoveStage"];
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [signOpen, setSignOpen] = useState(false);
  const [signedAt, setSignedAt] = useState("");

  const run = async (target: string, opts?: MoveStageOpts) => {
    if (!onMoveStage) return;
    setBusy(true);
    setError(null);
    try {
      await onMoveStage(deal.id, target, opts);
      setCancelOpen(false);
      setSignOpen(false);
      setCancelReason("");
      setSignedAt("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Geçiş başarısız");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-lg border bg-background p-3 shadow-xs space-y-2 hover:border-primary/40 transition-colors">
      <div className="flex items-start justify-between gap-1">
        <span className="font-semibold text-xs text-foreground line-clamp-1">
          {deal.organization.name}
        </span>
        {deal.tier && (
          <Badge variant="outline" className="text-[9px] shrink-0">
            {deal.tier.name}
          </Badge>
        )}
      </div>

      <div className="flex items-center justify-between text-xs pt-1">
        <span className="font-bold text-emerald-600 tabular-nums">
          {fmtMoney(deal.amount, deal.currency)}
        </span>
        <span className="text-[10px] text-muted-foreground">
          {deal.package?.name ?? "Standart"}
        </span>
      </div>

      <div className="border-t pt-2 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[10px] text-muted-foreground">
            {deal.signedAt ? "İmzalandı" : "Taslak"}
          </span>
          <div className="flex items-center gap-1">
            {onMoveStage && (
              <Button
                size="sm"
                variant="ghost"
                className="h-6 text-[10px] px-1.5 text-destructive hover:bg-destructive/10"
                disabled={busy}
                onClick={() => setCancelOpen((v) => !v)}
              >
                İptal
              </Button>
            )}
            {nextKey && onMoveStage && nextKey !== "CONTRACTED" && (
              <Button
                size="sm"
                variant="ghost"
                className="h-6 text-[10px] px-1.5 gap-1 text-primary hover:bg-primary/10"
                disabled={busy}
                onClick={() => nextKey && run(nextKey)}
              >
                İlerlet <ArrowRight className="size-3" />
              </Button>
            )}
            {nextKey === "CONTRACTED" && onMoveStage && (
              <Button
                size="sm"
                variant="ghost"
                className="h-6 text-[10px] px-1.5 gap-1 text-primary hover:bg-primary/10"
                disabled={busy}
                onClick={() => setSignOpen((v) => !v)}
              >
                Sözleşmeye al <ArrowRight className="size-3" />
              </Button>
            )}
          </div>
        </div>

        {signOpen && (
          <div className="space-y-1.5 rounded-md border bg-muted/30 p-2">
            <Label className="text-[10px]">İmza tarihi (sözleşme kanıtı)</Label>
            <div className="flex gap-1.5">
              <Input
                type="date"
                className="h-7 text-[11px]"
                value={signedAt}
                onChange={(e) => setSignedAt(e.target.value)}
              />
              <Button
                size="sm"
                className="h-7 text-[10px]"
                disabled={busy || !signedAt}
                onClick={() => run("CONTRACTED", { signedAt: new Date(`${signedAt}T00:00:00`).toISOString() })}
              >
                Onayla
              </Button>
            </div>
          </div>
        )}

        {cancelOpen && (
          <div className="space-y-1.5 rounded-md border bg-muted/30 p-2">
            <Label className="text-[10px]">İptal gerekçesi (zorunlu)</Label>
            <div className="flex gap-1.5">
              <Input
                className="h-7 text-[11px]"
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="Örn: Sponsor vazgeçti"
              />
              <Button
                size="sm"
                variant="destructive"
                className="h-7 text-[10px]"
                disabled={busy || !cancelReason.trim()}
                onClick={() => run("CANCELLED", { transitionReason: cancelReason.trim() })}
              >
                İptal et
              </Button>
            </div>
          </div>
        )}

        {error && <p className="text-[10px] text-destructive">{error}</p>}
      </div>
    </div>
  );
}

function CancelledRow({
  deal,
  onMoveStage,
}: {
  deal: KanbanAgreement;
  onMoveStage?: SponsorshipKanbanProps["onMoveStage"];
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reopenOpen, setReopenOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [target, setTarget] = useState("PROSPECT");

  return (
    <div className="rounded-lg border bg-background p-2.5 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium line-clamp-1">{deal.organization.name}</span>
        <div className="flex items-center gap-2">
          <span className="text-[11px] tabular-nums text-muted-foreground">{fmtMoney(deal.amount, deal.currency)}</span>
          {onMoveStage && (
            <Button size="sm" variant="outline" className="h-6 text-[10px]" disabled={busy} onClick={() => setReopenOpen((v) => !v)}>
              Yeniden aç
            </Button>
          )}
        </div>
      </div>
      {reopenOpen && (
        <div className="flex flex-wrap items-center gap-1.5">
          <Select value={target} onValueChange={setTarget}>
            <SelectTrigger className="h-7 w-32 text-[11px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="PROSPECT">Aday</SelectItem>
              <SelectItem value="NEGOTIATION">Görüşme</SelectItem>
            </SelectContent>
          </Select>
          <Input
            className="h-7 text-[11px] flex-1 min-w-32"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Yeniden açma gerekçesi (zorunlu)"
          />
          <Button
            size="sm"
            className="h-7 text-[10px]"
            disabled={busy || !reason.trim()}
            onClick={async () => {
              if (!onMoveStage) return;
              setBusy(true);
              setError(null);
              try {
                await onMoveStage(deal.id, target, { transitionReason: reason.trim() });
                setReopenOpen(false);
                setReason("");
              } catch (e) {
                setError(e instanceof Error ? e.message : "Yeniden açma başarısız");
              } finally {
                setBusy(false);
              }
            }}
          >
            Onayla
          </Button>
        </div>
      )}
      {error && <p className="text-[10px] text-destructive">{error}</p>}
    </div>
  );
}

export function SponsorshipKanban({
  agreements,
  organizations,
  tiers,
  packages,
  tierUsage,
  onMoveStage,
  onNewDeal,
  onOrganizationsChanged,
}: SponsorshipKanbanProps) {
  const { t } = useLang();
  const { currentEditionId, setModule } = useApp();
  const [b2bOpen, setB2bOpen] = useState(false);
  // H-18: B2B diyaloğu mock matris değil CANLI veri gösterir (b2b-plans + atamalar).
  const [b2bPlans, setB2bPlans] = useState<B2bPlanRow[] | null>(null);
  const [b2bError, setB2bError] = useState<string | null>(null);
  const [b2bRetry, setB2bRetry] = useState(0);
  const [newDealOpen, setNewDealOpen] = useState(false);
  const [newOrgId, setNewOrgId] = useState("");
  const [newAmount, setNewAmount] = useState("");
  const [newStage, setNewStage] = useState("PROSPECT");
  const [newTierId, setNewTierId] = useState("");
  const [newPackageId, setNewPackageId] = useState("");
  const [newNotes, setNewNotes] = useState("");
  const [newDueDate, setNewDueDate] = useState("");
  const [amountTouched, setAmountTouched] = useState(false);
  const [wizardStep, setWizardStep] = useState<1 | 2 | 3 | 4>(1);
  const [saving, setSaving] = useState(false);
  // N-06: ref→state — render'da okunuyor (disabled) + çift-gönderim koruması.
  const [submitted, setSubmitted] = useState(false);
  const [newOrgOpen, setNewOrgOpen] = useState(false);
  const [newOrgName, setNewOrgName] = useState("");
  const [newOrgSaving, setNewOrgSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // H-18: diyalog açılışında seçili edisyonun B2B planları çekilir.
  useEffect(() => {
    if (!b2bOpen || !currentEditionId) return;
    let cancelled = false;
    apiGet<{ items: B2bPlanRow[] }>(`/api/b2b-plans?editionId=${currentEditionId}&limit=200`)
      .then((res) => {
        if (cancelled) return;
        setB2bPlans(res.items ?? []);
        setB2bError(null);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setB2bError(e instanceof Error ? e.message : "load");
        setB2bPlans([]);
      });
    return () => {
      cancelled = true;
    };
  }, [b2bOpen, currentEditionId, b2bRetry]);

  const openB2b = () => {
    setB2bPlans(null);
    setB2bError(null);
    setB2bOpen(true);
  };

  const fmtSlot = (iso: string | null) => {
    if (!iso) return "—";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleString("tr-TR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  };

  // Kanonik durumları kolonlara grupla; CANCELLED ayrı listede, bilinmeyen
  // durumlar ASLA sessizce PROSPECT'e düşmez (ayrı uyarı satırı).
  const { stageMap, cancelled, unknown } = useMemo(() => {
    const map: Record<string, KanbanAgreement[]> = {
      PROSPECT: [],
      NEGOTIATION: [],
      CONTRACTED: [],
      ACTIVE: [],
      COMPLETED: [],
    };
    const cancelledList: KanbanAgreement[] = [];
    const unknownList: KanbanAgreement[] = [];

    for (const a of agreements) {
      const st = (a.status || "").toUpperCase();
      if (st === "CANCELLED") {
        cancelledList.push(a);
      } else if (st in map) {
        map[st].push(a);
      } else {
        unknownList.push(a);
      }
    }
    return { stageMap: map, cancelled: cancelledList, unknown: unknownList };
  }, [agreements]);
  const [showCancelled, setShowCancelled] = useState(false);

  const duplicateOrg = useMemo(() => {
    const needle = newOrgName.trim().toLocaleLowerCase("tr-TR");
    if (!needle) return null;
    return organizations.find((o) => o.name.trim().toLocaleLowerCase("tr-TR") === needle) ?? null;
  }, [newOrgName, organizations]);

  const handleCreateOrg = async () => {
    const name = newOrgName.trim();
    if (!name) return;
    // Aynı isimde kayıt varsa sessizce çoğaltma: mevcut kaydı seç.
    if (duplicateOrg) {
      setNewOrgId(duplicateOrg.id);
      setNewOrgOpen(false);
      setNewOrgName("");
      return;
    }
    setNewOrgSaving(true);
    setFormError(null);
    try {
      const created = await apiSend<{ id: string; name: string }>("/api/organizations", "POST", { name });
      onOrganizationsChanged?.();
      setNewOrgId(created.id);
      setNewOrgOpen(false);
      setNewOrgName("");
    } catch (e) {
      setFormError(e instanceof Error ? e.message : t("sponsorship.orgCreateFailed"));
    } finally {
      setNewOrgSaving(false);
    }
  };

  const selectedPackage = packages.find((p) => p.id === newPackageId) ?? null;
  const selectedTier = tiers.find((t) => t.id === (selectedPackage?.tierId ?? newTierId)) ?? null;
  const visiblePackages = newTierId ? packages.filter((p) => !p.tierId || p.tierId === newTierId) : packages;

  const draftAmountMinor = newAmount === "" ? null : toMinor(Number(newAmount) || 0);
  const draftForGuards = {
    step: wizardStep,
    organizationId: newOrgId,
    tierId: newTierId,
    packageId: newPackageId,
    amountMinor: draftAmountMinor,
    stage: newStage,
    notes: newNotes,
    contractDueDate: newDueDate === "" ? null : newDueDate,
  };
  const stepBlockReason =
    wizardStep === 1 ? canProceed(1, draftForGuards) : wizardStep === 2 ? canProceed(2, draftForGuards) : wizardStep === 3 ? canProceed(3, draftForGuards) : null;

  const resetWizard = () => {
    setNewDealOpen(false);
    setWizardStep(1);
    setNewOrgId("");
    setNewAmount("");
    setNewStage("PROSPECT");
    setNewTierId("");
    setNewPackageId("");
    setNewNotes("");
    setNewDueDate("");
    setAmountTouched(false);
    setFormError(null);
    setSubmitted(false);
  };

  const handleCreateDeal = async () => {
    // P11.4: çift-gönderim koruması — biten kayıt tekrar gönderilmez.
    if (!newOrgId || !onNewDeal || saving || submitted) return;
    setSaving(true);
    setFormError(null);
    try {
      const created = await onNewDeal({
        organizationId: newOrgId,
        amountMinor: toMinor(Number(newAmount) || 0),
        stage: newStage,
        tierId: newTierId || null,
        packageId: newPackageId || null,
        notes: newNotes.trim() || null,
      });
      setSubmitted(true);
      // P11.3: sözleşme vadesi bir teslim kaydı üretir (ayrı validasyonlu çağrı).
      if (newDueDate !== "") {
        await apiSend("/api/deliverables", "POST", {
          agreementId: created.id,
          name: "Sözleşme",
          type: "CONTRACT",
          status: "NOT_STARTED",
          dueDate: new Date(`${newDueDate}T00:00:00`).toISOString(),
        });
      }
      resetWizard();
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Anlaşma kaydedilemedi");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Üst Bar: Pipeline Başlığı ve B2B Butonu */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-3 shadow-xs">
        <div className="flex items-center gap-3">
          <Kanban className="size-4 text-primary" />
          <div>
            <h3 className="text-sm font-semibold text-foreground">Sponsorluk Satış Boru Hattı (Kanban)</h3>
            <p className="text-[11px] text-muted-foreground">Lead → Teklif → Sözleşme → Tahsilat aşamaları</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" className="gap-1.5" onClick={openB2b}>
            <Users className="size-3.5 text-primary" /> {t("sponsorship.b2bLive.button")}
          </Button>
          <Button size="sm" className="gap-1.5" onClick={() => setNewDealOpen(true)}>
            <Plus className="size-3.5" /> Yeni Sponsor Anlaşması
          </Button>
        </div>
      </div>

      {/* 5 Kolonlu Kanban Grid (kanonik durumlar) */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-3">
        {STAGES.map((col, idx) => {
          const items = stageMap[col.key] || [];
          const totalAmount = items.reduce((acc, curr) => acc + (curr.amount || 0), 0);
          const nextKey = idx < STAGES.length - 1 ? STAGES[idx + 1].key : null;

          return (
            <div key={col.key} className="rounded-xl border bg-muted/20 p-3 space-y-3 flex flex-col min-h-[450px]">
              {/* Kolon Başlığı & Hacim */}
              <div className="border-b pb-2">
                <div className="flex items-center justify-between">
                  <span className={cn("text-xs font-semibold px-2 py-0.5 rounded-md border", col.color)}>
                    {col.label}
                  </span>
                  <Badge variant="secondary" className="font-mono text-[10px]">{items.length}</Badge>
                </div>
                <div className="mt-1 flex items-center justify-between text-[11px] text-muted-foreground">
                  <span>Toplam Hacim:</span>
                  <span className="font-bold text-foreground tabular-nums">{fmtMoney(totalAmount)}</span>
                </div>
              </div>

              {/* Kolon Kartları */}
              <div className="space-y-2 flex-1 overflow-y-auto max-h-[500px] pr-1">
                {items.length === 0 ? (
                  <div className="h-28 flex items-center justify-center text-[11px] text-muted-foreground border border-dashed rounded-lg">
                    Bu aşamada anlaşma yok
                  </div>
                ) : (
                  items.map((deal) => (
                    <DealCard key={deal.id} deal={deal} nextKey={nextKey} onMoveStage={onMoveStage} />
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>

      {unknown.length > 0 && (
        <p className="text-[11px] text-amber-700">
          Bilinmeyen durumda {unknown.length} anlaşma boru hattı dışında tutuldu (veri incelemesi gerekli): {unknown.map((u) => u.organization.name).join(", ")}.
        </p>
      )}

      {cancelled.length > 0 && (
        <div className="rounded-xl border bg-muted/20 p-3 space-y-2">
          <button
            type="button"
            className="text-[11px] text-muted-foreground underline underline-offset-2"
            onClick={() => setShowCancelled((v) => !v)}
          >
            İptal edilen {cancelled.length} anlaşma {showCancelled ? "gizle" : "göster"}
          </button>
          {showCancelled && (
            <div className="space-y-2">
              {cancelled.map((deal) => (
                <CancelledRow key={deal.id} deal={deal} onMoveStage={onMoveStage} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* H-18: B2B canlı randevu listesi (mock matris kaldırıldı) */}
      <Dialog open={b2bOpen} onOpenChange={setB2bOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto text-xs">
          <DialogHeader>
            <DialogTitle className="text-sm font-semibold flex items-center gap-2">
              <Users className="size-4 text-primary" />
              {t("sponsorship.b2bLive.title")}
            </DialogTitle>
            <p className="text-[11px] text-muted-foreground">{t("sponsorship.b2bLive.subtitle")}</p>
          </DialogHeader>

          <div className="space-y-2 py-2">
            {!currentEditionId && (
              <p className="rounded-lg border bg-muted/40 p-3 text-center text-muted-foreground">
                {t("sponsorship.b2bLive.noEdition")}
              </p>
            )}
            {currentEditionId && b2bPlans === null && !b2bError && (
              <p className="rounded-lg border bg-muted/40 p-3 text-center text-muted-foreground">
                {t("sponsorship.b2bLive.loading")}
              </p>
            )}
            {b2bError && (
              <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-center">
                <p className="text-destructive">{t("sponsorship.b2bLive.loadError")}: {b2bError}</p>
                <Button size="sm" variant="outline" className="mt-2" onClick={() => { setB2bError(null); setB2bPlans(null); setB2bRetry((n) => n + 1); }}>
                  {t("sponsorship.b2bLive.retry")}
                </Button>
              </div>
            )}
            {b2bPlans !== null && b2bPlans.length === 0 && !b2bError && (
              <div className="rounded-lg border bg-muted/40 p-4 text-center">
                <p className="font-medium text-foreground">{t("sponsorship.b2bLive.empty")}</p>
                <p className="mt-1 text-[11px] text-muted-foreground">{t("sponsorship.b2bLive.emptyHint")}</p>
              </div>
            )}
            {(b2bPlans ?? []).map((plan) => (
              <div key={plan.id} className="rounded-lg border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium text-foreground">{plan.subject}</p>
                  <Badge variant="outline" className="font-mono">{plan.status}</Badge>
                </div>
                <p className="mt-1 font-mono text-[11px] text-muted-foreground">
                  {fmtSlot(plan.startsAt)}{plan.endsAt ? ` → ${fmtSlot(plan.endsAt)}` : ""}
                  {plan.location ? ` · ${plan.location}` : ""}{plan.venue ? ` · ${plan.venue}` : ""}
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {plan.assignments.length === 0 && (
                    <span className="text-[11px] italic text-muted-foreground">{t("sponsorship.b2bLive.unassigned")}</span>
                  )}
                  {plan.assignments.map((a) => (
                    <span
                      key={a.id}
                      className={cn(
                        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px]",
                        a.status === "ACCEPTED" ? "border-teal-300 bg-teal-50 text-teal-700 dark:bg-teal-950/30"
                          : a.status === "DECLINED" ? "border-red-300 bg-red-50 text-red-700 dark:bg-red-950/30"
                          : "border-muted bg-muted/40 text-muted-foreground",
                      )}
                    >
                      {a.person.firstName} {a.person.lastName}
                      {a.person.company ? ` · ${a.person.company}` : ""}
                      <span className="font-mono opacity-70">{a.status}</span>
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => { setB2bOpen(false); setModule("b2b"); }}>
              {t("sponsorship.b2bLive.openModule")}
            </Button>
            <Button onClick={() => setB2bOpen(false)}>{t("sponsorship.b2bLive.close")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Yeni Sponsorluk Anlaşması Modalı */}
      <Dialog open={newDealOpen} onOpenChange={setNewDealOpen}>
        <DialogContent className="sm:max-w-md text-xs">
          <DialogHeader>
            <DialogTitle className="text-sm font-semibold flex items-center gap-2">
              <DollarSign className="size-4 text-primary" />
              Yeni Sponsorluk Anlaşması Oluştur — Adım {wizardStep}/4
            </DialogTitle>
            <div className="flex items-center gap-1 pt-1 text-[10px]">
              {["Kurum", "Paket & Tutar", "Sözleşme", "Özet"].map((label, i) => (
                <span
                  key={label}
                  className={cn(
                    "rounded-full border px-2 py-0.5",
                    wizardStep === i + 1 ? "border-primary bg-primary/10 font-semibold text-primary" : "text-muted-foreground",
                  )}
                >
                  {i + 1}. {label}
                </span>
              ))}
            </div>
          </DialogHeader>

          <div className="space-y-3 py-2">
            {wizardStep === 1 && (
            <div className="space-y-1.5">
              <Label>Sponsor Kurum</Label>
              <div className="flex gap-2">
                <Select value={newOrgId} onValueChange={setNewOrgId}>
                  <SelectTrigger className="flex-1"><SelectValue placeholder={t("sponsorship.selectOrgPh")} /></SelectTrigger>
                  <SelectContent>
                    {organizations.length === 0 && (
                      <div className="px-2 py-1.5 text-[11px] text-muted-foreground">Kayıtlı kurum yok — önce kurum oluşturun</div>
                    )}
                    {organizations.map((o) => (
                      <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button type="button" size="sm" variant="outline" onClick={() => setNewOrgOpen((v) => !v)}>
                  <Plus className="size-3.5" /> Yeni kurum
                </Button>
              </div>
              {newOrgOpen && (
                <div className="rounded-lg border bg-muted/30 p-2.5 space-y-2">
                  <Input
                    value={newOrgName}
                    onChange={(e) => setNewOrgName(e.target.value)}
                    placeholder="Örn: Acme Medikal A.Ş."
                  />
                  {duplicateOrg && (
                    <p className="text-[11px] text-amber-700">
                      Aynı isimde bir kurum zaten kayıtlı — kaydetmek yerine mevcut kayıt seçilecek.
                    </p>
                  )}
                  <div className="flex justify-end gap-2">
                    <Button type="button" size="sm" variant="ghost" onClick={() => { setNewOrgOpen(false); setNewOrgName(""); }}>Vazgeç</Button>
                    <Button type="button" size="sm" onClick={handleCreateOrg} disabled={newOrgSaving || !newOrgName.trim()}>
                      {newOrgSaving ? t("common.saving") : duplicateOrg ? t("sponsorship.useExistingOrg") : t("sponsorship.createOrg")}
                    </Button>
                  </div>
                </div>
              )}
            </div>
            )}

            {wizardStep === 2 && (
            <>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Sponsorluk Seviyesi</Label>
                <Select value={newTierId} onValueChange={(v) => { setNewTierId(v === "__none__" ? "" : v); setNewPackageId(""); }}>
                  <SelectTrigger><SelectValue placeholder="Seviye seçin (opsiyonel)" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Seviyesiz</SelectItem>
                    {tiers.map((t) => {
                      const usage = tierUsage[t.id];
                      const full = usage != null && usage.capacity != null && usage.used >= usage.capacity;
                      const suffix = usage == null ? "" : usage.capacity == null ? ` — ${usage.used} dolu` : ` — ${usage.used}/${usage.capacity} dolu`;
                      return (
                        <SelectItem key={t.id} value={t.id} disabled={full}>
                          {t.name}{suffix} — {fmtMoney(t.price, t.currency)}{full ? " (dolu)" : ""}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
                {tiers.length === 0 && (
                  <p className="text-[10px] text-muted-foreground">Seviye yok — önce bu etkinlik için tier tanımlayın.</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label>Paket</Label>
                <Select
                  value={newPackageId}
                  onValueChange={(v) => {
                    const id = v === "__none__" ? "" : v;
                    setNewPackageId(id);
                    // P11.2: paket fiyatı varsayılan tutar (kullanıcı değiştirmediyse).
                    if (!amountTouched) {
                      const pack = packages.find((p) => p.id === id);
                      setNewAmount(pack ? String(pack.price / 100) : "");
                    }
                  }}
                >
                  <SelectTrigger><SelectValue placeholder="Paket seçin (opsiyonel)" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Paketsiz</SelectItem>
                    {visiblePackages.map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.name} — {fmtMoney(p.price, p.currency)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {packages.length === 0 && (
                  <p className="text-[10px] text-muted-foreground">Paket yok — önce bu etkinlik için paket tanımlayın.</p>
                )}
              </div>
            </div>

            {selectedPackage && (
              <div className="rounded-lg border bg-muted/30 p-2.5 text-[11px] space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-medium">{selectedPackage.name}</span>
                  <span className="font-bold tabular-nums">{fmtMoney(selectedPackage.price, selectedPackage.currency)}</span>
                </div>
                {selectedTier && (
                  <p className="text-muted-foreground">Seviye: {selectedTier.name}</p>
                )}
                {selectedPackage.rightsSpec ? (
                  <p className="text-muted-foreground">Haklar: {selectedPackage.rightsSpec}</p>
                ) : (
                  <p className="text-muted-foreground italic">Hak özeti tanımlanmamış.</p>
                )}
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Anlaşma Tutarı (TL)</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={newAmount}
                  onChange={(e) => { setNewAmount(e.target.value); setAmountTouched(true); }}
                  placeholder="250000"
                />
                <p className="text-[10px] text-muted-foreground">Kuruşa çevrilerek saklanır (250.000 TL → 25.000.000 kuruş).</p>
                {selectedPackage && draftAmountMinor != null && draftAmountMinor !== selectedPackage.price && (
                  <p className="text-[10px] text-amber-700">Paket fiyatından farklı — kaydetme fiyat rolü gerektirir.</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label>Başlangıç Aşaması</Label>
                <Select value={newStage} onValueChange={setNewStage}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {INITIAL_DEAL_STAGES.map((s) => (
                      <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            </>
            )}

            {wizardStep === 3 && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>Sözleşme Vadesi (opsiyonel — teslim kaydı üretir)</Label>
                <Input
                  type="date"
                  value={newDueDate}
                  onChange={(e) => setNewDueDate(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Notlar (opsiyonel)</Label>
                <textarea
                  className="w-full rounded-md border bg-background px-2 py-1.5 text-xs min-h-20"
                  value={newNotes}
                  onChange={(e) => setNewNotes(e.target.value)}
                  placeholder="Anlaşma notları..."
                />
              </div>
            </div>
            )}

            {wizardStep === 4 && (
            <div className="rounded-lg border bg-muted/30 p-3 text-[11px] space-y-1.5">
              <h4 className="font-semibold text-xs">Özet ve Onay</h4>
              <div className="flex justify-between"><span className="text-muted-foreground">Kurum</span><span className="font-medium">{organizations.find((o) => o.id === newOrgId)?.name ?? "—"}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Seviye</span><span className="font-medium">{tiers.find((t) => t.id === newTierId)?.name ?? "Seviyesiz"}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Paket</span><span className="font-medium">{selectedPackage?.name ?? "Paketsiz"}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Tutar</span><span className="font-bold tabular-nums">{draftAmountMinor == null ? "—" : fmtMoney(draftAmountMinor)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Başlangıç</span><span className="font-medium">{newStage}</span></div>
              {newDueDate !== "" && (
                <div className="flex justify-between"><span className="text-muted-foreground">Sözleşme vadesi</span><span className="font-medium">{newDueDate} (teslim kaydı açılır)</span></div>
              )}
              {selectedPackage && draftAmountMinor != null && draftAmountMinor !== selectedPackage.price && (
                <p className="text-amber-700">Paket fiyatından farklı tutar — fiyat rolü gerekir.</p>
              )}
            </div>
            )}

            {stepBlockReason && wizardStep < 4 && (
              <p className="text-[11px] text-amber-700">{stepBlockReason}</p>
            )}
            {formError && (
              <p className="text-[11px] text-destructive">{formError}</p>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={resetWizard} disabled={saving}>Vazgeç</Button>
            {wizardStep > 1 && (
              <Button variant="outline" onClick={() => setWizardStep((s) => (s - 1) as 1 | 2 | 3 | 4)} disabled={saving}>
                Geri
              </Button>
            )}
            {wizardStep < 4 ? (
              <Button onClick={() => setWizardStep((s) => (s + 1) as 1 | 2 | 3 | 4)} disabled={saving || stepBlockReason != null}>
                İleri
              </Button>
            ) : (
              <Button onClick={handleCreateDeal} disabled={saving || submitted || !newOrgId || draftAmountMinor == null}>
                {saving ? t("common.saving") : t("sponsorship.saveDeal")}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
