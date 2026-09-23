"use client";
// Sponsor & Fuar — tier/paket/anlaşma, Entitlement motoru (20/14/2/4), teslimler, stand tahsisi
import { useState } from "react";
import { listEntity, apiSend } from "@/lib/client";
import { useApp } from "@/lib/store";
import { SectionCard, EmptyState, Loading, ErrorState, useApi, PageHeader, StatusBadge, Chip } from "../bits";
import { DELIVERABLE_STATUS, fmtDate, fmtMoney, CLAIM_STATUS } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import * as Icons from "lucide-react";
import { cn } from "@/lib/utils";

interface Agreement {
  id: string; amount: number; currency: string; status: string; signedAt?: string | null;
  organization: { id: string; name: string };
  package?: { id: string; name: string; rightsSpec?: string | null } | null;
  tier?: { id: string; name: string } | null;
  deliverables: { id: string; name: string; type: string; status: string; dueDate?: string | null; responsible?: string | null }[];
  boothAllocations: { id: string; status: string; boothUnit: { code: string; sizeSqm: number; status: string } }[];
}
interface Entitlement {
  id: string; label: string; type: string; source: string; quantityGranted: number; quantityConsumed: number; quantityReserved: number; restrictions?: string | null;
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

export function SponsorshipView() {
  const { currentEditionId, bump, refreshKey } = useApp();
  const { toast } = useToast();
  const [guestTarget, setGuestTarget] = useState<Entitlement | null>(null);
  const [guest, setGuest] = useState({ firstName: "", lastName: "", email: "", company: "" });
  const [busy, setBusy] = useState(false);
  const [allocTarget, setAllocTarget] = useState<BoothUnit | null>(null);

  const { data: agreements, error, reload, loading } = useApi<Agreement[]>(() => listEntity<Agreement>("sponsor-agreements", { editionId: currentEditionId ?? undefined }), [currentEditionId, refreshKey]);
  const { data: entitlements } = useApi<Entitlement[]>(() => listEntity<Entitlement>("entitlements", { editionId: currentEditionId ?? undefined }), [currentEditionId, refreshKey]);
  const { data: booths } = useApi<BoothUnit[]>(() => listEntity<BoothUnit>("booth-units", { editionId: currentEditionId ?? undefined }), [currentEditionId, refreshKey]);

  const addGuest = async () => {
    if (!guestTarget) return;
    setBusy(true);
    try {
      await apiSend("/api/flows", "POST", { action: "sponsor.guest", entitlementId: guestTarget.id, ...guest });
      toast({
        title: "Sponsor misafiri ayrıldı",
        description: "Person → Participation → Registration(SPONSOR_ENTITLEMENT) → Claim(RESERVED) zinciri kuruldu. Onayla henüz tüketmez.",
      });
      setGuestTarget(null); setGuest({ firstName: "", lastName: "", email: "", company: "" });
      reload(); bump();
    } catch (e) {
      toast({ title: "Hak ayrılamadı", description: e instanceof Error ? e.message : "Hata", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const allocateBooth = async () => {
    if (!allocTarget) return;
    setBusy(true);
    try {
      const orgId = boothsAllocTargetOrg(allocTarget, agreements ?? []);
      await apiSend("/api/flows", "POST", { action: "booth.allocate", boothUnitId: allocTarget.id, agreementId: orgId.agreementId, organizationId: orgId.organizationId });
      toast({ title: "Stand tahsis edildi", description: `${allocTarget.code} ticari kayıt Maven'da; Floor Studio geometrisi ayrıdır.` });
      setAllocTarget(null); reload(); bump();
    } catch (e) {
      toast({ title: "Tahsis edilemedi", description: e instanceof Error ? e.message : "Hata", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  if (loading && !agreements) return <Loading rows={5} />;
  if (error) return <ErrorState message={error} onRetry={reload} />;

  const sponsorEnts = (entitlements ?? []).filter((e) => e.ownerOrganization);

  return (
    <div className="space-y-5">
      <PageHeader title="Sponsor & Fuar" desc="Tier hard-code değildir — her etkinlik kendi tier'ını tanımlar; hak tüketimi finansal işlem değildir" />

      {/* Hak havuzları */}
      <SectionCard title="Entitlement Havuzları" desc="Hak kaynağı → sahip → tanınan → ayrılmış → kullanılan → kalan (§15)">
        {sponsorEnts.length === 0 ? (
          <EmptyState title="Hak havuzu yok" desc="Sponsor sözleşmesiyle hak tanımlayın." />
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {sponsorEnts.map((ent) => {
              const remaining = Math.max(0, ent.quantityGranted - ent.quantityConsumed - ent.quantityReserved);
              const pct = ent.quantityGranted ? Math.round((ent.quantityConsumed / ent.quantityGranted) * 100) : 0;
              return (
                <div key={ent.id} className="rounded-xl border p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold">{ent.label}</p>
                      <p className="text-xs text-muted-foreground">{ent.ownerOrganization?.name} · {ent.type}</p>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => setGuestTarget(ent)} disabled={remaining <= 0}>
                      <Icons.UserPlus className="size-3.5" /> Misafir Ekle
                    </Button>
                  </div>
                  {/* 09-C: 20 / 14 / 2 / 4 dökümü */}
                  <div className="mt-3 grid grid-cols-4 gap-2 text-center">
                    <div className="rounded-lg bg-muted p-2"><p className="text-lg font-semibold tabular-nums">{ent.quantityGranted}</p><p className="text-[11px] text-muted-foreground">tanınan</p></div>
                    <div className="rounded-lg bg-teal-500/10 p-2"><p className="text-lg font-semibold tabular-nums text-teal-700">{ent.quantityConsumed}</p><p className="text-[11px] text-teal-600/80">kullanılan</p></div>
                    <div className="rounded-lg bg-amber-500/10 p-2"><p className="text-lg font-semibold tabular-nums text-amber-700">{ent.quantityReserved}</p><p className="text-[11px] text-amber-600/80">ayrılmış</p></div>
                    <div className="rounded-lg bg-emerald-500/10 p-2"><p className="text-lg font-semibold tabular-nums text-emerald-700">{remaining}</p><p className="text-[11px] text-emerald-600/80">kalan</p></div>
                  </div>
                  <Progress value={pct} className="mt-3 h-2" />
                  <p className="mt-1 text-[11px] text-muted-foreground">%{pct} tüketildi · {ent.restrictions ?? "kısıt yok"}</p>
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

      {/* Sözleşmeler */}
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
                {/* teslim takvimi */}
                <div className="mt-3 grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
                  {ag.deliverables.map((d) => (
                    <div key={d.id} className="flex items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5 text-xs">
                      <span className="truncate">{d.name}{d.dueDate ? <span className="text-muted-foreground"> · {fmtDate(d.dueDate)}</span> : ""}</span>
                      <StatusBadge map={DELIVERABLE_STATUS} value={d.status} />
                    </div>
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

      {/* Stand planı — ticari durum */}
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
      <Dialog open={Boolean(allocTarget)} onOpenChange={(o) => !o && setAllocTarget(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{allocTarget?.code} — Tahsis</DialogTitle>
            <DialogDescription>{allocTarget?.sizeSqm} m² · durum: {allocTarget?.status}</DialogDescription>
          </DialogHeader>
          <p className="text-xs text-muted-foreground">
            Uygunluk: yalnız AVAILABLE/HELD/OPTION/RELEASED stantlar tahsis edilebilir. Anlaşmadan hak, haktan tahsis üretilir (SponsorAgreement → Entitlement → Allocation → {allocTarget?.code}).
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAllocTarget(null)}>Vazgeç</Button>
            <Button onClick={allocateBooth} disabled={busy || !["AVAILABLE", "HELD", "OPTION", "RELEASED"].includes(allocTarget?.status ?? "")}>
              {busy ? "Tahsis ediliyor…" : "Tahsis Et"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// tahsis hedefi için uygun anlaşma/kurum önerisi (ilk CONTRACTED/ACTIVE anlaşma)
function boothsAllocTargetOrg(booth: BoothUnit, agreements: Agreement[]): { agreementId?: string; organizationId?: string } {
  if (booth.allocation?.agreement) return { agreementId: booth.allocation.agreement.id };
  const ag = agreements.find((a) => ["CONTRACTED", "ACTIVE"].includes(a.status));
  return ag ? { agreementId: ag.id, organizationId: ag.organization.id } : {};
}
