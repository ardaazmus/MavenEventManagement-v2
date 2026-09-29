"use client";
// ─── PWA MOBİL KABUK — kurulum bottom-sheet'i + çevrimdışı şerit + kompakt bar ───
// Sektör deseni (Cvent/Bizzabo/Whova): kurulum önerisi anlamlı anda (giriş
// sonrası + gecikme), birincil CTA'yı kapatmaz; iOS'ta Paylaş-yönergesi
// (beforeinstallprompt iOS'ta yok); çevrimdışıyken ince şerit + yeniden dene.
import * as Icons from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLang } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export function isIosDevice(): boolean {
  if (typeof window === "undefined" || typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  const iDevice = /iPad|iPhone|iPod/.test(ua);
  // iPadOS 13+ masaüstü UA bildirir — dokunmatik Mac kontrolüyle yakala
  const iPadDesktop = navigator.platform === "MacIntel" && (navigator.maxTouchPoints ?? 0) > 1;
  return (iDevice || iPadDesktop) && !(window as unknown as { MSStream?: unknown }).MSStream;
}

// ─── kurulum bottom-sheet'i ──────────────────────────────────────────────
export function InstallSheet({
  open,
  onClose,
  onInstall,
  canInstall,
  showIos,
  accent,
  appName,
}: {
  open: boolean;
  onClose: () => void;
  onInstall: () => void;
  canInstall: boolean;
  showIos: boolean;
  accent: string;
  appName: string;
}) {
  const { t } = useLang();
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="false" aria-label={t("portalApp.installSheet.title")}>
      {/* hafif karartma — sekmelerin üstünde, içeriği kapatmaz */}
      <button aria-label={t("portalApp.installSheet.close")} onClick={onClose} className="absolute inset-0 cursor-default bg-black/30" />
      <div
        className="absolute inset-x-0 mx-auto w-full max-w-2xl rounded-t-3xl border bg-background p-4 shadow-2xl"
        style={{ bottom: 0, paddingBottom: "calc(env(safe-area-inset-bottom) + 16px)" }}
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-muted" aria-hidden />
        <div className="flex items-start gap-3">
          <div className="grid size-12 shrink-0 place-items-center rounded-2xl text-white shadow-md" style={{ backgroundColor: accent }}>
            <Icons.Smartphone className="size-6" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold">{t("portalApp.installSheet.title")}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {t("portalApp.installSheet.desc", { name: appName })}
            </p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label={t("portalApp.installSheet.close")} className="size-8 shrink-0">
            <Icons.X className="size-4" />
          </Button>
        </div>
        {showIos ? (
          <ol className="mt-3 space-y-2 rounded-xl bg-muted/50 p-3 text-xs">
            <li className="flex items-center gap-2">
              <Icons.Share className="size-4 shrink-0" style={{ color: accent }} />
              {t("portalApp.installSheet.ios1")}
            </li>
            <li className="flex items-center gap-2">
              <Icons.PlusSquare className="size-4 shrink-0" style={{ color: accent }} />
              {t("portalApp.installSheet.ios2")}
            </li>
            <li className="flex items-center gap-2">
              <Icons.CheckCircle2 className="size-4 shrink-0" style={{ color: accent }} />
              {t("portalApp.installSheet.ios3")}
            </li>
          </ol>
        ) : (
          <div className="mt-3 grid gap-2">
            <Button onClick={onInstall} disabled={!canInstall} className="h-11 text-sm font-semibold" style={{ backgroundColor: accent }}>
              <Icons.Download className="size-4" /> {t("portalApp.installSheet.installBtn")}
            </Button>
            {!canInstall && (
              <p className="text-center text-[11px] text-muted-foreground">{t("portalApp.installSheet.waitingBrowser")}</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── çevrimdışı şerit — ince, modal değil ─────────────────────────────────
export function OfflineStrip({ onRetry }: { onRetry: () => void }) {
  const { t } = useLang();
  return (
    <div
      role="status"
      className="sticky top-0 z-50 flex items-center justify-center gap-2 bg-amber-500 px-4 py-1.5 text-center text-[11px] font-semibold text-white"
      style={{ paddingTop: "calc(env(safe-area-inset-top) + 6px)" }}
    >
      <Icons.WifiOff className="size-3.5 shrink-0" />
      <span>{t("portalApp.offline.strip")}</span>
      <button onClick={onRetry} className="shrink-0 rounded-full bg-white/25 px-2 py-0.5 text-[10px] font-bold underline-offset-2 hover:bg-white/35">
        {t("portalApp.offline.retry")}
      </button>
    </div>
  );
}

// ─── kompakt uygulama çubuğu — home'da hero kayınca belirir ──────────────
export function CompactAppBar({
  visible,
  logoUrl,
  title,
  accent,
  unread,
  onBell,
  bellLabel,
}: {
  visible: boolean;
  logoUrl: string | null;
  title: string;
  accent: string;
  unread: number;
  onBell: () => void;
  bellLabel: string;
}) {
  return (
    <div
      data-testid="portal-compact-bar"
      className={cn(
        "fixed inset-x-0 top-0 z-40 border-b bg-background/95 backdrop-blur transition-transform duration-200 supports-[backdrop-filter]:bg-background/80",
        visible ? "translate-y-0" : "-translate-y-full",
      )}
      style={{ paddingTop: "env(safe-area-inset-top)" }}
      aria-hidden={!visible}
    >
      <div className="mx-auto flex w-full max-w-2xl items-center gap-2 px-4 py-2">
        {logoUrl ? (
           
          <img src={logoUrl} alt="" className="size-7 rounded-lg border object-contain" />
        ) : (
          <span className="grid size-7 place-items-center rounded-lg text-white" style={{ backgroundColor: accent }}>
            <Icons.CalendarRange className="size-4" />
          </span>
        )}
        <span className="min-w-0 flex-1 truncate text-sm font-bold">{title}</span>
        <button
          onClick={onBell}
          aria-label={bellLabel}
          tabIndex={visible ? 0 : -1}
          className="relative grid size-9 shrink-0 place-items-center rounded-full hover:bg-muted"
        >
          <Icons.Bell className="size-5" />
          {unread > 0 && (
            <span className="absolute right-1 top-1 grid size-4 place-items-center rounded-full bg-red-500 text-[9px] font-bold text-white">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </button>
      </div>
    </div>
  );
}
