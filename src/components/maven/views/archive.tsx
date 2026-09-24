"use client";
// Arşiv modülü (Faz C / R11) — COMPLETED/ARCHIVED edisyonların tenant-içi çalışma alanı.
// Kart başına: dashboard agregatlarından istatistik, "Medya ZIP" (/api/media/export reuse),
// lazy galeri (media archive), AYRI katılımcı bloğu (isimler tenant-içi — public'te yalnız sayı),
// İletişim kampanya segment bağlantısı ve KVKK sabit notu.
// Public yüzeydeki karşılığı: Dış Portal → Firma Vitrini (yalnız sayılar).
import { useMemo, useState } from "react";
import * as Icons from "lucide-react";
import { useApp } from "@/lib/store";
import { listEntity, apiSend } from "@/lib/client";
import { EDITION_STATUS, label, fmtDate, fmtDateTime } from "@/lib/constants";
import { PageHeader, SectionCard, StatusBadge, Chip, EmptyState, Loading, ErrorState, useApi, KpiCard } from "../bits";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

// arşiv sayılan durumlar (§7 yaşam döngüsünün kuyruğu)
const ARCHIVE_STATUSES = ["POST_EVENT", "RECONCILIATION", "ARCHIVED"];

interface EditionRow {
  id: string; name: string; slug: string; editionLabel?: string | null; status: string;
  startDate?: string | null; endDate?: string | null; city?: string | null; venueName?: string | null;
  series?: { id: string; name: string } | null;
  _count?: { participations?: number; registrations?: number; sponsorAgreements?: number; sessions?: number };
}

interface MediaAssetRow {
  id: string; name: string; kind: string; dataUrl?: string | null; mimeType?: string | null; sizeKb?: number | null; createdAt: string;
}

interface ParticipationRow {
  id: string; attendance?: string | null;
  person: { id: string; firstName: string; lastName: string; email?: string | null; company?: string | null };
}

