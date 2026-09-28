"use client";
// Dashboard — 08 dosyası: portföy görünümü + edisyon hazırlığı (8/8) + analitik
import { useApp } from "@/lib/store";
import { apiGet } from "@/lib/client";
import { useLang } from "@/lib/i18n";
import { KpiCard, SectionCard, EmptyState, Loading, ErrorState, useApi, PageHeader, StatusBadge, Chip } from "../bits";
import { fmtDate, fmtDateTime, fmtMoney, EDITION_STATUS, TASK_PRIORITY, label } from "@/lib/constants";
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip as RTooltip, XAxis, YAxis } from "recharts";
import * as Icons from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import { AnnounceStrip } from "./announce-card";

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

  // ── Edisyon görünümü ──
  const kpi = data.kpi ?? {};
  const checks = data.checks;
  const num = (k: string) => Number(kpi[k] ?? 0);

  return (
    <div className="space-y-5">
      <PageHeader
        title={data.edition?.name ?? "Edisyon"}
        desc={`${fmtDate(data.edition?.startDate)} — ${fmtDate(data.edition?.endDate)}${data.edition?.venueName ? ` · ${data.edition.venueName}` : ""}`}
      >
        <span className="text-xs text-muted-foreground">Son güncelleme: {fmtDateTime(data.lastUpdated)}</span>
        <Button size="sm" variant="outline" onClick={reload}><Icons.RefreshCw className="size-4" /> Yenile</Button>
      </PageHeader>

      {/* Hazırlık denetimi — dashboard(2) 8/8 */}
      <SectionCard
        title="Kurulum Denetimi"
        desc={`Hazırlık ${checks?.score ?? 0}/8 — karta basınca ilgili ayar açılır`}
        action={
          <div className="w-28">
            <Progress value={checks?.pct ?? 0} className="h-2" aria-label={`Kurulum hazırlığı yüzde ${checks?.pct ?? 0}`} />
            <p className="mt-1 text-right text-[11px] text-muted-foreground">%{checks?.pct ?? 0}</p>
          </div>
        }
      >
        <div className="space-y-1.5">
          {[...(checks?.blockers ?? []).map((b) => ({ ...b, tone: "rose" })), ...(checks?.warnings ?? []).map((w) => ({ ...w, tone: "amber" }))].map((c) => (
            <div key={c.key} className={cn("flex items-start gap-2 rounded-lg border p-2.5 text-sm", c.tone === "rose" ? "border-rose-200 bg-rose-50/60" : "border-amber-200 bg-amber-50/60")}>
              {c.tone === "rose" ? <Icons.OctagonAlert className="mt-0.5 size-4 shrink-0 text-rose-500" /> : <Icons.TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-500" />}
              <span>{c.message}</span>
            </div>
          ))}
          {(checks?.blockers?.length ?? 0) + (checks?.warnings?.length ?? 0) === 0 && (
            <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50/60 p-2.5 text-sm">
              <Icons.CircleCheck className="size-4 text-emerald-600" /> Tüm denetimler temiz — yayına hazır.
            </div>
          )}
        </div>
      </SectionCard>

      {/* Kayıt & katılım kartları */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
        <KpiCard label="Başvuru" value={num("applications")} sub="taslak hariç gönderim" icon={<Icons.Inbox className="size-4" />} onClick={() => setModule("registrations")} detailHref={t("dashboard.registrationsLink")} />
        <KpiCard label="Onaylı" value={num("confirmed")} sub="ödeme ayrı eksen" tone="emerald" icon={<Icons.ClipboardCheck className="size-4" />} onClick={() => setModule("registrations")} detailHref="Onaylı filtresi →" />
        <KpiCard label="Onay Bekleyen" value={num("pendingApproval")} sub="inceleme kuyruğu" tone="amber" icon={<Icons.Hourglass className="size-4" />} onClick={() => setModule("registrations")} detailHref="Bekleyenler →" />
        <KpiCard label={t("dashboard.uniquePersons")} value={num("uniquePersons")} sub="aynı kişi iki rol → tek kişi" icon={<Icons.Users className="size-4" />} onClick={() => setModule("people")} detailHref="Kişiler →" />
        <KpiCard label="Onay Oranı" value={kpi.approvalRate != null ? `%${kpi.approvalRate}` : "—"} sub="karara bağlanan üzerinden" icon={<Icons.Gauge className="size-4" />} />
        <KpiCard label="Sahada Gelen" value={num("arrived")} sub={`katılım oranı ${kpi.attendanceRate != null ? `%${kpi.attendanceRate}` : "—"}`} tone="emerald" icon={<Icons.ScanLine className="size-4" />} onClick={() => setModule("onsite")} detailHref="Saha paneli →" />
        <KpiCard label="No-Show" value={num("noShow")} sub="onaylı, girişsiz" tone="rose" icon={<Icons.UserX className="size-4" />} />
        <KpiCard label="Açık İş" value={num("taskOpen")} sub="tüm modüller" tone="amber" icon={<Icons.ListChecks className="size-4" />} onClick={() => setModule("operations")} detailHref="Operasyon →" />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Finans kartları */}
        <SectionCard title="Finans" desc="sipariş ≠ tahsilat ≠ iade — eksenler ayrı" className="min-w-0 lg:col-span-2">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <KpiCard label="Sipariş Edilen" value={fmtMoney(num("ordered"))} sub="geçerli satır toplamı" />
            <KpiCard label="Tahsil Edilen" value={fmtMoney(num("collected"))} sub="iade düşülmemiş brüt" tone="emerald" />
            <KpiCard label="İade Edilen" value={fmtMoney(num("refunded"))} sub="kesinleşen" tone="violet" />
            <KpiCard label="Açık Bakiye" value={fmtMoney(num("openBalance"))} sub="borç − tahsilat + iade" tone="amber" onClick={() => setModule("finance")} detailHref={t("dashboard.ordersLink")} />
            <KpiCard label="Kısmi Ödeme" value={num("partialCount")} sub="sipariş sayısı" tone="amber" />
            <KpiCard label="Manuel Teyit Bekleyen" value={num("pendingManual")} sub="finans kuyruğu" tone="rose" />
          </div>
        </SectionCard>

        {/* Sponsor hak dökümü */}
        <SectionCard title="Sponsor Hakları" desc="tanınan / kullanılan / ayrılmış / kalan">
          <div className="space-y-3">
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-semibold tabular-nums">{num("consumed")}/{num("granted")}</span>
              <span className="text-sm text-muted-foreground">kullanılan hak</span>
            </div>
            <Progress value={num("granted") ? (num("consumed") / num("granted")) * 100 : 0} className="h-2.5" aria-label={`Kontenjan kullanımı yüzde ${num("granted") ? Math.round((num("consumed") / num("granted")) * 100) : 0}`} />
            <div className="grid grid-cols-3 gap-2 text-center text-xs">
              <div className="rounded-lg bg-muted p-2"><p className="text-lg font-semibold tabular-nums">{num("granted")}</p><p className="text-muted-foreground">tanınan</p></div>
              <div className="rounded-lg bg-amber-50 p-2"><p className="text-lg font-semibold tabular-nums text-amber-700">{num("reserved")}</p><p className="text-amber-800">ayrılmış</p></div>
              <div className="rounded-lg bg-emerald-50 p-2"><p className="text-lg font-semibold tabular-nums text-emerald-700">{Math.max(0, num("granted") - num("consumed") - num("reserved"))}</p><p className="text-emerald-800">kalan</p></div>
            </div>
            <p className="text-xs text-muted-foreground">Sponsorluk değeri: <span className="font-medium text-foreground">{fmtMoney(num("sponsorshipValue"))}</span> · bekleyen teslim: {num("deliverablePending")}</p>
            <Button size="sm" variant="outline" className="w-full" onClick={() => setModule("sponsorship")}>Sponsorluk modülü →</Button>
          </div>
        </SectionCard>
      </div>

      {/* Grafikler */}
      <div className="grid gap-4 lg:grid-cols-3">
        <SectionCard title={t("dashboard.registrationCurve")} desc="gönderim tarihi bazlı — son 14 gün" className="min-w-0 lg:col-span-2">
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={data.curve ?? []} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.9 0.01 190)" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} />
              <RTooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
              <Line type="monotone" dataKey="count" name="Başvuru" stroke="#0f9b8e" strokeWidth={2.5} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </SectionCard>

        <SectionCard title="Kaynak Dağılımı" desc="kayıt kaynakları">
          {/* Pasta grafik AT/odaktan çıkarılmıştır (inert) — veri alttaki metin lejantta aynen sunulur. */}
          <div inert>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={Object.entries(data.bySource ?? {}).map(([k, v]) => ({ name: k, value: v }))} dataKey="value" nameKey="name" innerRadius={48} outerRadius={80} paddingAngle={2}>
                {Object.keys(data.bySource ?? {}).map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
              </Pie>
              <RTooltip contentStyle={{ fontSize: 12, borderRadius: 8 }} />
            </PieChart>
          </ResponsiveContainer>
          </div>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {Object.entries(data.bySource ?? {}).map(([k, v], i) => (
              <span key={k} className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                <span className="size-2 rounded-full" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} /> {k}: {v}
              </span>
            ))}
          </div>
        </SectionCard>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard title="Bilimsel & Program" desc="kabulden yayına darboğaz">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <KpiCard label="Bildiri" value={Object.values(kpi.sciByStatus ?? {}).reduce((a: number, b) => a + Number(b), 0)} sub="tüm durumlar" onClick={() => setModule("scientific")} detailHref="Bilimsel →" />
            <KpiCard label="İncelemede" value={(kpi.sciByStatus as Record<string, number>)?.UNDER_REVIEW ?? 0} sub={`geciken hakem: ${num("reviewOverdue")}`} tone="amber" onClick={() => setModule("scientific")} detailHref="Bildiriler →" />
            <KpiCard label="Oturum" value={num("sessionCount")} sub={`${num("publishedSessions")} yayınlandı`} onClick={() => setModule("program")} detailHref="Program →" />
            <KpiCard label="Program Bekleyen" value={num("acceptedNoSession")} sub="kabul edildi, slot yok" tone="rose" onClick={() => setModule("program")} detailHref="Program →" />
          </div>
        </SectionCard>

        <SectionCard title="Konaklama & LCV & Saha" desc="kırılım sayaçları">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <KpiCard label="Rezervasyon" value={num("reservationCount")} sub={`${num("roomNightsSold")} oda-gece`} onClick={() => setModule("accommodation")} detailHref="Konaklama →" />
            <KpiCard label="Davetli" value={Object.values(kpi.invByStatus ?? {}).reduce((a: number, b) => a + Number(b), 0)} sub="LCV havuzu" />
            <KpiCard label="Gelecek" value={(kpi.invByStatus as Record<string, number>)?.COMING ?? 0} sub="yanıt: gelecek" tone="emerald" />
            <KpiCard label="Tarama" value={num("scanCount")} sub={`${num("rescanCount")} tekrar · ${num("deniedCount")} ret`} tone="teal" onClick={() => setModule("onsite")} detailHref="Saha →" />
          </div>
        </SectionCard>
      </div>

      <SectionCard title="Aktivite Akışı" desc="edisyon kapsamı">
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
