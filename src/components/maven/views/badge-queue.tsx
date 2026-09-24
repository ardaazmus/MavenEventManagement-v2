"use client";
// Yaka Kartı Baskı Merkezi — baskı kuyruğu, toplu baskı/teslim akışı ve baskı önizleme
// (§40: yaka kartı ≠ katılım — yaka kartı durumu bağımsız yönetilir; §41: baskı şablonu BadgeProfile'dan)
import { useEffect, useMemo, useState } from "react";
import { apiGet, apiSend } from "@/lib/client";
import { useApp } from "@/lib/store";
import { BadgeDesigner } from "../badge-designer";
import { Chip, EmptyState, ErrorState, KpiCard, Loading, PageHeader, SectionCard, StatusBadge, useApi } from "../bits";
import { BADGE_STATUS, EVENT_ROLES, fmtDate, label } from "@/lib/constants";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useLang } from "@/lib/i18n";
import * as Icons from "lucide-react";

// ─── Tipler ──────────────────────────────────────────────────────────────────

type BadgeAction = "PRINT" | "ISSUE" | "REPRINT";

interface QueueItem {
  id: string;
  badgeNo: string;
  status: string;
  issuedAt: string | Date | null;
  printedAt: string | Date | null;
  profile: { name: string; color: string; accessAreas: string | string[] | null } | null;
  person: { fullName: string; company: string | null; title: string | null };
  category: string | null;
  roles: string[];
  registrationStatus: string | null;
}

interface BadgeQueueData {
  queue: QueueItem[];
  stats: { ready: number; printed: number; issued: number; reprinted: number; notEligible: number; void: number; total: number };
  byProfile: { name: string; count: number }[];
}

interface ActionResult {
  ok: boolean;
  succeeded: number;
  failed: number;
  results: { id: string; ok: boolean; message?: string }[];
}

// ─── Yardımcılar ─────────────────────────────────────────────────────────────

// profile.color Tailwind renk adı (teal|amber|violet|rose|sky|neutral) — dinamik sınıf
// derlenmeyeceği için renk noktası inline style ile verilir
const PROFILE_COLORS: Record<string, string> = {
  teal: "#14b8a6",
  amber: "#f59e0b",
  violet: "#8b5cf6",
  rose: "#f43f5e",
  sky: "#0ea5e9",
  neutral: "#a3a3a3",
};
const colorOf = (c?: string | null): string => (c && PROFILE_COLORS[c]) || "#a3a3a3";

// accessAreas Prisma'da "Main Hall, VIP Lounge" biçiminde String? — dizi gelirse de güvenli
function formatAccessAreas(v: string | string[] | null | undefined): string {
  if (!v) return "";
  return Array.isArray(v) ? v.join(", ") : v;
}

const ACTION_VERBS: Record<BadgeAction, string> = { PRINT: "basıldı", ISSUE: "teslim edildi", REPRINT: "yeniden basıldı" };
const ACTION_NOTES: Record<BadgeAction, string> = {
  PRINT: "PRINTED — baskı şablonu BadgeProfile ayarlarından gelir.",
  ISSUE: "ISSUED — yaka kartı sahadan teslim edildi.",
  REPRINT: "REPRINTED — yeni baskı kaydedildi.",
};
const ACTION_SKIP: Record<BadgeAction, string> = {
  PRINT: "durumu uygun değil",
  ISSUE: "basılı durumda değil",
  REPRINT: "basılı yaka kartı değil",
};

// ─── View ────────────────────────────────────────────────────────────────────

