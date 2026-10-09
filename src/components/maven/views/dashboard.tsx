"use client";
// Dashboard — 08 dosyası: portföy görünümü + edisyon hazırlığı (8/8) + analitik
import { useApp } from "@/lib/store";
import { apiGet } from "@/lib/client";
import { useLang } from "@/lib/i18n";
import { KpiCard, SectionCard, EmptyState, Loading, ErrorState, useApi, PageHeader, StatusBadge, Chip } from "../bits";
import { fmtDate, fmtDateTime, fmtMoney, EDITION_STATUS, TASK_PRIORITY, label } from "@/lib/constants";
import * as Icons from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { AnnounceStrip } from "./announce-card";
import { WorkSummaryView } from "./work-summary-view";

interface DashData {
  scope: "PORTFOLIO" | "EDITION";
  portfolio?: { editionCount: number; activeEditions: number; publishedCount: number; personCount: number; orgCount: number; taskOpen: number; portfolioNet: number };
  editions?: EditionRow[];
  kpi?: Record<string, unknown>;
  edition?: { id: string; name: string; status: string; startDate: string; endDate: string; venueName?: string; capabilities: { key: string; enabled: boolean; setupNote?: string }[] };
  curve?: { date: string; count: number }[];
  bySource?: Record<string, number>;
  checks?: { blockers: { key: string; message: string }[]; warnings: { key: string; message: string }[]; score: number; pct: number };
  recentActivity?: ActivityRow[];
  upcomingTasks?: TaskRow[];
  lastUpdated?: string;
}
interface EditionRow {
  id: string; name: string; status: string; isPublished: boolean; startDate: string | null; endDate: string | null; city?: string | null; series?: { name: string } | null;
  _count?: { participations?: number; registrations?: number; sponsorAgreements?: number; sessions?: number; tasks?: number };
}
interface ActivityRow { id: string; type: string; message: string; actorName?: string | null; createdAt: string }
interface TaskRow { id: string; title: string; status: string; priority: string; dueDate?: string | null; edition?: { name: string } | null; assignee?: { firstName: string; lastName: string } | null }

const PIE_COLORS = ["#0f9b8e", "#58b368", "#e0a458", "#d16ba5", "#7a6ff0", "#e07a5f", "#5fa8d3", "#9aa5b1"];

