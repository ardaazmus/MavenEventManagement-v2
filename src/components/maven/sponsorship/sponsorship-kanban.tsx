"use client";
import React, { useMemo, useRef, useState } from "react";
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
import { apiSend } from "@/lib/client";
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
  const [b2bOpen, setB2bOpen] = useState(false);
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
  const submittedRef = useRef(false);
  const [newOrgOpen, setNewOrgOpen] = useState(false);
  const [newOrgName, setNewOrgName] = useState("");
  const [newOrgSaving, setNewOrgSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

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
      setFormError(e instanceof Error ? e.message : "Kurum oluşturulamadı");
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
    submittedRef.current = false;
  };

  const handleCreateDeal = async () => {
    // P11.4: çift-gönderim koruması — biten kayıt tekrar gönderilmez.
    if (!newOrgId || !onNewDeal || saving || submittedRef.current) return;
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
      submittedRef.current = true;
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
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setB2bOpen(true)}>
            <Users className="size-3.5 text-primary" /> B2B Matchmaking Matrisi
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

      {/* B2B Matchmaking Masa x Zaman Randevu Matrisi Modalı */}
      <Dialog open={b2bOpen} onOpenChange={setB2bOpen}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto text-xs">
          <DialogHeader>
            <DialogTitle className="text-sm font-semibold flex items-center gap-2">
              <Users className="size-4 text-primary" />
              B2B Matchmaking — Masa × Zaman Randevu Matrisi (Swapcard / Brella Prototipi)
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="rounded-lg border bg-muted/40 p-3 flex items-center justify-between">
              <div>
                <p className="font-medium text-foreground">İkili İş Görüşmeleri (B2B Area)</p>
                <p className="text-[11px] text-muted-foreground">15 dakikalık oturumlar, 10 B2B Masası</p>
              </div>
              <Badge className="bg-primary text-primary-foreground">AI Algoritmik Eşleştirme Aktif</Badge>
            </div>

            {/* Masa x Saat Matrisi */}
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full border-collapse text-left text-xs">
                <thead>
                  <tr className="border-b bg-muted/60 text-muted-foreground">
                    <th className="p-2.5 font-medium border-r w-20 text-center">Saat</th>
                    {["Masa 1 (İlaç)", "Masa 2 (Cihaz)", "Masa 3 (Biyotek)", "Masa 4 (Yazılım)"].map((m) => (
                      <th key={m} className="p-2.5 font-semibold text-foreground border-r last:border-r-0">
                        {m}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {[
                    { time: "10:00", t1: "Novartis ↔ Prof. Kaya", t2: "Boş", t3: "Roche ↔ Dr. Akın", t4: "Siemens ↔ Başhekimlik" },
                    { time: "10:30", t1: "Pfizer ↔ Doç. Demir", t2: "Philips ↔ Klinik", t3: "Boş", t4: "GE Health ↔ Satınalma" },
                    { time: "11:00", t1: "Bayer ↔ Onkoloji D.", t2: "Sanofi ↔ Heyet", t3: "AstraZeneca ↔ Ar-Ge", t4: "Boş" },
                    { time: "11:30", t1: "Boş", t2: "Tıbbi Cihazlar ↔ Komite", t3: "Boş", t4: "Klinik Yazılım ↔ IT" },
                  ].map((row) => (
                    <tr key={row.time} className="hover:bg-muted/10">
                      <td className="p-2 border-r text-center font-mono text-muted-foreground bg-muted/20">{row.time}</td>
                      {[row.t1, row.t2, row.t3, row.t4].map((slot, i) => (
                        <td key={i} className="p-2 border-r last:border-r-0">
                          {slot === "Boş" ? (
                            <span className="text-[10px] text-muted-foreground italic">Uygun Slot</span>
                          ) : (
                            <div className="rounded bg-primary/10 border border-primary/20 p-1 font-medium text-foreground text-[11px]">
                              {slot}
                            </div>
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <DialogFooter>
            <Button onClick={() => setB2bOpen(false)}>Kapat</Button>
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
                  <SelectTrigger className="flex-1"><SelectValue placeholder="Kurum seçin" /></SelectTrigger>
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
                      {newOrgSaving ? "Kaydediliyor..." : duplicateOrg ? "Mevcut Kaydı Seç" : "Kurumu Oluştur"}
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
              <Button onClick={handleCreateDeal} disabled={saving || submittedRef.current || !newOrgId || draftAmountMinor == null}>
                {saving ? "Kaydediliyor..." : "Anlaşmayı Kaydet"}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