export function ArchiveView() {
  const { refreshKey } = useApp();
  const { toast } = useToast();

  const [search, setSearch] = useState("");
  const [zipBusy, setZipBusy] = useState<string | null>(null);
  const [campaignBusy, setCampaignBusy] = useState<string | null>(null);
  const [galeriEdition, setGaleriEdition] = useState<EditionRow | null>(null);
  const [peopleEdition, setPeopleEdition] = useState<EditionRow | null>(null);

  // tüm edisyonlar (bootstrap listesiyle aynı sözleşme) → arşiv durumlarına filtrele
  const { data: editions, error, reload, loading } = useApi<EditionRow[]>(
    () => listEntity<EditionRow>("editions", { limit: 200 }),
    [refreshKey]
  );

  const archived = useMemo(() => {
    const q = search.trim().toLocaleLowerCase("tr-TR");
    return (editions ?? [])
      .filter((e) => ARCHIVE_STATUSES.includes(e.status))
      .filter((e) => {
        if (!q) return true;
        const hay = `${e.name} ${e.series?.name ?? ""} ${e.city ?? ""}`.toLocaleLowerCase("tr-TR");
        return hay.includes(q);
      });
  }, [editions, search]);

  // agregatlar — dashboard KPI aynası
  const totalParticipants = archived.reduce((a, e) => a + (e._count?.participations ?? 0), 0);
  const totalRegistrations = archived.reduce((a, e) => a + (e._count?.registrations ?? 0), 0);
  const totalMedia = 0; // ZIP/galeri ile edisyon bazlı; üst özet için sayısal agregat aşağıda

  // ── Medya ZIP indirme (/api/media/export reuse) ──
  const downloadZip = async (e: EditionRow) => {
    setZipBusy(e.id);
    try {
      const res = await fetch(`/api/media/export?editionId=${e.id}`, { cache: "no-store" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? "ZIP üretilemedi");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `medya-arsivi-${e.slug || e.id}.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast({ title: "Medya ZIP indirildi", description: `${e.name} — klasör yapısı ve manifest dahil.` });
    } catch (err) {
      toast({ title: "ZIP indirilemedi", description: err instanceof Error ? err.message : "Hata", variant: "destructive" });
    } finally {
      setZipBusy(null);
    }
  };

  // ── İletişim segmenti: arşiv katılımcıları için kampanya taslağı ──
  const createCampaignSegment = async (e: EditionRow) => {
    setCampaignBusy(e.id);
    try {
      await apiSend("/api/campaigns", "POST", {
        editionId: e.id,
        name: `Arşiv — ${e.name} katılımcıları`,
        segmentRule: "Arşivlenmiş edisyon katılımcıları (POST_EVENT/RECONCILIATION/ARCHIVED) — İletişim modülünde mailing hedefi",
        audienceCount: e._count?.participations ?? 0,
        channel: "EMAIL",
        status: "DRAFT",
        phase: "POST_EVENT",
        audienceMode: "SEGMENT",
        subject: `${e.name} arşivi — teşekkür ve sonraki etkinlik daveti`,
      });
      toast({ title: "Kampanya segmenti oluşturuldu", description: `İletişim modülünde "${e.name}" için mailing taslağı hazır.` });
      reload();
    } catch (err) {
      toast({ title: "Segment oluşturulamadı", description: err instanceof Error ? err.message : "Hata", variant: "destructive" });
    } finally {
      setCampaignBusy(null);
    }
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Arşiv"
        desc="Tamamlanan etkinliklerin çalışma alanı — istatistik, medya ZIP, galeri ve katılımcı kayıtları. Public yüzeyde yalnız sayılar görünür."
      />

      {/* Üst özet — dashboard agregat reuse */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Arşivli Etkinlik" value={archived.length} sub="POST_EVENT / RECONCILIATION / ARCHIVED" tone="amber" icon={<Icons.Archive className="size-4" />} />
        <KpiCard label="Arşiv Katılımı" value={totalParticipants} sub="tüm arşiv edilen edisyonlar" tone="violet" icon={<Icons.Users className="size-4" />} />
        <KpiCard label="Arşiv Kaydı" value={totalRegistrations} sub="toplam kayıt sayısı" tone="teal" icon={<Icons.ClipboardList className="size-4" />} />
        <KpiCard label="Galeri & Medya" value="ZIP" sub="kart başına medya paketi indirilebilir" tone="emerald" icon={<Icons.Images className="size-4" />} />
      </div>

      <div className="relative max-w-sm">
        <Icons.Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input value={search} onChange={(ev) => setSearch(ev.target.value)} placeholder="Etkinlik / seri / şehir ara" className="pl-8" />
      </div>

      {loading ? <Loading rows={4} /> : error ? <ErrorState message={error} onRetry={reload} /> : archived.length === 0 ? (
        <EmptyState
          title="Arşiv kaydı yok"
          desc="POST_EVENT, RECONCILIATION veya ARCHIVED durumdaki etkinlikler burada listelenir. Etkinlikler ekranından durumu değiştirebilirsiniz."
        />
      ) : (
        <div className="space-y-4">
          {archived.map((e) => (
            <div key={e.id} className="rounded-2xl border bg-card p-4 shadow-sm transition hover:border-primary/30 md:p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-base font-semibold">{e.name}</h3>
                    {e.editionLabel && <Chip tone="neutral">{e.editionLabel}</Chip>}
                    <StatusBadge map={EDITION_STATUS} value={e.status} />
                  </div>
                  <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    {e.series?.name && <span className="inline-flex items-center gap-1"><Icons.Shapes className="size-3.5" /> {e.series.name}</span>}
                    <span className="inline-flex items-center gap-1"><Icons.CalendarDays className="size-3.5" /> {fmtDate(e.startDate)} — {fmtDate(e.endDate)}</span>
                    {e.city && <span className="inline-flex items-center gap-1"><Icons.MapPin className="size-3.5" /> {e.venueName ? `${e.venueName}, ${e.city}` : e.city}</span>}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" disabled={zipBusy === e.id} onClick={() => downloadZip(e)}>
                    {zipBusy === e.id ? <Icons.Loader2 className="size-3.5 animate-spin" /> : <Icons.FileArchive className="size-3.5" />} Medya ZIP
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setGaleriEdition(e)}>
                    <Icons.Images className="size-3.5" /> Galeri
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setPeopleEdition(e)}>
                    <Icons.Users className="size-3.5" /> Katılımcılar
                  </Button>
                  <Button size="sm" variant="outline" disabled={campaignBusy === e.id} onClick={() => createCampaignSegment(e)}>
                    {campaignBusy === e.id ? <Icons.Loader2 className="size-3.5 animate-spin" /> : <Icons.Megaphone className="size-3.5" />} Kampanya Segmenti
                  </Button>
                </div>
              </div>

              {/* kart istatistikleri — dashboard agregat reuse */}
              <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {[
                  { label: "Katılımcı", value: e._count?.participations ?? 0, cls: "text-violet-700 bg-violet-50 border-violet-200" },
                  { label: "Kayıt", value: e._count?.registrations ?? 0, cls: "text-teal-700 bg-teal-50 border-teal-200" },
                  { label: "Sponsor", value: e._count?.sponsorAgreements ?? 0, cls: "text-emerald-700 bg-emerald-50 border-emerald-200" },
                  { label: "Oturum", value: e._count?.sessions ?? 0, cls: "text-amber-700 bg-amber-50 border-amber-200" },
                ].map((st) => (
                  <div key={st.label} className={cn("rounded-lg border p-2.5", st.cls)}>
                    <p className="text-lg font-bold tabular-nums leading-none">{st.value}</p>
                    <p className="mt-0.5 text-[11px] opacity-80">{st.label}</p>
                  </div>
                ))}
              </div>
            </div>
          ))}

          {/* KVKK sabit notu */}
          <div className="rounded-xl border border-dashed border-muted-foreground/30 bg-muted/30 p-4 text-xs leading-relaxed text-muted-foreground">
            <p className="flex items-center gap-1.5 font-semibold text-foreground">
              <Icons.ShieldCheck className="size-4 text-emerald-600" /> KVKK — Arşiv katılımcı verileri
            </p>
            <p className="mt-1.5">
              Arşivdeki katılımcı isim ve iletişim bilgileri yalnız bu çalışma alanında (tenant-içi) tutulur; firma vitrini ve diğer public
              yüzeylerde yalnız katılımcı <b>adedi</b> görünür. Kişisel veriler silme/anonimleştirme taleplerinde
              İletişim modülündeki kampanya segmentlerinden ayrıştırılarak yönetilir. (KVKK md.5/6 — veri minimizasyonu)
            </p>
          </div>
        </div>
      )}

      {/* Galeri diyaloğu — lazy media archive */}
      {galeriEdition && (
        <Dialog open onOpenChange={(v) => !v && setGaleriEdition(null)}>
          <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2"><Icons.Images className="size-4 text-primary" /> Galeri — {galeriEdition.name}</DialogTitle>
              <DialogDescription>Medya Arşivi&apos;nde bu edisyona yüklenen görseller (en fazla 24 öğe — lazy yüklenir).</DialogDescription>
            </DialogHeader>
            <GaleriGrid editionId={galeriEdition.id} />
            <DialogFooter>
              <Button variant="outline" onClick={() => setGaleriEdition(null)}>Kapat</Button>
              <Button variant="outline" onClick={() => downloadZip(galeriEdition)} disabled={zipBusy === galeriEdition.id}>
                {zipBusy === galeriEdition.id ? <Icons.Loader2 className="size-4 animate-spin" /> : <Icons.FileArchive className="size-4" />} ZIP indir
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Katılımcı bloğu — AYRI, tenant-içi (public'te yalnız sayı) */}
      {peopleEdition && (
        <Dialog open onOpenChange={(v) => !v && setPeopleEdition(null)}>
          <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2"><Icons.Users className="size-4 text-primary" /> Katılımcılar — {peopleEdition.name}</DialogTitle>
              <DialogDescription>Tenant-içi görünüm: isimler yalnız bu çalışma alanında. Public vitrinde yalnız {peopleEdition._count?.participations ?? 0} adeti görünür.</DialogDescription>
            </DialogHeader>
            <ParticipantsBlock editionId={peopleEdition.id} />
            <DialogFooter>
              <Button variant="outline" onClick={() => setPeopleEdition(null)}>Kapat</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

// ── lazy galeri ızgarası — dialog açılınca mount olur, o zaman çeker ──
function GaleriGrid({ editionId }: { editionId: string }) {
  const { data, error, loading } = useApi<MediaAssetRow[]>(
    () => listEntity<MediaAssetRow>("media-assets", { editionId, limit: 24 }),
    [editionId]
  );

  if (loading) return <Loading rows={3} />;
  if (error) return <ErrorState message={error} onRetry={() => undefined} />;
  const images = (data ?? []).filter((a) => a.kind === "IMAGE" && a.dataUrl);
  const others = (data ?? []).filter((a) => !(a.kind === "IMAGE" && a.dataUrl));

  if ((data ?? []).length === 0) {
    return <EmptyState title="Medya yok" desc="Medya Arşivi modülünden bu edisyona dosya yükleyin." />;
  }
  return (
    <div className="space-y-3">
      {images.length > 0 ? (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {images.map((a) => (
            <img
              key={a.id}
              src={a.dataUrl ?? ""}
              alt={a.name}
              title={`${a.name} · ${fmtDateTime(a.createdAt)}`}
              className="aspect-square w-full rounded-lg border object-cover transition hover:scale-[1.03]"
            />
          ))}
        </div>
      ) : (
        <EmptyState title="Görsel yok" desc="IMAGE türünde medya bulunamadı." />
      )}
      {others.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {others.slice(0, 10).map((a) => (
            <Chip key={a.id} tone="neutral">{a.name}</Chip>
          ))}
        </div>
      )}
    </div>
  );
}

// ── tenant-içi katılımcı bloğu — isimler burada, public'te asla ──
function ParticipantsBlock({ editionId }: { editionId: string }) {
  const { data, error, loading } = useApi<ParticipationRow[]>(
    () => listEntity<ParticipationRow>("participations", { editionId, limit: 300 }),
    [editionId]
  );

  if (loading) return <Loading rows={4} />;
  if (error) return <ErrorState message={error} onRetry={() => undefined} />;
  const rows = data ?? [];
  if (rows.length === 0) return <EmptyState title="Katılım kaydı yok" />;

  return (
    <div className="maven-scroll max-h-80 space-y-2 overflow-y-auto pr-1">
      {rows.map((p) => (
        <div key={p.id} className="flex items-center gap-3 rounded-lg border p-2.5">
          <div className="grid size-8 shrink-0 place-items-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
            {p.person.firstName?.slice(0, 1)}{p.person.lastName?.slice(0, 1)}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{p.person.firstName} {p.person.lastName}</p>
            <p className="truncate text-xs text-muted-foreground">{p.person.company ?? p.person.email ?? "—"}</p>
          </div>
          {p.attendance && <Chip tone={p.attendance === "CHECKED_IN" ? "emerald" : "neutral"}>{label({ CHECKED_IN: "Girdi", CHECKED_OUT: "Çıktı", NOT_ARRIVED: "Gelmedi", NO_SHOW: "Gelmedi" }, p.attendance)}</Chip>}
        </div>
      ))}
    </div>
  );
}
