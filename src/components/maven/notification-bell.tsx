"use client";
// Bildirim merkezi zili — aktivite günlüğünden türetilen canlı bildirimler (§47 domain event → UI)
// Okunmamış sayacı localStorage zaman damgasıyla tutulur; tıklanınca ilgili modüle gider.
import { useCallback, useEffect, useState } from "react";
import { apiGet } from "@/lib/client";
import { useApp } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import * as Icons from "lucide-react";
import { cn } from "@/lib/utils";

interface NotifItem {
  id: string; type: string; message: string; actorName?: string | null; entityType?: string | null;
  createdAt: string; severity: "rose" | "amber" | "emerald" | "teal"; module: string | null;
}

const SEEN_KEY = "maven.notif.seen";

function readSeen(): number {
  try {
    const v = window.localStorage.getItem(SEEN_KEY);
    return v ? Number(v) : 0;
  } catch { return 0; }
}

function relTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "şimdi";
  if (min < 60) return `${min} dk önce`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} sa önce`;
  const d = Math.floor(hr / 24);
  if (d === 1) return "dün";
  if (d < 7) return `${d} gün önce`;
  return new Date(iso).toLocaleDateString("tr-TR", { day: "2-digit", month: "short" });
}

const SEVERITY_CLS: Record<NotifItem["severity"], string> = {
  rose: "bg-rose-500/10 text-rose-600",
  amber: "bg-amber-500/10 text-amber-600",
  emerald: "bg-emerald-500/10 text-emerald-600",
  teal: "bg-teal-500/10 text-teal-600",
};

const SEVERITY_ICON: Record<NotifItem["severity"], string> = {
  rose: "ShieldAlert",
  amber: "CircleAlert",
  emerald: "CheckCircle2",
  teal: "Activity",
};

export function NotificationBell() {
  const { currentEditionId, setModule } = useApp();
  const [items, setItems] = useState<NotifItem[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [seenTs, setSeenTs] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiGet<{ items: NotifItem[] }>(`/api/notifications${currentEditionId ? `?editionId=${encodeURIComponent(currentEditionId)}` : ""}`);
      setItems(data.items);
    } catch { /* sessiz — bildirim akışı kritik değil */ }
    finally { setLoading(false); }
  }, [currentEditionId]);

  // ilk yükleme + edisyon değişimi + 60 sn'de bir hafif yoklama
  useEffect(() => {
    setSeenTs(readSeen());
    void load();
    const t = setInterval(() => { void load(); }, 60000);
    return () => clearInterval(t);
  }, [load]);

  const unread = items.filter((i) => new Date(i.createdAt).getTime() > seenTs).length;

  const markAllRead = () => {
    const now = Date.now();
    try { window.localStorage.setItem(SEEN_KEY, String(now)); } catch { /* yoksay */ }
    setSeenTs(now);
  };

  const openItem = (item: NotifItem) => {
    if (item.module) setModule(item.module);
    markAllRead();
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (o) void load(); }}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={`Bildirimler${unread > 0 ? ` — ${unread} okunmamış` : ""}`} className={cn("relative", unread > 0 && "text-primary")}>
          <Icons.Bell className={cn("size-4 transition-transform", open && "scale-110", unread > 0 && "animate-[swing_1.6s_ease-in-out_infinite]")} />
          {unread > 0 && (
            <span className="absolute -right-0.5 -top-0.5 grid min-w-4 place-items-center rounded-full bg-rose-500 px-1 text-[10px] font-bold leading-4 text-white shadow-sm">
              {unread > 9 ? "9+" : unread}
              <span aria-hidden className="absolute inline-flex size-full animate-ping rounded-full bg-rose-400 opacity-50" />
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(380px,calc(100vw-1.5rem))] p-0">
        <div className="flex items-center justify-between gap-2 border-b bg-muted/30 px-3 py-2.5">
          <div className="flex items-center gap-2">
            <Icons.BellRing className="size-4 text-primary" />
            <p className="text-sm font-semibold">Bildirimler</p>
            {unread > 0 && <span className="rounded-full bg-rose-100 px-1.5 py-0.5 text-[10px] font-semibold text-rose-700">{unread} yeni</span>}
          </div>
          <Button variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground" onClick={markAllRead} disabled={unread === 0}>
            <Icons.CheckCheck className="size-3.5" /> Tümünü gör
          </Button>
        </div>
        <div className="max-h-96 overflow-y-auto maven-scroll">
          {loading && items.length === 0 ? (
            <div className="space-y-2 p-3">
              {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-12 animate-pulse rounded-lg bg-muted" />)}
            </div>
          ) : items.length === 0 ? (
            <div className="flex min-h-32 flex-col items-center justify-center gap-2 p-6 text-center">
              <span className="grid size-10 place-items-center rounded-full bg-muted"><Icons.Inbox className="size-5 text-muted-foreground/60" /></span>
              <p className="text-sm font-medium">Bildirim yok</p>
              <p className="text-xs text-muted-foreground">Edisyon olayları burada görünür — kayıt, ödeme, tarama, teklif…</p>
            </div>
          ) : (
            <ul>
              {items.map((item, idx) => {
                const SevIcon = (Icons as unknown as Record<string, Icons.LucideIcon>)[SEVERITY_ICON[item.severity] ?? "Activity"] ?? Icons.Activity;
                const isNew = new Date(item.createdAt).getTime() > seenTs;
                return (
                  <li key={item.id}>
                    {idx > 0 && <Separator className="opacity-60" />}
                    <button
                      onClick={() => openItem(item)}
                      className={cn("flex w-full items-start gap-2.5 px-3 py-2.5 text-left transition-colors hover:bg-muted/50", isNew && "bg-primary/[0.04]")}
                    >
                      <span className={cn("mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg", SEVERITY_CLS[item.severity] ?? SEVERITY_CLS.teal)}>
                        <SevIcon className="size-3.5" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className={cn("block text-xs leading-snug", isNew ? "font-medium text-foreground" : "text-muted-foreground")}>{item.message}</span>
                        <span className="mt-1 flex flex-wrap items-center gap-x-2 text-[10px] text-muted-foreground/80">
                          <span>{relTime(item.createdAt)}</span>
                          {item.actorName && <span>· {item.actorName}</span>}
                          {item.module && <span className="inline-flex items-center gap-0.5 text-primary/70"><Icons.CornerDownRight className="size-2.5" /> modüle git</span>}
                        </span>
                      </span>
                      {isNew && <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary" aria-label="yeni" />}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <div className="border-t bg-muted/20 px-3 py-1.5 text-center text-[10px] text-muted-foreground">
          Son 25 edisyon olayı — kritik olaylar kırmızı, olumlu olaylar yeşil işaretlenir
        </div>
      </PopoverContent>
    </Popover>
  );
}
