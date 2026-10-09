"use client";
// Sponsor & Fuar — tier/paket/anlaşma, Entitlement motoru (20/14/2/4), teslimler, stand tahsisi
import { useState, useEffect } from "react";
import { listEntity, apiSend } from "@/lib/client";
import { useApp } from "@/lib/store";
import { SectionCard, EmptyState, Loading, ErrorState, useApi, PageHeader, StatusBadge, Chip } from "../bits";
import { DELIVERABLE_STATUS, fmtDate, fmtMoney, CLAIM_STATUS, APPROVAL_STATUS, label } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useLang } from "@/lib/i18n";
import * as Icons from "lucide-react";
import { cn } from "@/lib/utils";
import { SponsorshipKanban } from "@/components/maven/sponsorship/sponsorship-kanban";

interface Agreement {
  id: string; amount: number; currency: string; status: string; signedAt?: string | null;
  organization: { id: string; name: string };
  package?: { id: string; name: string; rightsSpec?: string | null } | null;
  tier?: { id: string; name: string } | null;
  deliverables: { id: string; name: string; type: string; status: string; dueDate?: string | null; responsible?: string | null; notes?: string | null; proofUrl?: string | null }[];
  boothAllocations: { id: string; status: string; boothUnit: { code: string; sizeSqm: number; status: string } }[];
}
interface Entitlement {
  id: string; label: string; type: string; source: string; quantityGranted: number; quantityConsumed: number; quantityReserved: number; restrictions?: string | null;
  approvalStatus?: string; approvedBy?: string | null; approvedAt?: string | null;
  ownerOrganization?: { id: string; name: string } | null;
  claims: { id: string; guestName?: string | null; status: string; notes?: string | null }[];
}
interface BoothUnit {
  id: string; code: string; sizeSqm: number; type: string; status: string; price: number; currency: string; optionExpiresAt?: string | null;
  allocation?: { id: string; status: string; organization?: { name: string } | null; agreement?: { id: string } | null } | null;
  floorObject?: { id: string; label?: string | null; x: number; y: number; width: number; height: number } | null;
}

const BOOTH_TONE: Record<string, string> = {
  AVAILABLE: "border-emerald-300 bg-emerald-50 text-emerald-800",
  HELD: "border-amber-300 bg-amber-50 text-amber-800",
  OPTION: "border-amber-400 bg-amber-100 text-amber-900",
  RESERVED: "border-violet-400 bg-violet-100 text-violet-900",
  CONTRACTED: "border-teal-500 bg-teal-500/15 text-teal-800",
  BLOCKED: "border-neutral-300 bg-neutral-100 text-neutral-600",
  OCCUPIED: "border-violet-500 bg-violet-200 text-violet-900",
  RELEASED: "border-neutral-200 bg-neutral-50 text-neutral-500",
};

// hak onay akışı — APPROVED teal, PROPOSED amber, REJECTED rose (renk dili)
const APPROVAL_TONE: Record<string, "teal" | "amber" | "rose"> = { APPROVED: "teal", PROPOSED: "amber", REJECTED: "rose" };
const ENT_TYPES: Record<string, string> = {
  COMPLIMENTARY_REGISTRATION: "sponsorship.entType.complimentaryRegistration", BOOTH: "sponsorship.entType.booth", GALA_TICKET: "sponsorship.entType.galaTicket", BADGE: "sponsorship.entType.badge",
  LOUNGE_ACCESS: "sponsorship.entType.loungeAccess", DISCOUNT: "sponsorship.entType.discount", SESSION_ACCESS: "sponsorship.entType.sessionAccess", HOTEL: "sponsorship.entType.hotel", CUSTOM: "sponsorship.entType.custom",
};

