"use client";
// Paylaşılan UI parçaları — §3 ortak ekran kalıbı
// KPI kartı, durum yaka kartı, boş durum, bölüm kartı, yükleniyor.
import { ReactNode, useEffect, useState } from "react";
import { STATUS_TONE } from "@/lib/constants";
import { tStatus } from "@/lib/i18n"; // TASK-A F8: StatusBadge dil-duyarlı (TR: map, EN: status.<value>)
import { Skeleton } from "@/components/ui/skeleton";
import { Inbox, RefreshCw, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

export function StatusBadge({ map, value, className }: { map: Record<string, string>; value?: string | null; className?: string }) {
  // TASK-A F8: TR modunda donuk map etiketi, EN modunda status.<value> — TR birebir korunur
  const label = value ? tStatus(map[value], value) : "—";
  const tone = (value && STATUS_TONE[value]) || "bg-neutral-100 text-neutral-700 border-neutral-200";
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium shadow-[inset_0_1px_0_rgba(255,255,255,0.4)] ${tone} ${className ?? ""}`}>
      <span className="size-1.5 rounded-full bg-current opacity-70" aria-hidden />
      {label}
    </span>
  );
}

export function Chip({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "teal" | "amber" | "rose" | "violet" | "emerald" | "sky" }) {
  const tones: Record<string, string> = {
    neutral: "bg-muted text-muted-foreground border-border",
    teal: "bg-teal-50 text-teal-700 border-teal-200",
    amber: "bg-amber-50 text-amber-700 border-amber-200",
    rose: "bg-rose-50 text-rose-700 border-rose-200",
    violet: "bg-violet-50 text-violet-700 border-violet-200",
    emerald: "bg-emerald-50 text-emerald-700 border-emerald-200",
    sky: "bg-sky-50 text-sky-700 border-sky-200",
  };
  return <span className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-[11px] font-medium ${tones[tone]}`}>{children}</span>;
}

export function KpiCard({
  label, value, sub, onClick, icon, tone = "teal", detailHref,
}: {
  label: string; value: ReactNode; sub?: ReactNode; onClick?: () => void; icon?: ReactNode; tone?: string; detailHref?: string;
}) {
  const tones: Record<string, string> = {
    teal: "bg-teal-500/10 text-teal-600",
    emerald: "bg-emerald-500/10 text-emerald-600",
    amber: "bg-amber-500/10 text-amber-600",
    rose: "bg-rose-500/10 text-rose-600",
    violet: "bg-violet-500/10 text-violet-600",
    neutral: "bg-muted text-muted-foreground",
  };
  const Comp = onClick ? "button" : "div";
  return (
    <Comp
      onClick={onClick}
      type={onClick ? "button" : undefined}
      className={`group relative flex flex-col gap-1 overflow-hidden rounded-xl border bg-card p-4 text-left shadow-sm transition-all duration-200 ${onClick ? "cursor-pointer hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 active:translate-y-0" : ""}`}
    >
      {onClick && <span className="absolute inset-x-0 top-0 h-0.5 scale-x-0 bg-primary/60 transition-transform duration-200 group-hover:scale-x-100" aria-hidden />}
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        {icon && <span className={`grid size-7 place-items-center rounded-lg transition-transform duration-200 group-hover:scale-110 ${tones[tone] ?? tones.teal}`}>{icon}</span>}
      </div>
      <span className="text-2xl font-semibold tracking-tight tabular-nums">{value}</span>
      {sub && <span className="text-xs text-muted-foreground">{sub}</span>}
      {onClick && (
        <span className="mt-0.5 text-[11px] font-medium text-primary/80 opacity-0 transition group-hover:opacity-100">
          {detailHref ? detailHref : "Ayrıntıyı gör →"}
        </span>
      )}
    </Comp>
  );
}