export function DashboardView() {
  const { currentEditionId, editions, setCurrentEdition, setModule } = useApp();
  const { t } = useLang();

  const { data, error, reload, loading } = useApi<DashData>(
    () => apiGet<DashData>(`/api/dashboard${currentEditionId ? `?editionId=${currentEditionId}` : ""}`),
    [currentEditionId, useApp((s) => s.refreshKey)]
  );

  if (loading && !data) return <Loading rows={6} />;
  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (!data) return null;

  if (data.scope === "PORTFOLIO") {
    return (
      <div className="space-y-5">
        <PageHeader title="Genel Bakış" desc="Tüm etkinlikler, görevler, kuruluşlar ve kişiler — çalışma alanı kapsamında">
          <Button variant="outline" size="sm" onClick={() => setModule("editions")}><Icons.CalendarRange className="size-4" /> Etkinlikler</Button>
        </PageHeader>

        <AnnounceStrip />

        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          <KpiCard label="Etkinlik" value={data.portfolio?.editionCount ?? 0} sub={`${data.portfolio?.activeEditions ?? 0} aktif edisyon`} icon={<Icons.CalendarRange className="size-4" />} />
          <KpiCard label="Yayında" value={data.portfolio?.publishedCount ?? 0} sub="kayıt bağlantısı açık" tone="emerald" icon={<Icons.Globe className="size-4" />} />
          <KpiCard label={t("dashboard.person")} value={data.portfolio?.personCount ?? 0} sub="tenant içinde tekil" icon={<Icons.Users className="size-4" />} />
          <KpiCard label="Kurum" value={data.portfolio?.orgCount ?? 0} sub="kalıcı profil" icon={<Icons.Building2 className="size-4" />} />
          <KpiCard label="Açık iş" value={data.portfolio?.taskOpen ?? 0} sub="tüm modüller" tone="amber" icon={<Icons.ListChecks className="size-4" />} onClick={() => setModule("operations")} detailHref="Operasyonu aç →" />
          <KpiCard label="Net Tahsilat" value={fmtMoney(data.portfolio?.portfolioNet ?? 0)} sub="tahsilat − iade" tone="violet" icon={<Icons.CreditCard className="size-4" />} onClick={() => setModule("finance")} detailHref="Finansı aç →" />
        </div>

        <div className="grid gap-4 lg:grid-cols-3">
          <SectionCard title={t("dashboard.portfolio")} desc="seri/edisyon bazında — karta tıklayınca edisyon açılır" className="min-w-0 lg:col-span-2">
            <div className="grid gap-3 sm:grid-cols-2">
              {(data.editions ?? []).map((e) => (
                <button
                  key={e.id}
                  onClick={() => { setCurrentEdition(e.id); setModule("dashboard"); }}
                  className="group rounded-xl border p-4 text-left transition hover:border-primary/40 hover:shadow-sm"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-semibold">{e.name}</p>
                    <StatusBadge map={EDITION_STATUS} value={e.status} />
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {e.series?.name ? `${e.series.name} · ` : ""}{fmtDate(e.startDate)} — {fmtDate(e.endDate)}{e.city ? ` · ${e.city}` : ""}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-1.5 text-[11px] text-muted-foreground">
                    <Chip tone="teal">{e._count?.registrations ?? 0} kayıt</Chip>
                    <Chip>{e._count?.participations ?? 0} katılım</Chip>
                    <Chip tone="violet">{e._count?.sponsorAgreements ?? 0} sponsor</Chip>
                    <Chip>{e._count?.sessions ?? 0} oturum</Chip>
                  </div>
                </button>
              ))}
            </div>
          </SectionCard>

          <SectionCard title="Yaklaşan İşler" desc="son tarihe göre sıralı">
            {(data.upcomingTasks ?? []).length === 0 ? (
              <EmptyState title="Açık iş yok" desc="Tüm görevler tamamlandı." />
            ) : (
              <ul className="space-y-2.5">
                {(data.upcomingTasks ?? []).map((t) => (
                  <li key={t.id} className="flex items-start gap-2.5 text-sm">
                    <span className={cn("mt-1 size-2 shrink-0 rounded-full",
                      t.priority === "URGENT" ? "bg-rose-500" : t.priority === "HIGH" ? "bg-amber-500" : "bg-teal-500")} />
                    <div className="min-w-0">
                      <p className="truncate font-medium leading-tight">{t.title}</p>
                      <p className="text-xs text-muted-foreground">
                        {t.edition?.name ?? "Genel"} · {t.dueDate ? `son ${fmtDate(t.dueDate)}` : "tarihsiz"} · {label(TASK_PRIORITY, t.priority)}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
        </div>

        <SectionCard title="Aktivite Akışı" desc="domain olayları — aktör ve zamanla">
          {(data.recentActivity ?? []).length === 0 ? (
            <EmptyState title="Henüz hareket yok" />
          ) : (
            <ol className="relative space-y-3 border-l pl-4">
              {(data.recentActivity ?? []).map((a) => (
                <li key={a.id} className="relative">
                  <span className="absolute -left-[21px] top-1.5 size-2 rounded-full bg-primary/70" />
                  <p className="text-sm leading-snug">{a.message}</p>
                  <p className="text-xs text-muted-foreground">{a.actorName ?? "Sistem"} · {fmtDateTime(a.createdAt)}</p>
                </li>
              ))}
            </ol>
          )}
        </SectionCard>
      </div>
    );
  }

  // ── Edisyon görünümü: Karar ve Operasyon Odaklı İş Özeti (Cockpit) ──
  return <WorkSummaryView data={data} onReload={reload} />;
}
