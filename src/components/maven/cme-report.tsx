"use client";
// CME Resmî Akreditasyon Raporu — basılabilir belge görünümü (§08 CME_CREDITS)
// Antet (tenant + edisyon) + mühür + özet + oturum dökümü + kişi defteri + imza blokları.
// Yazdırma: body.maven-printing + @media print kurallarıyla yalnız belge basılır; CSV ayrı uçtan.
import { useEffect, useState } from "react";
import { apiGet } from "@/lib/client";
import { Button } from "@/components/ui/button";
import { EVENT_ROLES, label } from "@/lib/constants";
import * as Icons from "lucide-react";
import { cn } from "@/lib/utils";

interface ReportData {
  edition: {
    name: string; editionLabel: string | null; startDate: string | null; endDate: string | null;
    venueName: string | null; city: string | null; country: string | null; tenantName: string;
  };
  generatedAt: string;
  summary: {
    sessionsTotal: number; sessionsWithCredits: number; creditsPotential: number;
    attendees: number; creditsIssued: number; avgCredits: number; maxEarned: number;
  };
  sessions: { title: string; type: string; startTime: string; endTime: string; cmeCredits: number | null; attendanceCount: number }[];
  ledger: {
    fullName: string; company: string | null; title: string | null; confirmationNo: string | null;
    roles: string[]; attendedCount: number; credits: number; percent: number;
  }[];
}

const fmtDateTr = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString("tr-TR", { day: "2-digit", month: "long", year: "numeric" }) : null;

const fmtDay = (iso: string) =>
  new Date(iso).toLocaleDateString("tr-TR", { day: "2-digit", month: "short" });

const fmtHour = (iso: string) =>
  new Date(iso).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" });