export function SectionCard({
  title, desc, action, children, className, bodyClass,
}: {
  title: ReactNode; desc?: ReactNode; action?: ReactNode; children: ReactNode; className?: string; bodyClass?: string;
}) {
  return (
    <section className={`flex flex-col overflow-hidden rounded-xl border bg-card shadow-sm transition-shadow hover:shadow ${className ?? ""}`}>
      <header className="flex items-start justify-between gap-3 border-b bg-muted/30 px-4 py-3">
        <div>
          <h3 className="text-sm font-semibold leading-tight">{title}</h3>
          {desc && <p className="mt-0.5 text-xs text-muted-foreground">{desc}</p>}
        </div>
        {action}
      </header>
      <div className={`min-h-0 flex-1 p-4 ${bodyClass ?? ""}`}>{children}</div>
    </section>
  );
}

export function EmptyState({ title, desc, action }: { title: string; desc?: string; action?: ReactNode }) {
  return (
    <div className="flex min-h-40 flex-col items-center justify-center gap-2.5 rounded-lg border border-dashed bg-muted/20 p-6 text-center transition-colors">
      <span className="grid size-10 place-items-center rounded-full bg-muted">
        <Inbox className="size-5 text-muted-foreground/60" />
      </span>
      <p className="text-sm font-medium">{title}</p>
      {desc && <p className="max-w-sm text-xs text-muted-foreground">{desc}</p>}
      {action}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex min-h-40 flex-col items-center justify-center gap-2 rounded-lg border border-rose-200 bg-rose-50/50 p-6 text-center">
      <AlertTriangle className="size-8 text-rose-400" />
      <p className="text-sm font-medium text-rose-700">{message}</p>
      {onRetry && (
        <Button size="sm" variant="outline" onClick={onRetry}>
          <RefreshCw className="size-3.5" /> Yeniden dene
        </Button>
      )}
    </div>
  );
}

export function Loading({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-10 w-full" />
      ))}
    </div>
  );
}

// basit veri çekme kancası — refreshKey ile global yenileme
// P2: useApi — append modu opsiyonel: loader imleç alır ve { items, nextCursor } döndürür;
// more.next() sonraki sayfayı MEVCUT listeye EKLER (10k satır erişilebilirliği imleçle yürür).
export function useApi<T>(
  loader: (cursor?: string) => Promise<T>,
  deps: unknown[],
  opts?: { append?: boolean },
): {
  data: T | null; error: string | null; reload: () => void; loading: boolean;
  more?: { loading: boolean; hasMore: boolean; next: () => void };
} {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [moreLoading, setMoreLoading] = useState(false);
  const [cursor, setCursor] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const reload = () => setTick((t) => t + 1);

  useEffect(() => {
    let alive = true;
    const run = async () => {
      setLoading(true);
      try {
        const d = await loader(undefined);
        if (alive) {
          setData(d);
          setError(null);
          // append modda imleç ilk sayfadan alınır (sıfırlanır)
          const nc = (d as { nextCursor?: string | null } | null)?.nextCursor ?? null;
          if (opts?.append) setCursor(nc);
        }
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : "Hata");
      } finally {
        if (alive) setLoading(false);
      }
    };
    void run();
    return () => { alive = false; };
  }, [...deps, tick]);

  const next = () => {
    if (!opts?.append || moreLoading || !cursor) return;
    setMoreLoading(true);
    void (async () => {
      try {
        const page = await loader(cursor);
        const p = page as { items?: unknown[]; nextCursor?: string | null };
        setCursor(p.nextCursor ?? null);
        setData((prev) => {
          if (prev == null) return page;
          const prevItems = (prev as { items?: unknown[] }).items ?? [];
          return { ...prev, items: [...prevItems, ...(p.items ?? [])] } as T;
        });
      } catch (e) {
        setError(e instanceof Error ? e.message : "Hata");
      } finally {
        setMoreLoading(false);
      }
    })();
  };

  const more = opts?.append
    ? { loading: moreLoading, hasMore: cursor != null, next }
    : undefined;

  return { data, error, reload, loading, more };
}

export function PageHeader({ title, desc, children }: { title: string; desc?: string; children?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div className="flex items-start gap-2.5">
        <span className="mt-1.5 hidden h-5 w-1 rounded-full bg-gradient-to-b from-teal-500 to-teal-300 sm:block" aria-hidden />
        <div>
          <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
          {desc && <p className="text-sm text-muted-foreground">{desc}</p>}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}