export function BadgeQueueView() {
  const { currentEditionId, bump, refreshKey } = useApp();
  const { toast } = useToast();
  const { t } = useLang(); // dil değişiminde re-render (F9-R-d)
  const [tab, setTab] = useState<"queue" | "designer">("queue");

  const [statusFilter, setStatusFilter] = useState("ALL");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [preview, setPreview] = useState<QueueItem | null>(null);
  const [bulkBusy, setBulkBusy] = useState<BadgeAction | null>(null);
  const [rowBusyId, setRowBusyId] = useState<string | null>(null);

  // baskı kuyruğu — edisyon bazlı
  const { data, error, reload, loading } = useApi(() => {
    if (!currentEditionId) return Promise.resolve(null);
    return apiGet<BadgeQueueData>("/api/badges/print-queue?editionId=" + currentEditionId);
  }, [currentEditionId, refreshKey]);

  // edisyon değişince seçim ve önizleme geçersiz olur
  useEffect(() => {
    setSelected(new Set());
    setPreview(null);
  }, [currentEditionId]);

  const queue = data?.queue ?? [];
  const stats = data?.stats ?? { ready: 0, printed: 0, issued: 0, reprinted: 0, notEligible: 0, void: 0, total: 0 };
  const byProfile = data?.byProfile ?? [];

  // filtre + arama (istemci tarafı — "Tümünü Seç" yalnız görünür satırlara uygulanır)
  const visible = useMemo(() => {
    const q = search.trim().toLocaleLowerCase("tr-TR");
    return queue.filter((b) => {
      if (statusFilter !== "ALL" && b.status !== statusFilter) return false;
      if (!q) return true;
      const hay = `${b.person.fullName} ${b.badgeNo} ${b.profile?.name ?? ""}`.toLocaleLowerCase("tr-TR");
      return hay.includes(q);
    });
  }, [queue, statusFilter, search]);

  // seçim: kuyrukta hâlâ var olanlar (edisyon/filtre değişimlerine karşı)
  const selectedInQueue = useMemo(() => queue.filter((b) => selected.has(b.id)).map((b) => b.id), [queue, selected]);
  const anyBusy = bulkBusy !== null || rowBusyId !== null;

  const toggleOne = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const selectVisible = () => setSelected((prev) => new Set([...prev, ...visible.map((b) => b.id)]));
  const clearSelection = () => setSelected(new Set());

  // tek/çoklu aksiyon — sunucu durum makinesi kontrollü, sonuç toast'ta özetlenir
  const runAction = async (action: BadgeAction, ids: string[]) => {
    if (ids.length === 0) {
      toast({ title: "Yaka Kartı seçilmedi", description: "Kuyruktan en az bir yaka kartı seçin.", variant: "destructive" });
      return;
    }
    if (ids.length > 1) setBulkBusy(action);
    else setRowBusyId(ids[0]);
    try {
      const res = await apiSend<ActionResult>("/api/badges/print-queue", "POST", { ids, action });
      toast({
        title: `${res.succeeded} yaka kartı ${ACTION_VERBS[action]}`,
        description: res.failed > 0 ? `${res.failed} atlandı (${ACTION_SKIP[action]})` : ACTION_NOTES[action],
        variant: res.succeeded === 0 && res.failed > 0 ? "destructive" : "default",
      });
      setSelected(new Set());
      reload();
      bump();
    } catch (err) {
      toast({ title: "Baskı aksiyonu başarısız", description: err instanceof Error ? err.message : "Hata", variant: "destructive" });
    } finally {
      setBulkBusy(null);
      setRowBusyId(null);
    }
  };

  const personLine = preview ? [preview.person.company, preview.person.title].filter(Boolean).join(" · ") : "";
  const previewAreas = preview ? formatAccessAreas(preview.profile?.accessAreas) : "";

  // ── render ──

  return (
    <div className="space-y-5">
      <PageHeader title="Yaka Kartı Baskı" desc="Baskıya hazır yaka kartları, toplu baskı ve teslim akışı — yaka kartı ≠ katılım (§40): durum bağımsız yönetilir.">
        <Chip tone="teal">{selectedInQueue.length} seçili</Chip>
      </PageHeader>

      {/* Sekmeler: Baskı Kuyruğu / Tasarımcı */}
      <div className="flex rounded-lg border bg-card p-1 shadow-sm">
        {(["queue", "designer"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition sm:flex-none sm:px-4 ${
              tab === t ? "bg-teal-600 text-white shadow-sm" : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
            }`}
          >
            {t === "queue" ? (<><Icons.ListChecks className="size-3.5" /> Baskı Kuyruğu</>) : (<><Icons.Palette className="size-3.5" /> Tasarımcı</>)}
          </button>
        ))}
      </div>

      {tab === "designer" ? (
        <BadgeDesigner />
      ) : (
      <>

      {/* 1 — KPI sırası */}
      <div className="space-y-1">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <KpiCard label="Baskıya Hazır" value={stats.ready} tone="teal" icon={<Icons.Printer className="size-4" />} />
          <KpiCard label="Basıldı" value={stats.printed} tone="emerald" icon={<Icons.Stamp className="size-4" />} />
          <KpiCard label="Verildi" value={stats.issued} tone="emerald" icon={<Icons.CheckCircle2 className="size-4" />} />
          <KpiCard label="Yeniden Basılan" value={stats.reprinted} tone="amber" icon={<Icons.RefreshCcw className="size-4" />} />
          <KpiCard label="Uygun Değil" value={stats.notEligible} tone="neutral" icon={<Icons.Ban className="size-4" />} />
        </div>
        <p className="text-xs text-muted-foreground">Toplam {stats.total} yaka kartı kuyrukta</p>
      </div>

      {/* 2 — Profil kırılımı */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-card px-4 py-3 shadow-sm">
        <span className="text-xs font-medium text-muted-foreground">Profil kırılımı:</span>
        {byProfile.length === 0 ? (
          <span className="text-xs text-muted-foreground">Kuyrukta yaka kartı yok — kırılım oluşmaz.</span>
        ) : (
          byProfile.map((p) => (
            <Chip key={p.name}>
              <span className="inline-flex items-center gap-1.5">
                <span className="size-2 rounded-full" style={{ backgroundColor: colorOf(queue.find((q) => q.profile?.name === p.name)?.profile?.color) }} aria-hidden />
                {p.name} × {p.count}
              </span>
            </Chip>
          ))
        )}
      </div>

      {/* 3 — Seçim + toplu aksiyon çubuğu (sticky değil) */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-card p-3 shadow-sm">
        <Button variant="outline" size="sm" onClick={selectVisible} disabled={visible.length === 0} title="Yalnızca filtrelenmiş görünür satırları seçer">
          <Icons.ListChecks className="size-3.5" /> Tümünü Seç (kuyruk)
        </Button>
        <Button variant="ghost" size="sm" onClick={clearSelection} disabled={selectedInQueue.length === 0}>
          <Icons.X className="size-3.5" /> Seçimi Temizle
        </Button>
        <span className="text-xs text-muted-foreground">{visible.length} / {queue.length} yaka kartı görünüyor</span>
        <div className="ms-auto flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={() => runAction("PRINT", selectedInQueue)} disabled={anyBusy}>
            {bulkBusy === "PRINT" ? <Icons.Loader2 className="size-3.5 animate-spin" /> : <Icons.Printer className="size-3.5" />} Baskıya Gönder (PRINT)
          </Button>
          <Button size="sm" variant="outline" className="border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100 hover:text-emerald-900" onClick={() => runAction("ISSUE", selectedInQueue)} disabled={anyBusy}>
            {bulkBusy === "ISSUE" ? <Icons.Loader2 className="size-3.5 animate-spin" /> : <Icons.BadgeCheck className="size-3.5" />} Teslim Et (ISSUE)
          </Button>
          <Button size="sm" variant="outline" className="border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100 hover:text-amber-900" onClick={() => runAction("REPRINT", selectedInQueue)} disabled={anyBusy}>
            {bulkBusy === "REPRINT" ? <Icons.Loader2 className="size-3.5 animate-spin" /> : <Icons.RefreshCcw className="size-3.5" />} Yeniden Bas (REPRINT)
          </Button>
        </div>
      </div>

      {/* 4-6 — Kuyruk tablosu + durum filtresi + arama */}
      <SectionCard
        title="Baskı Kuyruğu"
        desc="satıra tıklayarak seç, yaka kartı numarası baskı önizlemesini açar — aksiyonlar sunucuda durum kontrollüdür"
      >
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full sm:w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Tümü</SelectItem>
              {Object.entries(BADGE_STATUS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
            </SelectContent>
          </Select>
          <div className="relative flex-1">
            <Icons.Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("badgeQueue.searchPlaceholder")} className="pl-8" />
          </div>
        </div>

        <div className="mt-3">
          {loading ? <Loading rows={6} /> : error ? <ErrorState message={error} onRetry={reload} /> : visible.length === 0 ? (
            <EmptyState
              title={queue.length === 0 ? "Kuyrukta yaka kartı yok" : "Filtreye uyan yaka kartı yok"}
              desc={queue.length === 0 ? t("badgeQueue.emptyQueueDesc") : t("badgeQueue.clearFilterHint")}
            />
          ) : (
            <div className="maven-scroll max-h-96 overflow-y-auto rounded-lg border">
              <table className="w-full text-xs">
                <thead className="sticky top-0 z-10 bg-card text-left text-muted-foreground">
                  <tr>
                    <th className="w-10 px-3 py-2 font-medium"><span className="sr-only">Seçim</span></th>
                    <th className="px-3 py-2 font-medium">Yaka Kartı No</th>
                    <th className="px-3 py-2 font-medium">Kişi</th>
                    <th className="px-3 py-2 font-medium">Profil</th>
                    <th className="hidden px-3 py-2 font-medium lg:table-cell">Kategori</th>
                    <th className="hidden px-3 py-2 font-medium md:table-cell">Roller</th>
                    <th className="px-3 py-2 font-medium">Durum</th>
                    <th className="hidden px-3 py-2 font-medium sm:table-cell">Baskı / Veriş</th>
                    <th className="px-3 py-2 text-right font-medium">İşlem</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((b) => (
                    <tr
                      key={b.id}
                      onClick={() => toggleOne(b.id)}
                      className={`cursor-pointer border-t transition ${selected.has(b.id) ? "bg-teal-50/60" : "hover:bg-muted/40"}`}
                    >
                      <td className="w-10 px-3 py-2" onClick={(e) => e.stopPropagation()}>
                        <Checkbox checked={selected.has(b.id)} onCheckedChange={() => toggleOne(b.id)} aria-label={`${b.person.fullName} yaka kartını seç`} />
                      </td>
                      <td className="whitespace-nowrap px-3 py-2">
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); setPreview(b); }}
                          className="font-mono text-[11px] underline decoration-dotted underline-offset-2 transition hover:text-primary"
                          title={`Baskı önizleme — ${b.badgeNo}`}
                        >
                          #{b.badgeNo.slice(-6)}
                        </button>
                      </td>
                      <td className="px-3 py-2">
                        <div className="font-medium">{b.person.fullName}</div>
                        {(b.person.company || b.person.title) && (
                          <div className="max-w-40 truncate text-[11px] text-muted-foreground md:max-w-56">
                            {[b.person.company, b.person.title].filter(Boolean).join(" · ")}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {b.profile ? (
                          <span className="inline-flex items-center gap-1.5">
                            <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: colorOf(b.profile.color) }} aria-hidden />
                            <Chip>{b.profile.name}</Chip>
                          </span>
                        ) : (
                          <span className="text-muted-foreground">Profilsiz</span>
                        )}
                      </td>
                      <td className="hidden max-w-32 truncate px-3 py-2 text-muted-foreground lg:table-cell">{b.category ?? "—"}</td>
                      <td className="hidden px-3 py-2 md:table-cell">
                        {b.roles.length === 0 ? (
                          <span className="text-muted-foreground">—</span>
                        ) : (
                          <span className="flex flex-wrap items-center gap-1">
                            {b.roles.slice(0, 2).map((r, i) => <Chip key={`${b.id}-${i}`}>{label(EVENT_ROLES, r)}</Chip>)}
                            {b.roles.length > 2 && <span className="text-[11px] text-muted-foreground">+{b.roles.length - 2}</span>}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2"><StatusBadge map={BADGE_STATUS} value={b.status} /></td>
                      <td className="hidden whitespace-nowrap px-3 py-2 text-[11px] text-muted-foreground sm:table-cell">
                        <div>Basım: {fmtDate(b.printedAt)}</div>
                        <div>Veriş: {fmtDate(b.issuedAt)}</div>
                      </td>
                      <td className="px-3 py-2 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="icon" className="size-7" onClick={() => setPreview(b)} aria-label="Baskı önizleme" title="Baskı önizleme">
                            <Icons.Eye className="size-3.5" />
                          </Button>
                          {b.status === "READY" ? (
                            <Button variant="outline" size="sm" className="h-7 px-2 text-xs" disabled={anyBusy} onClick={() => runAction("PRINT", [b.id])}>
                              {rowBusyId === b.id ? <Icons.Loader2 className="size-3.5 animate-spin" /> : <Icons.Printer className="size-3.5" />} Baskıya Al
                            </Button>
                          ) : b.status === "PRINTED" || b.status === "REPRINTED" ? (
                            <Button variant="outline" size="sm" className="h-7 px-2 text-xs" disabled={anyBusy} onClick={() => runAction("ISSUE", [b.id])}>
                              {rowBusyId === b.id ? <Icons.Loader2 className="size-3.5 animate-spin" /> : <Icons.BadgeCheck className="size-3.5" />} Teslim Et
                            </Button>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </SectionCard>

      {/* 7 — Baskı Önizleme dialogu */}
      <Dialog open={preview !== null} onOpenChange={(o) => { if (!o) setPreview(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Baskı Önizleme</DialogTitle>
            <DialogDescription>Yaka kartı, baskı şablonunun sade temsilidir.</DialogDescription>
          </DialogHeader>
          {preview && (
            <div className="mx-auto w-[320px] overflow-hidden rounded-xl border bg-card shadow-sm">
              <div className="h-10" style={{ backgroundColor: colorOf(preview.profile?.color) }} />
              <div className="flex flex-col items-center gap-0.5 px-6 py-5 text-center">
                <span className="text-lg font-semibold leading-tight">{preview.person.fullName}</span>
                {personLine && <span className="text-xs text-muted-foreground">{personLine}</span>}
              </div>
              <div className="border-t px-6 py-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-[11px] text-muted-foreground" title={preview.badgeNo}>#{preview.badgeNo}</span>
                  <span className="inline-flex items-center gap-1.5 text-xs font-medium">
                    <span className="size-2 rounded-full" style={{ backgroundColor: colorOf(preview.profile?.color) }} aria-hidden />
                    {preview.profile?.name ?? "Profilsiz"}
                  </span>
                </div>
                {previewAreas && <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">Erişim alanları: {previewAreas}</p>}
              </div>
            </div>
          )}
          <p className="text-center text-[11px] text-muted-foreground">Bu kart baskı şablonunu temsil eder — gerçek kesiim BadgeProfile ayarlarından gelir.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPreview(null)}>Kapat</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      </>
      )}
    </div>
  );
}