export function CmeReportOverlay({ editionId, onClose }: { editionId: string; onClose: () => void }) {
  const [data, setData] = useState<ReportData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    apiGet<ReportData>(`/api/cme/report?editionId=${encodeURIComponent(editionId)}`)
      .then((d) => { if (alive) setData(d); })
      .catch((e) => { if (alive) setError(e instanceof Error ? e.message : "Rapor yüklenemedi"); });
    return () => { alive = false; };
  }, [editionId]);

  // ESC ile kapanış + body kilidi
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
      document.body.classList.remove("maven-printing");
    };
  }, [onClose]);

  const doPrint = () => {
    document.body.classList.add("maven-printing");
    window.print();
  };

  return (
    <div className="fixed inset-0 z-[70] overflow-y-auto bg-zinc-950/60 p-4 backdrop-blur-sm print:bg-white print:p-0" role="dialog" aria-modal="true" aria-label="CME akreditasyon raporu">
      {/* aksiyon çubuğu — ekranda görünür, yazdırmada gizli */}
      <div className="maven-no-print sticky top-0 z-10 mx-auto flex max-w-4xl items-center justify-between gap-2 py-2">
        <span className="inline-flex items-center gap-2 rounded-full bg-white/90 px-3 py-1.5 text-xs font-medium text-teal-800 shadow-sm">
          <Icons.FileText className="size-3.5" /> Resmî CME Akreditasyon Raporu
        </span>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" className="h-8 bg-white" onClick={() => window.open(`/api/cme/report?editionId=${encodeURIComponent(editionId)}&format=csv`, "_blank")}>
            <Icons.Download className="size-3.5" /> CSV
          </Button>
          <Button size="sm" className="h-8" onClick={doPrint} disabled={!data}>
            <Icons.Printer className="size-3.5" /> Yazdır
          </Button>
          <Button size="sm" variant="outline" className="h-8 bg-white" onClick={onClose}>
            <Icons.X className="size-3.5" /> Kapat
          </Button>
        </div>
      </div>

      {error && (
        <div className="mx-auto mt-10 max-w-xl rounded-xl border border-rose-200 bg-rose-50 p-6 text-center text-sm text-rose-800">
          {error}
        </div>
      )}

      {!data && !error && (
        <div className="mx-auto mt-10 max-w-4xl animate-pulse rounded-2xl bg-white/80 p-10">
          <div className="space-y-4">
            <div className="h-10 w-2/3 rounded bg-muted" />
            <div className="h-4 w-1/2 rounded bg-muted" />
            <div className="h-40 rounded bg-muted" />
            <div className="h-56 rounded bg-muted" />
          </div>
        </div>
      )}

      {data && (
        <div className="maven-report-print mx-auto max-w-4xl pb-8">
          <article className="maven-report-doc overflow-hidden rounded-2xl border border-teal-900/10">
            {/* ── Antet ── */}
            <header className="maven-report-letterhead px-8 pb-6 pt-8 text-center">
              <p className="text-[11px] uppercase tracking-[0.28em] text-teal-800/80">{data.edition.tenantName}</p>
              <h1 className="mt-2 text-2xl font-bold tracking-tight text-teal-950">{data.edition.name}{data.edition.editionLabel ? ` — ${data.edition.editionLabel}` : ""}</h1>
              <p className="mt-1.5 text-xs text-teal-900/70">
                {[[data.edition.venueName, data.edition.city].filter(Boolean).join(", "), data.edition.country].filter(Boolean).join(" · ")}
                {data.edition.startDate && <> — {fmtDateTr(data.edition.startDate)}{data.edition.endDate ? ` / ${fmtDateTr(data.edition.endDate)}` : ""}</>}
              </p>
              <div className="mt-4 inline-flex items-center gap-3 rounded-full border border-teal-800/25 bg-white/70 px-4 py-1.5">
                <Icons.GraduationCap className="size-4 text-teal-700" aria-hidden />
                <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-teal-900">Sürekli Tıbbi Eğitim — Kredi Raporu</span>
              </div>
            </header>

            {/* ── Özet ── */}
            <section className="grid grid-cols-2 gap-px bg-teal-900/10 sm:grid-cols-4" aria-label="Özet">
              {[
                { label: "Kredili Oturum", value: `${data.summary.sessionsWithCredits}/${data.summary.sessionsTotal}` },
                { label: "Kredi Potansiyeli", value: data.summary.creditsPotential },
                { label: "Kredi Kazanan", value: data.summary.attendees },
                { label: "Dağıtılan Kredi", value: data.summary.creditsIssued },
              ].map((k) => (
                <div key={k.label} className="bg-white px-4 py-4 text-center">
                  <p className="text-xl font-bold tabular-nums text-teal-950">{k.value}</p>
                  <p className="mt-0.5 text-[10px] uppercase tracking-wider text-zinc-500">{k.label}</p>
                </div>
              ))}
            </section>

            <div className="px-8 py-6">
              {/* ── Oturum dökümü ── */}
              <h2 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-teal-900">
                <Icons.ListChecks className="size-4" aria-hidden /> Oturum Kredi Dökümü
              </h2>
              <table className="maven-report-table w-full text-xs" aria-label="Oturum kredi dökümü">
                <thead>
                  <tr className="text-left text-[10px] uppercase tracking-wider text-zinc-500">
                    <th className="px-2.5 py-2">Oturum</th>
                    <th className="px-2.5 py-2">Tarih</th>
                    <th className="px-2.5 py-2 text-right">Katılım</th>
                    <th className="px-2.5 py-2 text-right">Kredi</th>
                  </tr>
                </thead>
                <tbody>
                  {data.sessions.map((s) => (
                    <tr key={s.title + s.startTime}>
                      <td className="px-2.5 py-2">
                        <span className="font-semibold">{s.title}</span>
                        <span className="ml-2 text-[10px] uppercase text-zinc-400">{s.type}</span>
                      </td>
                      <td className="whitespace-nowrap px-2.5 py-2 tabular-nums text-zinc-600">
                        {fmtDay(s.startTime)} {fmtHour(s.startTime)}–{fmtHour(s.endTime)}
                      </td>
                      <td className="px-2.5 py-2 text-right tabular-nums">{s.attendanceCount}</td>
                      <td className={cn("px-2.5 py-2 text-right font-semibold tabular-nums", s.cmeCredits == null && "text-zinc-300")}>
                        {s.cmeCredits ?? "—"}
                      </td>
                    </tr>
                  ))}
                  <tr className="font-bold">
                    <td className="px-2.5 py-2" colSpan={3}>Toplam Potansiyel</td>
                    <td className="px-2.5 py-2 text-right tabular-nums">{data.summary.creditsPotential}</td>
                  </tr>
                </tbody>
              </table>

              {/* ── Kişi defteri ── */}
              <h2 className="mb-3 mt-8 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-teal-900">
                <Icons.Users className="size-4" aria-hidden /> Kredi Kazanan Katılımcılar
              </h2>
              {data.ledger.length === 0 ? (
                <p className="rounded-lg border border-dashed border-zinc-300 bg-zinc-50 px-4 py-6 text-center text-xs text-zinc-500">
                  Henüz kredi kazanan katılımcı yok — oturum taramaları gerçekleştiğinde defter işlenir.
                </p>
              ) : (
                <table className="maven-report-table w-full text-xs" aria-label="Kredi kazanan katılımcılar">
                  <thead>
                    <tr className="text-left text-[10px] uppercase tracking-wider text-zinc-500">
                      <th className="px-2.5 py-2">#</th>
                      <th className="px-2.5 py-2">Katılımcı</th>
                      <th className="px-2.5 py-2">Teyit No</th>
                      <th className="px-2.5 py-2">Rol</th>
                      <th className="px-2.5 py-2 text-right">Oturum</th>
                      <th className="px-2.5 py-2 text-right">Kredi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.ledger.map((l, i) => (
                      <tr key={l.confirmationNo ?? l.fullName}>
                        <td className="px-2.5 py-2 tabular-nums text-zinc-400">{i + 1}</td>
                        <td className="px-2.5 py-2">
                          <span className="font-semibold">{l.fullName}</span>
                          {(l.company || l.title) && <span className="ml-1.5 text-[10px] text-zinc-500">{[l.company, l.title].filter(Boolean).join(" · ")}</span>}
                        </td>
                        <td className="px-2.5 py-2 font-mono text-[10px] text-zinc-600">{l.confirmationNo ?? "—"}</td>
                        <td className="px-2.5 py-2 text-[10px] text-zinc-600">{l.roles.slice(0, 2).map((r) => label(EVENT_ROLES, r)).join(", ") || "—"}</td>
                        <td className="px-2.5 py-2 text-right tabular-nums">{l.attendedCount}</td>
                        <td className="px-2.5 py-2 text-right font-bold tabular-nums text-teal-900">{l.credits}</td>
                      </tr>
                    ))}
                    <tr className="font-bold">
                      <td className="px-2.5 py-2" colSpan={5}>Genel Toplam — {data.summary.attendees} kişi, ort. {data.summary.avgCredits} kredi</td>
                      <td className="px-2.5 py-2 text-right tabular-nums text-teal-900">{data.summary.creditsIssued}</td>
                    </tr>
                  </tbody>
                </table>
              )}

              {/* ── İmza blokları + mühür ── */}
              <div className="mt-10 flex flex-wrap items-end justify-between gap-6">
                {["Akreditasyon Sorumlusu", "Organizasyon Sekreteri"].map((role) => (
                  <div key={role} className="min-w-52 flex-1 text-center">
                    <div className="mx-auto mb-1.5 border-t border-zinc-400" />
                    <p className="text-[11px] font-semibold text-zinc-700">{role}</p>
                    <p className="text-[10px] text-zinc-400">Ad — İmza</p>
                  </div>
                ))}
                <div className="maven-report-seal relative grid size-24 shrink-0 place-items-center rounded-full border-2 border-dashed border-teal-800/50" aria-hidden>
                  <div className="absolute inset-1.5 rounded-full border border-teal-800/30" />
                  <div className="text-center leading-tight">
                    <p className="text-[8px] font-bold uppercase tracking-widest text-teal-800/80">Maven</p>
                    <p className="text-[7px] uppercase tracking-wider text-teal-800/60">Akreditasyon</p>
                  </div>
                </div>
              </div>
            </div>

            {/* ── Belge alt bilgisi ── */}
            <footer className="border-t border-teal-900/15 bg-teal-950/[0.03] px-8 py-3 text-center text-[9px] leading-relaxed text-zinc-500">
              Bu rapor Maven etkinlik yönetim sistemi tarafından {new Date(data.generatedAt).toLocaleString("tr-TR")} itibarıyla üretilmiştir —
              kredi kazanımı kuralı: oturum girişi taraması (geçerli okutma) esas alınır. Belge elektronik olarak düzenlenmiştir.
            </footer>
          </article>
        </div>
      )}
    </div>
  );
}