export function SponsorshipView() {
  const { currentEditionId, bump, refreshKey, moduleSubView, setModuleSubView, setModule } = useApp();
  const { toast } = useToast();
  const { t } = useLang(); // dil değişiminde re-render (F9-R-d)
  const [tab, setTab] = useState<"sponsors" | "packages" | "entitlements" | "deliverables" | "booths">("sponsors");
  const [guestTarget, setGuestTarget] = useState<Entitlement | null>(null);
  const [guest, setGuest] = useState({ firstName: "", lastName: "", email: "", company: "" });
  const [busy, setBusy] = useState(false);
  const [allocTarget, setAllocTarget] = useState<BoothUnit | null>(null);
  // — onay akışı durumu —
  const [pendingOnly, setPendingOnly] = useState(false);
  const [busyApprovalId, setBusyApprovalId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState({ label: "", type: "COMPLIMENTARY_REGISTRATION", orgId: "__none__", quantityGranted: 1, restrictions: "", approvalStatus: "APPROVED" });
  // P10.1: seviye/paket tanımları — kompakt yönetici formu
  const [tierForm, setTierForm] = useState({ name: "", priceMajor: "", capacity: "" });
  const [packForm, setPackForm] = useState({ name: "", priceMajor: "", tierId: "__none__", rightsSpec: "" });
  const [defsError, setDefsError] = useState<string | null>(null);

  useEffect(() => {
    if (!moduleSubView) return;
    const timer = setTimeout(() => {
      if (moduleSubView === "sponsors") {
        setTab("sponsors");
      } else if (moduleSubView === "packages") {
        setTab("packages");
      } else if (moduleSubView === "deliverables") {
        setTab("deliverables");
      } else if (moduleSubView === "entitlements") {
        setTab("entitlements");
      } else if (moduleSubView === "booths") {
        setTab("booths");
      }
    }, 0);
    return () => clearTimeout(timer);
  }, [moduleSubView]);

  const { data: agreements, error, reload, loading } = useApi<Agreement[]>(() => listEntity<Agreement>("sponsor-agreements", { editionId: currentEditionId ?? undefined }), [currentEditionId, refreshKey]);
  const { data: entitlements, reload: reloadEnts } = useApi<Entitlement[]>(() => listEntity<Entitlement>("entitlements", { editionId: currentEditionId ?? undefined }), [currentEditionId, refreshKey]);
  const { data: booths } = useApi<BoothUnit[]>(() => listEntity<BoothUnit>("booth-units", { editionId: currentEditionId ?? undefined }), [currentEditionId, refreshKey]);
  const { data: orgDirectory, reload: reloadOrgs } = useApi<{ id: string; name: string }[]>(() => listEntity<{ id: string; name: string }>("organizations"), [refreshKey]);
  const { data: tierDirectory } = useApi<{ id: string; name: string; price: number; currency: string; capacity: number | null }[]>(() => listEntity<{ id: string; name: string; price: number; currency: string; capacity: number | null }>("sponsor-tiers", { editionId: currentEditionId ?? undefined }), [currentEditionId, refreshKey]);
  const { data: packageDirectory } = useApi<{ id: string; name: string; price: number; currency: string; tierId: string | null; rightsSpec: string | null }[]>(() => listEntity<{ id: string; name: string; price: number; currency: string; tierId: string | null; rightsSpec: string | null }>("sponsor-packages", { editionId: currentEditionId ?? undefined }), [currentEditionId, refreshKey]);

  const addGuest = async () => {
    if (!guestTarget) return;
    setBusy(true);
    try {
      await apiSend("/api/flows", "POST", { action: "sponsor.guest", entitlementId: guestTarget.id, ...guest });
      toast({
        title: "Sponsor misafiri ayrıldı",
        description: t("sponsorship.guestFlowDesc"),
      });
      setGuestTarget(null); setGuest({ firstName: "", lastName: "", email: "", company: "" });
      reload(); bump();
    } catch (e) {
      toast({ title: "Hak ayrılamadı", description: e instanceof Error ? e.message : "Hata", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const [allocAgreementId, setAllocAgreementId] = useState("");
  const allocCandidates = (agreements ?? []).filter((a) => ["CONTRACTED", "ACTIVE"].includes(a.status));

  const allocateBooth = async () => {
    if (!allocTarget || !allocAgreementId) return;
    setBusy(true);
    try {
      const selected = allocCandidates.find((a) => a.id === allocAgreementId);
      await apiSend("/api/flows", "POST", { action: "booth.allocate", boothUnitId: allocTarget.id, agreementId: allocAgreementId, organizationId: selected?.organization.id });
      toast({ title: "Stand tahsis edildi", description: `${allocTarget.code} ticari kayıt Maven'da; Floor Studio geometrisi ayrıdır.` });
      setAllocTarget(null); setAllocAgreementId(""); reload(); bump();
    } catch (e) {
      toast({ title: "Tahsis edilemedi", description: e instanceof Error ? e.message : "Hata", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  // — hak onay akışı: PROPOSED → APPROVED / REJECTED (Komite imzasıyla) —
  const setApproval = async (ent: Entitlement, status: "APPROVED" | "REJECTED") => {
    setBusyApprovalId(ent.id);
    try {
      await apiSend(`/api/entitlements/${ent.id}`, "PUT", {
        approvalStatus: status,
        approvedBy: "Komite",
        approvedAt: new Date().toISOString(),
      });
      toast({
        title: status === "APPROVED" ? "Hak onaylandı" : "Hak reddedildi",
        description: `${ent.label} — "Komite" imzasıyla kaydedildi.`,
      });
      reloadEnts(); bump();
    } catch (e) {
      toast({ title: "Onay işlemi başarısız", description: e instanceof Error ? e.message : "Hata", variant: "destructive" });
    } finally {
      setBusyApprovalId(null);
    }
  };

  // — yeni hak havuzu (öneri olarak da eklenebilir) —
  const createEntitlement = async () => {
    if (!createForm.label.trim() || !currentEditionId) return;
    setBusy(true);
    try {
      await apiSend("/api/entitlements", "POST", {
        editionId: currentEditionId,
        label: createForm.label.trim(),
        type: createForm.type,
        source: "SPONSOR_PACKAGE",
        ownerOrganizationId: createForm.orgId === "__none__" ? null : createForm.orgId,
        quantityGranted: Math.max(0, Math.round(Number(createForm.quantityGranted) || 0)),
        restrictions: createForm.restrictions.trim() || null,
        approvalStatus: createForm.approvalStatus,
      });
      toast({
        title: createForm.approvalStatus === "PROPOSED" ? "Hak önerisi kaydedildi" : "Hak havuzu eklendi",
        description: createForm.approvalStatus === "PROPOSED"
          ? `${createForm.label.trim()} — onay bekleyen haklar listesinde görünecek.`
          : `${createForm.label.trim()} — doğrudan onaylı olarak tanındı.`,
      });
      setCreateOpen(false);
      reloadEnts(); bump();
    } catch (e) {
      toast({ title: "Hak havuzu eklenemedi", description: e instanceof Error ? e.message : "Hata", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  if (loading && !agreements) return <Loading rows={5} />;
  if (error) return <ErrorState message={error} onRetry={reload} />;

  const pendingCount = (entitlements ?? []).filter((e) => e.approvalStatus === "PROPOSED").length;
  const sponsorEnts = (entitlements ?? []).filter((e) => e.ownerOrganization && (!pendingOnly || e.approvalStatus === "PROPOSED"));
  const orgOptions = Array.from(new Map((agreements ?? []).map((a) => [a.organization.id, a.organization])).values());

  const handleMoveKanbanStage = async (agreementId: string, targetStage: string, opts?: { transitionReason?: string; signedAt?: string }) => {
    await apiSend(`/api/sponsor-agreements/${agreementId}`, "PUT", {
      status: targetStage,
      ...(opts?.transitionReason ? { transitionReason: opts.transitionReason } : {}),
      ...(opts?.signedAt ? { signedAt: opts.signedAt } : {}),
    });
    toast({ title: "Aşama Güncellendi", description: `Anlaşma ${targetStage} aşamasına taşındı.` });
    reload();
  };

  const handleNewDeal = async (deal: { organizationId: string; amountMinor: number; stage: string; tierId?: string | null; packageId?: string | null; notes?: string | null }) => {
    if (!currentEditionId) throw new Error(t("sponsorship.noEdition"));
    try {
      const created = await apiSend<{ id: string; amount: number; organization?: { name?: string } | null }>("/api/sponsor-agreements", "POST", {
        editionId: currentEditionId,
        organizationId: deal.organizationId,
        amountMinor: deal.amountMinor,
        currency: "TRY",
        status: deal.stage,
        ...(deal.tierId ? { tierId: deal.tierId } : {}),
        ...(deal.packageId ? { packageId: deal.packageId } : {}),
        ...(deal.notes ? { notes: deal.notes } : {}),
      });
      const orgName = created.organization?.name ?? (orgDirectory ?? []).find((o) => o.id === deal.organizationId)?.name ?? "Anlaşma";
      toast({ title: "Sponsorluk Anlaşması Eklendi", description: `${orgName} — ${fmtMoney(created.amount)}` });
      reload();
      return { id: created.id };
    } catch (e) {
      // P10.3: kapasite çakışması (409) sonrası listeyi tazele, hatayı forma ilet.
      if (e instanceof Error && /kapasite|doldu|409/i.test(e.message)) reload();
      throw e;
    }
  };

  // P10.3: tier doluluk haritası (CONTRACTED/ACTIVE sayımı) — UI ön-kontrolü, son söz API'de.
  const tierUsage: Record<string, { used: number; capacity: number | null }> = {};
  for (const t of tierDirectory ?? []) tierUsage[t.id] = { used: 0, capacity: t.capacity ?? null };
  for (const a of agreements ?? []) {
    if ((a.status === "CONTRACTED" || a.status === "ACTIVE") && a.tier && tierUsage[a.tier.id]) {
      tierUsage[a.tier.id].used += 1;
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title={t("sponsorship.title") || "Sponsor & Fuar"}
        desc="Tier hard-code değildir — her etkinlik kendi tier'ını tanımlar; hak tüketimi finansal işlem değildir"
      >
        <div className="flex flex-wrap rounded-lg border p-0.5 bg-muted/30">
          <button
            type="button"
            onClick={() => { setTab("sponsors"); setModuleSubView?.("sponsors"); }}
            className={cn("rounded-md px-3 py-1.5 text-xs font-medium transition-colors", tab === "sponsors" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}
          >
            {t("sponsorship.tabSponsors")}
          </button>
          <button
            type="button"
            onClick={() => { setTab("packages"); setModuleSubView?.("packages"); }}
            className={cn("rounded-md px-3 py-1.5 text-xs font-medium transition-colors", tab === "packages" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}
          >
            {t("sponsorship.tabPackages")}
          </button>
          <button
            type="button"
            onClick={() => { setTab("entitlements"); setModuleSubView?.("entitlements"); }}
            className={cn("rounded-md px-3 py-1.5 text-xs font-medium transition-colors", tab === "entitlements" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}
          >
            {t("sponsorship.tabEntitlements")}
          </button>
          <button
            type="button"
            onClick={() => { setTab("deliverables"); setModuleSubView?.("deliverables"); }}
            className={cn("rounded-md px-3 py-1.5 text-xs font-medium transition-colors", tab === "deliverables" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}
          >
            {t("sponsorship.tabDeliverables")}
          </button>
          <button
            type="button"
            onClick={() => { setTab("booths"); setModuleSubView?.("booths"); }}
            className={cn("rounded-md px-3 py-1.5 text-xs font-medium transition-colors", tab === "booths" ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}
          >
            {t("sponsorship.tabBooths")}
          </button>
        </div>
      </PageHeader>

      {/* Sponsor Dış Portalı İzolasyonu Bilgilendirme Kartı */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 rounded-xl border border-primary/20 bg-primary/5 p-4 text-xs">
        <div className="flex items-start gap-2.5">
          <Icons.ShieldCheck className="size-5 text-primary shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-foreground">Sponsor Dış Portalı (Portal İzolasyonu)</p>
            <p className="text-muted-foreground leading-relaxed mt-0.5">{t("sponsorship.portalIsolationNotice")}</p>
          </div>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="shrink-0 gap-1.5 text-xs border-primary/30 hover:bg-primary/10"
          onClick={() => {
            window.open(`/portal`, "_blank");
          }}
        >
          <Icons.ExternalLink className="size-3.5" />
          {t("sponsorship.btnOpenSponsorPortal")}
        </Button>
      </div>

      {/* Sponsorluk Kanban Boru Hattı */}
      {tab === "sponsors" && (
        <SponsorshipKanban
          agreements={(agreements ?? []) as any}
          organizations={(orgDirectory ?? []).map((o) => ({ id: o.id, name: o.name }))}
          tiers={(tierDirectory ?? []).map((t) => ({ id: t.id, name: t.name, price: t.price, currency: t.currency }))}
          packages={(packageDirectory ?? []).map((p) => ({ id: p.id, name: p.name, price: p.price, currency: p.currency, tierId: p.tierId, rightsSpec: p.rightsSpec }))}
          tierUsage={tierUsage}
          onMoveStage={handleMoveKanbanStage}
          onNewDeal={handleNewDeal}
          onOrganizationsChanged={reloadOrgs}
        />
      )}

      {/* P10.1: Seviye & Paket Tanımları */}
      {tab === "packages" && (
        <SectionCard
          title="Seviye & Paket Tanımları"
          desc="Kullanımda olan seviye/paket silinemez (409). Fiyatlar TL girilir, kuruş saklanır."
          action={defsError ? <span className="text-[11px] text-destructive">{defsError}</span> : undefined}
        >
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="space-y-2">
              <h4 className="text-xs font-semibold">Seviyeler ({(tierDirectory ?? []).length})</h4>
              {(tierDirectory ?? []).length === 0 && <EmptyState title="Tanımlı seviye yok" />}
              {(tierDirectory ?? []).map((t) => {
                const usage = tierUsage[t.id];
                return (
                  <div key={t.id} className="flex items-center justify-between gap-2 rounded-lg border p-2 text-xs">
                    <span className="font-medium line-clamp-1">{t.name}</span>
                    <span className="text-[11px] text-muted-foreground tabular-nums">
                      {fmtMoney(t.price, t.currency)}{usage ? (usage.capacity == null ? ` — ${usage.used} dolu` : ` — ${usage.used}/${usage.capacity} dolu`) : ""}
                    </span>
                    <Button
                      size="sm" variant="ghost" className="h-6 text-[10px] text-destructive"
                      disabled={busy}
                      onClick={async () => {
                        setBusy(true); setDefsError(null);
                        try {
                          await apiSend(`/api/sponsor-tiers/${t.id}`, "DELETE");
                          bump();
                        } catch (e) {
                          setDefsError(e instanceof Error ? e.message : "Silinemedi");
                        } finally {
                          setBusy(false);
                        }
                      }}
                    >
                      Sil
                    </Button>
                  </div>
                );
              })}
              <div className="flex flex-wrap gap-1.5 pt-1">
                <Input className="h-7 text-[11px] flex-1 min-w-28" placeholder="Seviye adı" value={tierForm.name} onChange={(e) => setTierForm({ ...tierForm, name: e.target.value })} />
                <Input className="h-7 text-[11px] w-24" type="number" min="0" step="0.01" placeholder="Fiyat TL" value={tierForm.priceMajor} onChange={(e) => setTierForm({ ...tierForm, priceMajor: e.target.value })} />
                <Input className="h-7 text-[11px] w-20" type="number" min="0" step="1" placeholder="Kapasite" value={tierForm.capacity} onChange={(e) => setTierForm({ ...tierForm, capacity: e.target.value })} />
                <Button
                  size="sm" className="h-7 text-[11px]" disabled={busy || !tierForm.name.trim() || !currentEditionId}
                  onClick={async () => {
                    setBusy(true); setDefsError(null);
                    try {
                      await apiSend("/api/sponsor-tiers", "POST", {
                        editionId: currentEditionId,
                        name: tierForm.name.trim(),
                        price: Math.round((Number(tierForm.priceMajor) || 0) * 100),
                        capacity: tierForm.capacity === "" ? null : Math.max(0, Math.round(Number(tierForm.capacity))),
                      });
                      setTierForm({ name: "", priceMajor: "", capacity: "" });
                      bump();
                    } catch (e) {
                      setDefsError(e instanceof Error ? e.message : "Eklenemedi");
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  Ekle
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              <h4 className="text-xs font-semibold">Paketler ({(packageDirectory ?? []).length})</h4>
              {(packageDirectory ?? []).length === 0 && <EmptyState title="Tanımlı paket yok" />}
              {(packageDirectory ?? []).map((p) => (
                <div key={p.id} className="flex items-center justify-between gap-2 rounded-lg border p-2 text-xs">
                  <span className="font-medium line-clamp-1">{p.name}</span>
                  <span className="text-[11px] text-muted-foreground tabular-nums">{fmtMoney(p.price, p.currency)}</span>
                  <Button
                    size="sm" variant="ghost" className="h-6 text-[10px] text-destructive"
                    disabled={busy}
                    onClick={async () => {
                      setBusy(true); setDefsError(null);
                      try {
                        await apiSend(`/api/sponsor-packages/${p.id}`, "DELETE");
                        bump();
                      } catch (e) {
                        setDefsError(e instanceof Error ? e.message : "Silinemedi");
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    Sil
                  </Button>
                </div>
              ))}
              <div className="flex flex-wrap gap-1.5 pt-1">
                <Input className="h-7 text-[11px] flex-1 min-w-28" placeholder="Paket adı" value={packForm.name} onChange={(e) => setPackForm({ ...packForm, name: e.target.value })} />
                <Input className="h-7 text-[11px] w-24" type="number" min="0" step="0.01" placeholder="Fiyat TL" value={packForm.priceMajor} onChange={(e) => setPackForm({ ...packForm, priceMajor: e.target.value })} />
                <Select value={packForm.tierId} onValueChange={(v) => setPackForm({ ...packForm, tierId: v })}>
                  <SelectTrigger className="h-7 w-28 text-[11px]"><SelectValue placeholder="Seviye" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Seviyesiz</SelectItem>
                    {(tierDirectory ?? []).map((t) => (
                      <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input className="h-7 text-[11px] flex-1 min-w-28" placeholder="Hak özeti (örn: 2 stand)" value={packForm.rightsSpec} onChange={(e) => setPackForm({ ...packForm, rightsSpec: e.target.value })} />
                <Button
                  size="sm" className="h-7 text-[11px]" disabled={busy || !packForm.name.trim() || !currentEditionId}
                  onClick={async () => {
                    setBusy(true); setDefsError(null);
                    try {
                      await apiSend("/api/sponsor-packages", "POST", {
                        editionId: currentEditionId,
                        name: packForm.name.trim(),
                        price: Math.round((Number(packForm.priceMajor) || 0) * 100),
                        tierId: packForm.tierId === "__none__" ? null : packForm.tierId,
                        rightsSpec: packForm.rightsSpec.trim() || null,
                      });
                      setPackForm({ name: "", priceMajor: "", tierId: "__none__", rightsSpec: "" });
                      bump();
                    } catch (e) {
                      setDefsError(e instanceof Error ? e.message : "Eklenemedi");
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  Ekle
                </Button>
              </div>
            </div>
          </div>
        </SectionCard>
      )}

      {/* Hak havuzları */}
      {tab === "entitlements" && (
        <SectionCard
          title="Entitlement Havuzları"
          desc="Hak kaynağı → sahip → tanınan → ayrılmış → kullanılan → kalan (§15)"
          action={
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setPendingOnly((v) => !v)}
                aria-pressed={pendingOnly}
                className={cn(
                  "inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium transition-colors",
                  pendingOnly ? "border-amber-300 bg-amber-100 text-amber-900" : "bg-card text-muted-foreground hover:bg-muted",
                )}
              >
                <Icons.Hourglass className={cn("size-3.5", pendingCount > 0 && "text-amber-500")} />
                Onay bekleyen haklar
                <span className={cn("rounded-full px-1.5 text-[10px] tabular-nums", pendingCount > 0 ? "bg-amber-500/15 text-amber-800" : "bg-muted text-muted-foreground")}>{pendingCount}</span>
              </button>
              <Button size="sm" variant="outline" onClick={() => { setCreateForm({ label: "", type: "COMPLIMENTARY_REGISTRATION", orgId: "__none__", quantityGranted: 1, restrictions: "", approvalStatus: "APPROVED" }); setCreateOpen(true); }}>
                <Icons.Plus className="size-3.5" /> Hak Havuzu Ekle
              </Button>
            </div>
          }
        >
          {sponsorEnts.length === 0 ? (
            <EmptyState
              title={pendingOnly ? "Onay bekleyen hak yok" : "Hak havuzu yok"}
              desc={pendingOnly ? "Tüm haklar karara bağlanmış — filtreyi kapatın." : "Sponsor sözleşmesiyle hak tanımlayın veya öneri olarak ekleyin."}
            />
          ) : (
            <div className="grid gap-3 lg:grid-cols-2">
              {sponsorEnts.map((ent) => {
                const remaining = Math.max(0, ent.quantityGranted - ent.quantityConsumed - ent.quantityReserved);
                const pct = ent.quantityGranted ? Math.round((ent.quantityConsumed / ent.quantityGranted) * 100) : 0;
                const isProposed = ent.approvalStatus === "PROPOSED";
                return (
                  <div key={ent.id} className={cn("animate-in rounded-xl border p-4 transition-all duration-200 hover:shadow-md fade-in slide-in-from-bottom-1 fill-mode-backwards", isProposed && "border-amber-200 bg-amber-50/30")}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="flex flex-wrap items-center gap-1.5 text-sm font-semibold">
                          <span className="truncate">{ent.label}</span>
                          <Chip tone={APPROVAL_TONE[ent.approvalStatus ?? "APPROVED"] ?? "neutral"}>
                            {ent.approvalStatus === "PROPOSED" && <Icons.Hourglass className="mr-0.5 inline size-3" />}
                            {label(APPROVAL_STATUS, ent.approvalStatus) ?? "Onaylı"}
                          </Chip>
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {ent.ownerOrganization?.name} · {ENT_TYPES[ent.type] ? t(ENT_TYPES[ent.type]) : ent.type}
                          {ent.approvalStatus === "APPROVED" && ent.approvedBy && <span> · onay: {ent.approvedBy}{ent.approvedAt ? ` · ${fmtDate(ent.approvedAt)}` : ""}</span>}
                          {ent.approvalStatus === "REJECTED" && <span className="text-rose-600"> · komite kararıyla reddedildi</span>}
                        </p>
                      </div>
                      <Button size="sm" variant="outline" onClick={() => setGuestTarget(ent)} disabled={remaining <= 0 || isProposed} title={isProposed ? "Önce komite onayı gerekir" : undefined}>
                        <Icons.UserPlus className="size-3.5" /> Misafir Ekle
                      </Button>
                    </div>
                    {/* 09-C: 20 / 14 / 2 / 4 dökümü */}
                    <div className="mt-3 grid grid-cols-4 gap-2 text-center">
                      <div className="rounded-lg bg-muted p-2"><p className="text-lg font-semibold tabular-nums">{ent.quantityGranted}</p><p className="text-[11px] text-muted-foreground">tanınan</p></div>
                      <div className="rounded-lg bg-teal-500/10 p-2"><p className="text-lg font-semibold tabular-nums text-teal-700">{ent.quantityConsumed}</p><p className="text-[11px] text-teal-600/80">kullanılan</p></div>
                      <div className="rounded-lg bg-amber-500/10 p-2"><p className="text-lg font-semibold tabular-nums text-amber-700">{ent.quantityReserved}</p><p className="text-[11px] text-amber-800">ayrılmış</p></div>
                      <div className="rounded-lg bg-emerald-500/10 p-2"><p className="text-lg font-semibold tabular-nums text-emerald-700">{remaining}</p><p className="text-[11px] text-emerald-800">kalan</p></div>
                    </div>
                    <Progress value={pct} className="mt-3 h-2" />
                    <p className="mt-1 text-[11px] text-muted-foreground">%{pct} tüketildi · {ent.restrictions ?? "kısıt yok"}</p>
                    {isProposed && (
                      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-amber-200/60 pt-2.5">
                        <span className="text-[11px] text-muted-foreground">Komite kararı bekleniyor — onaysız haktan misafir ayrılamaz.</span>
                        <div className="ml-auto flex gap-1.5">
                          <Button size="sm" className="h-7 bg-teal-600 text-[11px] text-white hover:bg-teal-700" onClick={() => setApproval(ent, "APPROVED")} disabled={busyApprovalId === ent.id}>
                            {busyApprovalId === ent.id ? <Icons.Loader2 className="size-3 animate-spin" /> : <Icons.Check className="size-3" />} Onayla
                          </Button>
                          <Button size="sm" variant="outline" className="h-7 border-rose-200 text-[11px] text-rose-700 hover:bg-rose-50" onClick={() => setApproval(ent, "REJECTED")} disabled={busyApprovalId === ent.id}>
                            <Icons.X className="size-3" /> Reddet
                          </Button>
                        </div>
                      </div>
                    )}
                    <details className="mt-2">
                      <summary className="cursor-pointer text-xs font-medium text-primary/80">Claim dökümü ({ent.claims.length})</summary>
                      <div className="mt-1.5 max-h-36 space-y-1 overflow-y-auto maven-scroll pr-1">
                        {ent.claims.map((c) => (
                          <div key={c.id} className="flex items-center justify-between gap-2 rounded-md bg-muted/50 px-2 py-1 text-xs">
                            <span className="truncate">{c.guestName ?? "—"} <span className="text-muted-foreground">{c.notes ? `· ${c.notes}` : ""}</span></span>
                            <StatusBadge map={CLAIM_STATUS} value={c.status} />
                          </div>
                        ))}
                      </div>
                    </details>
                  </div>
                );
              })}
            </div>
          )}
        </SectionCard>
      )}

      {/* Sözleşmeler & Teslimatlar */}
      {tab === "deliverables" && (
        <SectionCard title="Sponsor Sözleşmeleri" desc="paket + haklar + teslim takvimi">
          {(agreements ?? []).length === 0 ? (
            <EmptyState title="Bu kuruma atanmış bir sponsorluk yok" desc="Sözleşme ekleyin veya kurum rolünü kontrol edin." />
          ) : (
            <div className="grid gap-3">
              {(agreements ?? []).map((ag) => (
                <div key={ag.id} className="rounded-xl border p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-3">
                      <span className="grid size-10 place-items-center rounded-lg bg-violet-500/10 text-violet-600"><Icons.Handshake className="size-5" /></span>
                      <div>
                        <p className="text-sm font-semibold">{ag.organization.name}</p>
                        <p className="text-xs text-muted-foreground">{ag.package?.name ?? ag.tier?.name ?? "Paket yok"} · {fmtMoney(ag.amount, ag.currency)}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <StatusBadge map={{ PROSPECT: "Aday", NEGOTIATION: "Görüşme", CONTRACTED: "Sözleşmeli", ACTIVE: "Aktif", COMPLETED: "Tamamlandı", CANCELLED: "İptal" }} value={ag.status} />
                      {ag.signedAt && <span className="text-xs text-muted-foreground">imza {fmtDate(ag.signedAt)}</span>}
                    </div>
                  </div>
                  {ag.package?.rightsSpec && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {ag.package.rightsSpec.split("·").map((r, i) => <Chip key={i} tone="violet">{r.trim()}</Chip>)}
                    </div>
                  )}
                  {/* P13.2: yayın hazır olma göstergesi (imza + teslimler + ödeme-manuel) */}
                  <div className="mt-2 flex flex-wrap gap-1.5 text-[10px]">
                    <span className={cn("rounded-full border px-2 py-0.5", ag.signedAt ? "border-emerald-300 text-emerald-700" : "border-amber-300 text-amber-700")}>
                      İmza: {ag.signedAt ? "Hazır" : "Eksik"}
                    </span>
                    <span className={cn("rounded-full border px-2 py-0.5", ag.deliverables.length > 0 && ag.deliverables.every((d) => d.status === "APPROVED" || d.status === "COMPLETED") ? "border-emerald-300 text-emerald-700" : ag.deliverables.some((d) => d.status === "REJECTED") ? "border-rose-300 text-rose-700" : "border-amber-300 text-amber-700")}>
                      Teslimler: {ag.deliverables.filter((d) => d.status === "APPROVED" || d.status === "COMPLETED").length}/{ag.deliverables.length} onaylı
                    </span>
                    <span className="rounded-full border border-slate-300 px-2 py-0.5 text-muted-foreground">
                      Ödeme: manuel muhasebe onayı
                    </span>
                  </div>
                  {/* teslim takvimi — P13.1: durum + kanıt */}
                  <div className="mt-3 grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
                    {ag.deliverables.map((d) => (
                      <DeliverableRow key={d.id} deliverable={d} onChanged={bump} />
                    ))}
                  </div>
                  {ag.boothAllocations.length > 0 && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      Stant: {ag.boothAllocations.map((b) => `${b.boothUnit.code} (${b.boothUnit.sizeSqm} m², ${b.boothUnit.status})`).join(", ")} — tahsis Maven'da, geometri Floor Studio'da
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      )}

      {/* Stand planı — ticari durum */}
      {tab === "booths" && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 rounded-lg border border-border bg-muted/40 p-3 text-xs">
            <div className="flex items-center gap-2">
              <Icons.LayoutGrid className="size-4 text-primary shrink-0" />
              <span>{t("sponsorship.boothFloorNotice")}</span>
            </div>
            <Button size="sm" variant="outline" className="shrink-0 h-7 text-xs" onClick={() => setModule?.("floors", null)}>
              <Icons.MapPin className="size-3 mr-1" /> Floor Studio'ya Git
            </Button>
          </div>

          <SectionCard title="Fuar Alanı — Ticari Tahsis" desc="Stant ticari kimlik Maven'dadır; Floor Studio yalnız geometriyi yönetir. Opsiyon süresi dolunca stant RELEASED olur.">
            {(booths ?? []).length === 0 ? (
              <EmptyState title="Stant envanteri yok" desc="Fuar yeteneği açıkken stant birimleri tanımlanır." />
            ) : (
              <div className="flex flex-wrap gap-2">
                {(booths ?? []).map((b) => (
                  <button
                    key={b.id}
                    onClick={() => setAllocTarget(b)}
                    className={cn("w-32 rounded-lg border-2 p-2.5 text-left transition hover:shadow-md", BOOTH_TONE[b.status] ?? "border-border")}
                  >
                    <p className="text-sm font-bold">{b.code}</p>
                    <p className="text-[11px] opacity-80">{b.sizeSqm} m² · {b.type === "SHELL_SCHEME" ? "Kabuk" : "Alandan"}</p>
                    <p className="mt-1 truncate text-[11px] font-medium">{b.allocation?.organization?.name ?? b.status}</p>
                    {b.optionExpiresAt && <p className="text-[10px] opacity-70">opsiyon: {fmtDate(b.optionExpiresAt)}</p>}
                    {b.floorObject && <p className="text-[10px] opacity-70">📍 Floor Studio bağlı</p>}
                  </button>
                ))}
              </div>
            )}
          </SectionCard>
        </div>
      )}

      {/* Misafir ekleme dialogu — hakkın nereden düşeceği görünür */}
      <Dialog open={Boolean(guestTarget)} onOpenChange={(o) => !o && setGuestTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Sponsor Misafiri Ekle</DialogTitle>
            <DialogDescription>
              {guestTarget?.ownerOrganization?.name} — {guestTarget?.label}
              {" "}Kalan: {guestTarget ? Math.max(0, guestTarget.quantityGranted - guestTarget.quantityConsumed - guestTarget.quantityReserved) : 0} hak
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-lg border bg-amber-50/60 p-3 text-xs text-amber-800">
            Hak <b>davette ayrılır (RESERVED)</b>, kayıt onayında tüketilir (CONSUMED). Davet kabul edilmezse süre dolunca hak geri döner.
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div><Label>Ad</Label><Input value={guest.firstName} onChange={(e) => setGuest({ ...guest, firstName: e.target.value })} /></div>
            <div><Label>Soyad</Label><Input value={guest.lastName} onChange={(e) => setGuest({ ...guest, lastName: e.target.value })} /></div>
            <div className="sm:col-span-2"><Label>E-posta</Label><Input type="email" value={guest.email} onChange={(e) => setGuest({ ...guest, email: e.target.value })} /></div>
            <div className="sm:col-span-2"><Label>Kurum (opsiyonel)</Label><Input value={guest.company} onChange={(e) => setGuest({ ...guest, company: e.target.value })} placeholder="Boşsa sponsor kurumu kullanılır" /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGuestTarget(null)}>Vazgeç</Button>
            <Button onClick={addGuest} disabled={busy || !guest.firstName || !guest.lastName || !guest.email}>{busy ? "Ayrılıyor…" : "Haktan Ayr"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Stand tahsisi dialogu */}
      <Dialog open={Boolean(allocTarget)} onOpenChange={(o) => { if (!o) { setAllocTarget(null); setAllocAgreementId(""); } }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{allocTarget?.code} — Tahsis</DialogTitle>
            <DialogDescription>{allocTarget?.sizeSqm} m² · durum: {allocTarget?.status}</DialogDescription>
          </DialogHeader>
          <p className="text-xs text-muted-foreground">
            Uygunluk: yalnız AVAILABLE/HELD/OPTION/RELEASED stantlar tahsis edilebilir. Anlaşmadan hak, haktan tahsis üretilir (SponsorAgreement → Entitlement → Allocation → {allocTarget?.code}).
          </p>
          <div className="space-y-1.5">
            <Label>Anlaşma (zorunlu)</Label>
            <Select value={allocAgreementId} onValueChange={setAllocAgreementId}>
              <SelectTrigger><SelectValue placeholder="Sözleşmeli/aktif anlaşma seçin" /></SelectTrigger>
              <SelectContent>
                {allocCandidates.length === 0 && (
                  <div className="px-2 py-1.5 text-[11px] text-muted-foreground">Uygun anlaşma yok — önce bir anlaşmayı sözleşmeye alın</div>
                )}
                {allocCandidates.map((a) => (
                  <SelectItem key={a.id} value={a.id}>{a.organization.name} — {a.status} — {fmtMoney(a.amount, a.currency)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setAllocTarget(null); setAllocAgreementId(""); }}>Vazgeç</Button>
            <Button onClick={allocateBooth} disabled={busy || !allocAgreementId || !["AVAILABLE", "HELD", "OPTION", "RELEASED"].includes(allocTarget?.status ?? "")}>
              {busy ? "Tahsis ediliyor…" : "Tahsis Et"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Hak havuzu ekleme diyaloğu — doğrudan onaylı veya öneri olarak */}
      <Dialog open={createOpen} onOpenChange={(o) => !o && setCreateOpen(false)}>
        <DialogContent className="maven-scroll max-h-[85vh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Hak Havuzu Ekle</DialogTitle>
            <DialogDescription>
              Sponsor paketinden doğan hak ya da komiteye taşınacak öneri olarak kaydedin.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="ent-label">Hak etiketi</Label>
              <Input id="ent-label" value={createForm.label} onChange={(e) => setCreateForm({ ...createForm, label: e.target.value })} placeholder="örn. VIP Lounge Kahve Servisi (sponsor ayrıcalığı)" />
            </div>
            <div className="space-y-1.5">
              <Label>Hak tipi</Label>
              <Select value={createForm.type} onValueChange={(v) => setCreateForm({ ...createForm, type: v })}>
                <SelectTrigger aria-label="Hak tipi"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(ENT_TYPES).map(([k, v]) => <SelectItem key={k} value={k}>{t(v)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Sahip kurum</Label>
              <Select value={createForm.orgId} onValueChange={(v) => setCreateForm({ ...createForm, orgId: v })}>
                <SelectTrigger aria-label="Sahip kurum"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Kurumsuz (genel havuz)</SelectItem>
                  {orgOptions.map((o) => <SelectItem key={o.id} value={o.id}>{o.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ent-qty">Tanınan adet</Label>
              <Input id="ent-qty" type="number" min={0} value={createForm.quantityGranted} onChange={(e) => setCreateForm({ ...createForm, quantityGranted: Number(e.target.value) })} className="tabular-nums" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ent-restrictions">Kısıt (opsiyonel)</Label>
              <Input id="ent-restrictions" value={createForm.restrictions} onChange={(e) => setCreateForm({ ...createForm, restrictions: e.target.value })} placeholder="örn. yalnız açılış günü" />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Onay durumu</Label>
              <Select value={createForm.approvalStatus} onValueChange={(v) => setCreateForm({ ...createForm, approvalStatus: v })}>
                <SelectTrigger aria-label="Onay durumu"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="APPROVED">Onaylı olarak ekle (eski davranış — hemen kullanılabilir)</SelectItem>
                  <SelectItem value="PROPOSED">Öneri olarak ekle (komite onayı bekleyecek)</SelectItem>
                </SelectContent>
              </Select>
              {createForm.approvalStatus === "PROPOSED" && (
                <p className="rounded-md border border-amber-200 bg-amber-50/60 px-2.5 py-1.5 text-[11px] text-amber-800">
                  Öneri hakları "Onay bekleyen haklar" filtresinde belirir; komite onaylayana dek misafir ayrılamaz.
                </p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Vazgeç</Button>
            <Button onClick={createEntitlement} disabled={busy || !createForm.label.trim()}>{busy ? "Kaydediliyor…" : createForm.approvalStatus === "PROPOSED" ? t("sponsorship.addAsProposal") : "Hak Havuzu Ekle"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// P12.1: otomatik ilk-eşleşme KALDIRILDI — tahsis dialogu anlaşmayı açıkça seçtirir.

// P13.1: teslim satırı — durum geçişi + kanıt (proofUrl/notes). Sunucu makine
// karar verir; istemci yalnız formu sunar, hata satır içinde gösterilir.
const DELIVERABLE_NEXT = ["NOT_STARTED", "WAITING_SPONSOR", "SUBMITTED", "UNDER_REVIEW", "APPROVED", "REJECTED", "COMPLETED"];

function DeliverableRow({
  deliverable,
  onChanged,
}: {
  deliverable: { id: string; name: string; status: string; dueDate?: string | null; notes?: string | null; proofUrl?: string | null };
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [status, setStatus] = useState(deliverable.status);
  const [proofUrl, setProofUrl] = useState(deliverable.proofUrl ?? "");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="rounded-lg border px-2.5 py-1.5 text-xs space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="truncate">{deliverable.name}{deliverable.dueDate ? <span className="text-muted-foreground"> · {fmtDate(deliverable.dueDate)}</span> : ""}</span>
        <StatusBadge map={DELIVERABLE_STATUS} value={deliverable.status} />
      </div>
      {deliverable.proofUrl && (
        <a className="block truncate text-[10px] text-primary underline" href={deliverable.proofUrl} target="_blank" rel="noreferrer">
          Kanıtı aç
        </a>
      )}
      {!editing ? (
        <button type="button" className="text-[10px] text-primary underline underline-offset-2" onClick={() => setEditing(true)}>
          Durumu güncelle
        </button>
      ) : (
        <div className="space-y-1.5">
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="h-7 text-[11px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {DELIVERABLE_NEXT.map((s) => (
                <SelectItem key={s} value={s}>{(DELIVERABLE_STATUS as Record<string, string>)[s] ?? s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {(status === "SUBMITTED" || status === "REJECTED") && (
            <>
              <Input
                className="h-7 text-[11px]"
                placeholder="Kanıt URL (dosya/kayıt bağlantısı)"
                value={proofUrl}
                onChange={(e) => setProofUrl(e.target.value)}
              />
              <Input
                className="h-7 text-[11px]"
                placeholder={status === "REJECTED" ? "Red gerekçesi (zorunlu)" : "Not/kanıt açıklaması"}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </>
          )}
          {error && <p className="text-[10px] text-destructive">{error}</p>}
          <div className="flex justify-end gap-1.5">
            <Button size="sm" variant="ghost" className="h-6 text-[10px]" onClick={() => { setEditing(false); setError(null); }}>Vazgeç</Button>
            <Button
              size="sm"
              className="h-6 text-[10px]"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setError(null);
                try {
                  await apiSend(`/api/deliverables/${deliverable.id}`, "PUT", {
                    status,
                    ...(proofUrl.trim() ? { proofUrl: proofUrl.trim() } : {}),
                    ...(notes.trim() ? { notes: notes.trim() } : {}),
                  });
                  setEditing(false);
                  onChanged();
                } catch (e) {
                  setError(e instanceof Error ? e.message : "Güncellenemedi");
                } finally {
                  setBusy(false);
                }
              }}
            >
              Kaydet
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
