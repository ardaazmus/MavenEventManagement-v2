"use client";
// Floor Studio — mekânsal stant planı (§20, §60)
// Maven ticari kaydı (tahsis, sözleşme) tutar; geometri Floor Studio uygulamalarıyla
// ORTAK KİMLİK (boothUnitId) üzerinden paylaşılır. Bu ekran: plan görselleştirme,
// otomatik yerleşim, konum/durum düzenleme ve senkron uçları (/api/floor-studio/*).
import { useEffect, useState } from "react";
import { apiGet, apiSend } from "@/lib/client";
import { useApp } from "@/lib/store";
import { SectionCard, EmptyState, Loading, ErrorState, useApi, PageHeader, StatusBadge, KpiCard } from "../bits";
import { BOOTH_STATUS, BOOTH_PLAN_TONE, fmtMoney } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import * as Icons from "lucide-react";
import { cn } from "@/lib/utils";
import { useLang, t } from "@/lib/i18n";

// plan koordinat uzayı (metre)
const PLAN_W = 46;
const PLAN_H = 26;
const MARGIN = 2;
const ROW_LIMIT = PLAN_W - MARGIN * 2;

interface FloorObj { id: string; label?: string | null; x: number; y: number; width: number; height: number; rotation: number; layer: string }
interface PlanBooth {
  id: string; code: string; sizeSqm: number; type: string; status: string; price: number; currency: string; optionExpiresAt?: string | null;
  allocation?: { id: string; status: string; organization?: { id: string; name: string } | null; agreementId?: string | null } | null;
  floorObject?: { id: string; label?: string | null; x: number; y: number; width: number; height: number; rotation: number } | null;
}
interface PlanData {
  edition?: { id: string; name: string; venueName?: string | null } | null;
  booths: PlanBooth[];
  decor: FloorObj[];
  summary: { total: number; placed: number; unplaced: number; byStatus: Record<string, number>; totalSqm: number; placedSqm: number; contractedRevenue: number; potentialRevenue: number };
}

// m² → plan blok ölçüsü (metre)
function dimsFor(sizeSqm: number): { w: number; h: number } {
  if (sizeSqm <= 12) return { w: 4, h: 3 };
  if (sizeSqm <= 24) return { w: 6, h: 4 };
  if (sizeSqm <= 48) return { w: 8, h: 6 };
  return { w: 10, h: 8 };
}

