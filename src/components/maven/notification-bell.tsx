"use client";
// Bildirim merkezi zili — aktivite günlüğünden türetilen canlı bildirimler (§47 domain event → UI)
// Canlı akış live-bus mini servisi üzerinden (socket.io) anında düşer; REST yoklaması yedek kanaldır.
// Okunmamış sayacı localStorage zaman damgasıyla tutulur; tıklanınca ilgili modüle gider.
import { useCallback, useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import { apiGet } from "@/lib/client";
import { useApp } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import * as Icons from "lucide-react";
import { cn } from "@/lib/utils";

interface NotifItem {
  id: string; type: string; message: string; actorName?: string | null; entityType?: string | null;
  createdAt: string; severity: "rose" | "amber" | "emerald" | "teal"; module: string | null;
}

const SEEN_KEY = "maven.notif.seen";
const MAX_ITEMS = 25;

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
  const { toast } = useToast();
  const [items, setItems] = useState<NotifItem[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [seenTs, setSeenTs] = useState(0);
  const [live, setLive] = useState(false);
  const [viewers, setViewers] = useState(0);
  const [flash, setFlash] = useState(false);
  const [liveIds, setLiveIds] = useState<Set<string>>(new Set());
  const socketRef = useRef<Socket | null>(null);
  // güncel edisyonu ref'te tut — socket connect closure'ı bayat state yakalamasın
  const editionRef = useRef<string | null>(currentEditionId);

  useEffect(() => {
    editionRef.current = currentEditionId;
    if (socketRef.current?.connected) {
      socketRef.current.emit("subscribe", { editionId: currentEditionId });
    }
  }, [currentEditionId]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiGet<{ items: NotifItem[] }>(`/api/notifications${currentEditionId ? `?editionId=${encodeURIComponent(currentEditionId)}` : ""}`);
      setItems(data.items);
    } catch { /* sessiz — bildirim akışı kritik değil */ }
    finally { setLoading(false); }
  }, [currentEditionId]);

  // canlı olay — listeye başa ekle, tekrar geleni atla
  const handleLive = useCallback((item: NotifItem) => {
    if (!item?.id) return;
    setLiveIds((prev) => new Set(prev).add(item.id));
    setItems((prev) => {
      if (prev.some((p) => p.id === item.id)) return prev;
      const next = [item, ...prev].slice(0, MAX_ITEMS);
      return next;
    });
    if (new Date(item.createdAt).getTime() > readSeen()) {
      setFlash(true);
      window.setTimeout(() => setFlash(false), 1600);
    }
    // kritik olaylar (rose) canlı toast ile de düşer
    if (item.severity === "rose") {
      toast({ title: "Kritik olay", description: item.message, variant: "destructive" });
    }
  }, [toast]);

  // N-06: edisyon değişiminde render-fazında sıfırla (resmî "önceki render" deseni) —
  // effect içi senkron setState yok; veri yükü effect'te kalır.
  const [seenFor, setSeenFor] = useState(currentEditionId);
  if (seenFor !== currentEditionId) {
    setSeenFor(currentEditionId);
    setSeenTs(readSeen());
  }
  // ilk yükleme + edisyon değişimi (N-06: tetikleme microtask'te — effect gövdesinde senkron setState yok).
  useEffect(() => {
    queueMicrotask(() => void load());
  }, [load]);

  // canlı veri yolu — socket bağlantısı (live-bus, XTransformPort=3003)
  useEffect(() => {
    const socket = io("/?XTransformPort=3003", {
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionAttempts: 12,
      reconnectionDelay: 2000,
      timeout: 8000,
    });
    socketRef.current = socket;

    socket.on("connect", () => {
      setLive(true);
      socket.emit("subscribe", { editionId: editionRef.current });
    });

    socket.on("disconnect", () => setLive(false));

    socket.on("activity", (item: NotifItem) => handleLive(item));

    socket.on("presence", (data: { clients?: number }) => {
      if (typeof data?.clients === "number") setViewers(data.clients);
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, []); // bağlantı bir kez kurulur; edisyon değişimi ref üzerinden izlenir

  // yoklama — canlı bağlıyken yavaş güvenlik ağı (3 dk), değilse hızlı yedek (45 sn)
  useEffect(() => {
    const interval = live ? 180000 : 45000;
    const t = setInterval(() => { void load(); }, interval);
    return () => clearInterval(t);
  }, [live, load]);

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
          <Icons.Bell className={cn("size-4 transition-transform", open && "scale-110", (unread > 0 || flash) && "animate-[swing_1.6s_ease-in-out_infinite]")} />
          {unread > 0 && (
            <span className="absolute -right-0.5 -top-0.5 grid min-w-4 place-items-center rounded-full bg-rose-500 px-1 text-[10px] font-bold leading-4 text-white shadow-sm">
              {unread > 9 ? "9+" : unread}
              <span aria-hidden className="absolute inline-flex size-full animate-ping rounded-full bg-rose-400 opacity-50" />
            </span>
          )}
          {/* canlı veri yolu göstergesi */}
          <span
            aria-hidden
            className={cn(
              "absolute bottom-1 right-1 size-1.5 rounded-full ring-2 ring-background transition-colors",
              live ? "bg-emerald-500 maven-live-dot" : "bg-zinc-400",
            )}
          />
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
                      className={cn(
                        "flex w-full items-start gap-2.5 px-3 py-2.5 text-left transition-colors hover:bg-muted/50",
                        isNew && "bg-primary/[0.04]",
                        liveIds.has(item.id) && "maven-notif-in",
                      )}
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
        <div className="flex items-center justify-between gap-2 border-t bg-muted/20 px-3 py-1.5 text-[10px] text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <span
              aria-hidden
              className={cn(
                "size-1.5 rounded-full",
                live ? "bg-emerald-500 maven-live-dot" : "bg-amber-500",
              )}
            />
            {live ? "Canlı akış" : "Yoklama modu"}
            {live && viewers > 1 && <span className="text-primary/70">· {viewers} izleyici</span>}
          </span>
          <span>Son {MAX_ITEMS} edisyon olayı</span>
        </div>
      </PopoverContent>
    </Popover>
  );
}