export function FloorsView() {
  useLang();
  const { currentEditionId, bump, refreshKey } = useApp();
  const { toast } = useToast();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [draft, setDraft] = useState({ x: 0, y: 0, width: 4, height: 3 });
  const [busy, setBusy] = useState(false);
  const [lastPush, setLastPush] = useState<string | null>(null);
  const [lastPull, setLastPull] = useState<string | null>(null);

  const { data, error, reload, loading } = useApi<PlanData>(
    () => apiGet<PlanData>(`/api/floor-studio/plan?editionId=${currentEditionId}`),
    [currentEditionId, refreshKey],
  );

  useEffect(() => {
    setLastPush(localStorage.getItem("maven.floor.push"));
    setLastPull(localStorage.getItem("maven.floor.pull"));
  }, []);

  const booths = data?.booths ?? [];
  const summary = data?.summary;
  const selected = booths.find((b) => b.id === selectedId) ?? null;

  // seçim değişince konum taslağını hazırla (yerleşmemişse ilk boş satır tahmini)
  useEffect(() => {
    if (!selected) return;
    const d = dimsFor(selected.sizeSqm);
    if (selected.floorObject) {
      setDraft({ x: selected.floorObject.x, y: selected.floorObject.y, width: selected.floorObject.width, height: selected.floorObject.height });
    } else {
      const maxY = booths.reduce((m, b) => (b.floorObject ? Math.max(m, b.floorObject.y + b.floorObject.height) : m), 0);
      setDraft({ x: MARGIN, y: maxY ? Math.min(maxY + 2, PLAN_H - d.h) : MARGIN, width: d.w, height: d.h });
    }
  }, [selectedId, data]);

  const matches = (b: PlanBooth) => {
    if (statusFilter && b.status !== statusFilter) return false;
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return b.code.toLowerCase().includes(q) || (b.allocation?.organization?.name ?? "").toLowerCase().includes(q);
  };

  const unplaced = booths.filter((b) => !b.floorObject);

  const sync = async (body: Record<string, unknown>, okTitle: string, okDesc: string) => {
    setBusy(true);
    try {
      const res = await apiSend<{ geometryUpdated: number; statusesChanged: number; syncedAt: string }>("/api/floor-studio/sync", "POST", { editionId: currentEditionId, source: "maven", ...body });
      localStorage.setItem("maven.floor.push", res.syncedAt);
      setLastPush(res.syncedAt);
      toast({ title: okTitle, description: `${okDesc} ${t("floors.syncResult", { geometry: res.geometryUpdated, statuses: res.statusesChanged })}` });
      reload(); bump();
    } catch (e) {
      toast({ title: t("floors.syncFailed"), description: e instanceof Error ? e.message : t("common.error"), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const saveGeometry = () => {
    if (!selected) return;
    void sync(
      { changes: [{ boothUnitId: selected.id, ...draft, label: selected.allocation?.organization?.name ? `${selected.allocation.organization.name} — ${selected.code}` : selected.code }] },
      selected.floorObject ? t("floors.positionUpdated") : t("floors.boothPlaced"),
      t("floors.appliedToPlan", { code: selected.code }),
    );
  };

  const removeGeometry = async () => {
    if (!selected?.floorObject) return;
    setBusy(true);
    try {
      await apiSend(`/api/floor-objects/${selected.floorObject.id}`, "DELETE");
      toast({ title: t("floors.geometryRemoved"), description: t("floors.geometryRemovedDesc", { code: selected.code }) });
      reload(); bump();
    } catch (e) {
      toast({ title: t("floors.geometryRemoveFailed"), description: e instanceof Error ? e.message : t("common.error"), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const setStatus = (status: string) => {
    if (!selected) return;
    setBusy(true);
    Promise.resolve()
      .then(() => apiSend(`/api/booth-units/${selected.id}`, "PUT", { status }))
      .then(() => {
        toast({ title: t("floors.statusUpdated"), description: `${selected.code} → ${BOOTH_STATUS[status] ?? status}` });
        reload(); bump();
      })
      .catch((e) => toast({ title: t("floors.statusChangeFailed"), description: e instanceof Error ? e.message : t("common.error"), variant: "destructive" }))
      .finally(() => setBusy(false));
  };

  const autoArrange = () => {
    if (unplaced.length === 0) {
      toast({ title: t("floors.noUnplaced"), description: t("floors.allPlaced") });
      return;
    }
    // mevcut yerleşimin altına, satır satır sola hizalı yerleştir
    let y = booths.reduce((m, b) => (b.floorObject ? Math.max(m, b.floorObject.y + b.floorObject.height) : m), 0) + 2;
    if (y === 2) y = MARGIN;
    let x = MARGIN;
    let rowH = 0;
    const changes = unplaced.map((b) => {
      const { w, h } = dimsFor(b.sizeSqm);
      if (x + w > PLAN_W - MARGIN) { y += rowH + 2; x = MARGIN; rowH = 0; }
      const pos = { x, y, width: w, height: h };
      x += w + 1;
      rowH = Math.max(rowH, h);
      return { boothUnitId: b.id, ...pos, label: b.allocation?.organization?.name ? `${b.allocation.organization.name} — ${b.code}` : b.code };
    });
    void sync({ changes }, t("floors.autoArrangeDone"), t("floors.autoArrangeDesc", { count: changes.length }));
  };

  const pushAll = () => {
    const placed = booths.filter((b) => b.floorObject);
    if (placed.length === 0) {
      toast({ title: t("floors.nothingToPush"), description: t("floors.placeFirst") });
      return;
    }
    void sync(
      { changes: placed.map((b) => ({ boothUnitId: b.id, ...b.floorObject! })) },
      t("floors.pushedTitle"),
      t("floors.pushedDesc", { count: placed.length }),
    );
  };

  const pullFromFloorStudio = async () => {
    setBusy(true);
    try {
      const snap = await apiGet<PlanData>(`/api/floor-studio/sync?editionId=${currentEditionId}`);
      const now = new Date().toISOString();
      localStorage.setItem("maven.floor.pull", now);
      setLastPull(now);
      toast({ title: t("floors.pulledTitle"), description: t("floors.pulledDesc", { booths: snap.booths.length, decor: snap.decor.length }) });
      reload();
    } catch (e) {
      toast({ title: t("floors.pullFailed"), description: e instanceof Error ? e.message : t("common.error"), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  if (loading && !data) return <Loading rows={6} />;
  if (error) return <ErrorState message={error} onRetry={reload} />;

  const placedPct = summary && summary.total ? Math.round((summary.placed / summary.total) * 100) : 0;

  return (
    <div className="space-y-5">
      <PageHeader
        title={t("floors.title")}
        desc={t("floors.desc")}
      >
        <Button variant="outline" size="sm" onClick={pullFromFloorStudio} disabled={busy}>
          <Icons.Download className="size-3.5" /> {t("floors.btnPull")}
        </Button>
        <Button variant="outline" size="sm" onClick={pushAll} disabled={busy}>
          <Icons.Send className="size-3.5" /> {t("floors.btnPush")}
        </Button>
        <Button size="sm" onClick={autoArrange} disabled={busy}>
          <Icons.Sparkles className="size-3.5" /> {t("floors.btnAutoArrange")}{unplaced.length > 0 ? ` (${unplaced.length})` : ""}
        </Button>
      </PageHeader>

      {/* KPI şeridi */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
        <KpiCard label={t("floors.kpiTotal")} value={summary?.total ?? 0} sub={t("floors.kpiTotalSub", { sqm: summary?.totalSqm ?? 0 })} icon={<Icons.MapPin className="size-4" />} tone="teal" />
        <KpiCard label={t("floors.kpiPlaced")} value={summary?.placed ?? 0} sub={t("floors.kpiPlacedSub", { count: summary?.unplaced ?? 0 })} icon={<Icons.Grid3x3 className="size-4" />} tone="emerald" />
        <KpiCard label={t("floors.kpiAvailable")} value={summary?.byStatus?.AVAILABLE ?? 0} sub={t("floors.kpiAvailableSub")} icon={<Icons.CircleCheck className="size-4" />} tone="neutral" />
        <KpiCard label={t("floors.kpiContracted")} value={fmtMoney(summary?.contractedRevenue ?? 0)} sub="CONTRACTED + RESERVED + OCCUPIED" icon={<Icons.BadgeCheck className="size-4" />} tone="violet" />
        <KpiCard label={t("floors.kpiPotential")} value={fmtMoney(summary?.potentialRevenue ?? 0)} sub={t("floors.kpiPotentialSub")} icon={<Icons.Coins className="size-4" />} tone="amber" />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        {/* ── Salon planı ── */}
        <SectionCard
          className="xl:col-span-2"
          title={t("floors.planTitle")}
          desc={`${data?.edition?.name ?? ""} · ${data?.edition?.venueName ?? t("floors.venueUnknown")} · ${t("floors.coordsHint")}`}
          action={
            <div className="flex items-center gap-2">
              <Icons.Search className="size-3.5 text-muted-foreground" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("floors.phSearch")} className="h-8 w-40 text-xs sm:w-52" aria-label={t("floors.ariaSearch")} />
            </div>
          }
        >
          {/* durum filtresi */}
          <div className="mb-3 flex flex-wrap items-center gap-1.5">
            <button
              onClick={() => setStatusFilter(null)}
              className={cn("rounded-full border px-2.5 py-1 text-[11px] font-medium transition", !statusFilter ? "border-teal-500 bg-teal-500/15 text-teal-800" : "border-border bg-muted/40 text-muted-foreground hover:bg-muted")}
            >
              {t("floors.all")} ({summary?.total ?? 0})
            </button>
            {Object.entries(BOOTH_STATUS).map(([k, v]) => {
              const n = summary?.byStatus?.[k] ?? 0;
              if (n === 0) return null;
              return (
                <button
                  key={k}
                  onClick={() => setStatusFilter(statusFilter === k ? null : k)}
                  className={cn(
                    "rounded-full border px-2.5 py-1 text-[11px] font-medium transition",
                    statusFilter === k ? "border-teal-500 bg-teal-500/15 text-teal-800 ring-1 ring-teal-500/40" : "border-border bg-muted/40 text-muted-foreground hover:bg-muted",
                  )}
                >
                  {v} ({n})
                </button>
              );
            })}
          </div>

          {/* plan sahnesi */}
          {booths.length === 0 ? (
            <EmptyState
              title={t("floors.emptyTitle")}
              desc={t("floors.emptyDesc")}
            />
          ) : (
            <div className="maven-plan-grid relative w-full overflow-hidden rounded-xl border-2 border-border/80 bg-[oklch(0.97_0.005_190)] shadow-inner" style={{ aspectRatio: `${PLAN_W} / ${PLAN_H}` }} role="application" aria-label={t("floors.ariaPlan")}>
              {/* dekor / servis objeleri — Floor Studio sahipli */}
              {(data?.decor ?? []).map((d) => (
                <div
                  key={d.id}
                  className="absolute flex items-center justify-center rounded-md border-2 border-dashed border-neutral-400/60 bg-white/40 text-[10px] font-semibold uppercase tracking-wide text-neutral-500"
                  style={{
                    left: `${(d.x / PLAN_W) * 100}%`,
                    top: `${(d.y / PLAN_H) * 100}%`,
                    width: `${(d.width / PLAN_W) * 100}%`,
                    height: `${(d.height / PLAN_H) * 100}%`,
                    transform: d.rotation ? `rotate(${d.rotation}deg)` : undefined,
                  }}
                  title={`${d.label ?? t("floors.decorFallback")} (${t("floors.ownedByFloorStudio")})`}
                >
                  {d.width / PLAN_W > 0.1 ? d.label : null}
                </div>
              ))}

              {/* stant blokları — yalnızca geometrisi olanlar (yerleşmeyenler alt şeritte) */}
              {booths.filter((b) => b.floorObject).map((b, i) => {
                const fo = b.floorObject!;
                const isMatch = matches(b);
                const org = b.allocation?.organization?.name;
                return (
                  <button
                    key={b.id}
                    onClick={() => setSelectedId(b.id)}
                    className={cn(
                      "maven-plan-block absolute flex cursor-pointer flex-col items-center justify-center overflow-hidden rounded-md border-2 p-0.5 text-center shadow-sm transition-all duration-200",
                      BOOTH_PLAN_TONE[b.status] ?? BOOTH_PLAN_TONE.BLOCKED,
                      selectedId === b.id && "z-20 scale-[1.03] ring-2 ring-teal-600 ring-offset-1",
                      !isMatch && "opacity-25",
                    )}
                    style={{
                      left: `${(fo.x / PLAN_W) * 100}%`,
                      top: `${(fo.y / PLAN_H) * 100}%`,
                      width: `${(fo.width / PLAN_W) * 100}%`,
                      height: `${(fo.height / PLAN_H) * 100}%`,
                      animationDelay: `${Math.min(i * 30, 600)}ms`,
                    }}
                    title={`${b.code} — ${BOOTH_STATUS[b.status] ?? b.status}${org ? ` · ${org}` : ""} · ${b.sizeSqm} m²`}
                  >
                    <span className="text-[11px] font-bold leading-none sm:text-xs">{b.code}</span>
                    {org && fo.width >= 4 && <span className="mt-0.5 hidden max-w-full truncate text-[9px] leading-tight opacity-80 sm:block">{org}</span>}
                    <span className="text-[8px] font-medium opacity-70">{b.sizeSqm} m²</span>
                  </button>
                );
              })}

              {/* plan köşe ölçek ibresi */}
              <div className="pointer-events-none absolute bottom-1.5 right-2 flex items-center gap-1 rounded bg-white/70 px-1.5 py-0.5 text-[9px] font-medium text-neutral-500 shadow-sm">
                <Icons.Ruler className="size-2.5" /> {PLAN_W} × {PLAN_H} m
              </div>
            </div>
          )}

          {/* yerleşim bekleyenler */}
          {unplaced.length > 0 && (
            <div className="mt-3 rounded-lg border border-dashed border-amber-300 bg-amber-50/60 p-3">
              <p className="flex items-center gap-1.5 text-xs font-semibold text-amber-800">
                <Icons.AlertCircle className="size-3.5" /> {t("floors.unplacedHint", { count: unplaced.length })}
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {unplaced.map((b) => (
                  <button key={b.id} onClick={() => setSelectedId(b.id)} className="rounded-md border border-amber-300 bg-white px-2 py-0.5 text-[11px] font-medium text-amber-900 transition hover:border-amber-500 hover:shadow-sm">
                    {b.code} · {b.sizeSqm} m²
                  </button>
                ))}
              </div>
            </div>
          )}
        </SectionCard>

        {/* ── Sağ kolon: detay + senkron ── */}
        <div className="space-y-4">
          <SectionCard title={t("floors.detailTitle")} desc={selected ? undefined : t("floors.selectBooth")}>
            {!selected ? (
              <EmptyState title={t("floors.noSelectionTitle")} desc={t("floors.noSelectionDesc")} />
            ) : (
              <div className="space-y-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="flex items-center gap-2 text-base font-semibold">
                      <span className={cn("grid size-8 place-items-center rounded-lg border-2 text-xs font-bold", BOOTH_PLAN_TONE[selected.status])}>{selected.code}</span>
                      {selected.allocation?.organization?.name ?? t("floors.noAllocation")}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {selected.sizeSqm} m² · {selected.type === "SHELL_SCHEME" ? t("floors.typeShellScheme") : selected.type === "SPACE_ONLY" ? t("floors.typeSpaceOnly") : selected.type} · {fmtMoney(selected.price, selected.currency)}
                    </p>
                  </div>
                  <StatusBadge map={BOOTH_STATUS} value={selected.status} />
                </div>

                {/* durum eylemleri */}
                <div>
                  <Label className="text-[11px] text-muted-foreground">{t("floors.changeStatus")}</Label>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {["AVAILABLE", "HELD", "BLOCKED", "RELEASED"].map((s) => (
                      <Button key={s} size="sm" variant={selected.status === s ? "default" : "outline"} className="h-7 px-2.5 text-[11px]" disabled={busy || selected.status === s} onClick={() => setStatus(s)}>
                        {BOOTH_STATUS[s]}
                      </Button>
                    ))}
                  </div>
                </div>

                {/* konum editörü */}
                <div className="rounded-lg border bg-muted/30 p-3">
                  <p className="flex items-center gap-1.5 text-xs font-semibold">
                    <Icons.Move className="size-3.5 text-teal-600" /> {t("floors.positionSize")}
                  </p>
                  <div className="mt-2 grid grid-cols-4 gap-2">
                    {(["x", "y", "width", "height"] as const).map((k) => (
                      <div key={k}>
                        <Label className="text-[10px] uppercase text-muted-foreground">{k === "x" ? "X" : k === "y" ? "Y" : k === "width" ? t("floors.axisWidth") : t("floors.axisHeight")}</Label>
                        <Input
                          type="number"
                          step="0.5"
                          min="0"
                          className="h-8 text-xs"
                          value={draft[k]}
                          onChange={(e) => setDraft((d) => ({ ...d, [k]: Math.max(0, Number(e.target.value) || 0) }))}
                          aria-label={k}
                        />
                      </div>
                    ))}
                  </div>
                  <div className="mt-2 flex items-center justify-between gap-2">
                    {/* ok takımı — 0.5 m adım */}
                    <div className="grid grid-cols-3 gap-0.5" aria-label={t("floors.araNudge")}>
                      <span />
                      <Button size="sm" variant="ghost" className="size-6 p-0" onClick={() => setDraft((d) => ({ ...d, y: Math.max(0, d.y - 0.5) }))} aria-label={t("floors.ariaMoveUp")}><Icons.ArrowUp className="size-3" /></Button>
                      <span />
                      <Button size="sm" variant="ghost" className="size-6 p-0" onClick={() => setDraft((d) => ({ ...d, x: Math.max(0, d.x - 0.5) }))} aria-label={t("floors.ariaMoveLeft")}><Icons.ArrowLeft className="size-3" /></Button>
                      <Button size="sm" variant="ghost" className="size-6 p-0" onClick={() => setDraft((d) => ({ ...d, y: Math.min(PLAN_H - d.height, d.y + 0.5) }))} aria-label={t("floors.ariaMoveDown")}><Icons.ArrowDown className="size-3" /></Button>
                      <Button size="sm" variant="ghost" className="size-6 p-0" onClick={() => setDraft((d) => ({ ...d, x: Math.min(PLAN_W - d.width, d.x + 0.5) }))} aria-label={t("floors.ariaMoveRight")}><Icons.ArrowRight className="size-3" /></Button>
                    </div>
                    <div className="flex gap-1.5">
                      {selected.floorObject && (
                        <Button size="sm" variant="outline" className="h-8 text-[11px] text-rose-600 hover:bg-rose-50" onClick={removeGeometry} disabled={busy}>
                          <Icons.Trash2 className="size-3.5" /> {t("floors.btnRemove")}
                        </Button>
                      )}
                      <Button size="sm" className="h-8 text-[11px]" onClick={saveGeometry} disabled={busy}>
                        <Icons.Save className="size-3.5" /> {selected.floorObject ? t("floors.btnSavePosition") : t("floors.btnPlace")}
                      </Button>
                    </div>
                  </div>
                </div>

                {selected.optionExpiresAt && (
                  <p className="flex items-center gap-1.5 rounded-md bg-amber-50 px-2.5 py-1.5 text-[11px] font-medium text-amber-800">
                    <Icons.Hourglass className="size-3.5" /> {t("floors.optionExpires")} {new Date(selected.optionExpiresAt).toLocaleDateString("tr-TR")}
                  </p>
                )}
              </div>
            )}
          </SectionCard>

          <SectionCard title={t("floors.syncTitle")} desc={t("floors.syncDesc")}>
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">{t("floors.placedCompletion")}</span>
                <span className="font-semibold tabular-nums">{summary?.placed ?? 0}/{summary?.total ?? 0} · %{placedPct}</span>
              </div>
              <Progress value={placedPct} className="h-2" />
              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <div className="rounded-lg border bg-muted/30 p-2">
                  <p className="flex items-center gap-1 font-semibold"><Icons.Upload className="size-3 text-teal-600" /> {t("floors.lastPush")}</p>
                  <p className="mt-0.5 text-muted-foreground">{lastPush ? new Date(lastPush).toLocaleString("tr-TR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : t("floors.never")}</p>
                </div>
                <div className="rounded-lg border bg-muted/30 p-2">
                  <p className="flex items-center gap-1 font-semibold"><Icons.DownloadCloud className="size-3 text-sky-600" /> {t("floors.lastPull")}</p>
                  <p className="mt-0.5 text-muted-foreground">{lastPull ? new Date(lastPull).toLocaleString("tr-TR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : t("floors.never")}</p>
                </div>
              </div>
              <ul className="space-y-1 text-[11px] text-muted-foreground">
                <li className="flex gap-1.5"><Icons.Check className="size-3 shrink-0 text-emerald-600" /> {t("floors.hintMaven")}</li>
                <li className="flex gap-1.5"><Icons.Check className="size-3 shrink-0 text-emerald-600" /> <code className="rounded bg-muted px-1">GET /api/floor-studio/plan</code> {t("floors.hintGet")} <code className="rounded bg-muted px-1">POST /sync</code> {t("floors.hintPost")}</li>
                <li className="flex gap-1.5"><Icons.Check className="size-3 shrink-0 text-emerald-600" /> {t("floors.hintDecor")}</li>
              </ul>
              <Button size="sm" variant="outline" className="w-full" onClick={pushAll} disabled={busy}>
                <Icons.Send className="size-3.5" /> {t("floors.btnSyncAll")}
              </Button>
            </div>
          </SectionCard>
        </div>
      </div>
    </div>
  );
}
