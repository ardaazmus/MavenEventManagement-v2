"use client";
// ─── PWA / MOBILE-FIRST KATILIMCI DIŞ PORTALI (§2-§4) ─────────────────────────
// Mimari: yönetici uygulamasından AYRI yüzey — /?portal=<slug> ile açılır (Shell'siz).
//  • Giriş: Etkinlik Kodu (GUEST) | Magic Link/Access Token (AUTH) | E-posta+Kod (AUTH)
//  • Top Header: organizatör + diğer etkinlikler carousel (admin seçimi)
//  • Event Header: banner + logo + ad + tarih + mekân
//  • Dashboard: admin feature-toggles ile filtrelenen widget kartları (RBAC server-side)
//  • Alt menü: 5 sabit ikon (Anasayfa/Program/Sponsorlar/Yer Planı/Profil) — admin
//    ikon gizleyebilir; Anasayfa+Profil sabittir
//  • B2B: yalnız AUTH (sunucu kapısı) — onayla/reddet/zaman talebi
//  • Bildirimler: oturum hatırlatıcıları (60/30/10 dk — admin yapılandırır) + canlı duyuru
//  • PWA: manifest + service worker + install prompt + kurulum analitiği
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as Icons from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { ToastAction } from "@/components/ui/toast";
import { useLang, t } from "@/lib/i18n";
import { fmtDate, fmtDateTime, fmtMoney } from "@/lib/constants";
import { apiGet, apiSend } from "@/lib/client";
import { cn } from "@/lib/utils";
import { fontStackFor, loadGoogleFont } from "@/lib/portal-fonts";
import dynamic from "next/dynamic";
import { resolvePortalIcon } from "@/components/maven/portal-icon-library";
import { haptic } from "@/lib/haptic";
import { useSwipeBack } from "@/hooks/useSwipeBack";
import { usePWAInstall } from "@/hooks/usePWAInstall";
import { PORTAL_NAV_ROOT, parseNavHash, navHash, pushNav, popNav, resetNav, syncNav, isPortalScreen } from "@/lib/portal-nav";
// PublicFormPage artık STATİK import EDİLMEZ — aşağıda dynamic (CRON-10 lazy chunk)

// CRON-10: form motoru ağır bir pakettir — portala STATİK değil, form açılınca
// yüklenir (ilk boyama bundle'ı küçülür); açılış anında hafif iskelet gösterilir
const FormEngineSkeleton = () => (
  <div className="grid min-h-[60dvh] w-full place-items-center bg-background" role="status" aria-label="Form yükleniyor">
    <div className="flex flex-col items-center gap-2 text-muted-foreground">
      <Icons.Loader2 className="size-6 animate-spin" />
      <p className="text-xs">Form yükleniyor…</p>
    </div>
  </div>
);
const PublicFormPageLazy = dynamic(
  () => import("@/components/maven/public-form").then((m) => ({ default: m.PublicFormPage })),
  { loading: FormEngineSkeleton, ssr: false },
);

// ─── tipler (API yanıt aynası) ──────────────────────────────────────────────
type Phase = "LOADING" | "LOGIN" | "DISABLED" | "ACTIVE" | "ERROR";
type WidgetCfg = { key: string; enabled: boolean; visibility: "ALL" | "AUTH"; order: number };
type EditionView = {
  id: string; slug: string; name: string; editionLabel: string | null;
  startDate: string | null; endDate: string | null; venueName: string | null; city: string | null;
  description: string | null; logoUrl: string | null; headerImageUrl: string | null;
  portalHeaderTitle: string | null; portalHeaderSubtitle: string | null; portalHeaderAccent: string | null;
};
type ProgramItem = {
  id: string; title: string; description: string | null; type: string;
  startTime: string; endTime: string; room: string | null; track: string | null;
  cmeCredits: number | null;
  capacity: number | null; accessRule: string | null; registeredCount: number;
  speakers: { personId: string; name: string; role: string; photoUrl: string | null }[];
};
type SpeakerItem = {
  personId: string; name: string; title: string | null; company: string | null;
  photoUrl: string | null; bio: string | null; linkedin: string | null;
  sessions: { id: string; title: string; startTime: string; role: string }[];
};
type SponsorItem = {
  organizationId: string; name: string; logoUrl: string | null; website: string | null;
  description: string | null; city: string | null; country: string | null; tierName: string | null;
};
type Announcement = { id: string; title: string; message: string; level: string; createdAt: string };
type B2bMeeting = {
  assignmentId: string; planId: string; subject: string; description: string | null;
  startsAt: string | null; endsAt: string | null; location: string | null; venue: string | null;
  status: string; myRole: string; personApproved: boolean; organizerApproved: boolean;
  feedback: string | null;
  counterpart: { name: string; company: string | null }[];
};
type OtherEvent = { id: string; slug: string; name: string; editionLabel: string | null; startDate: string | null; endDate: string | null; city: string | null; logoUrl: string | null; headerImageUrl: string | null };
// §5.2+ tasarım kontrolü — admin ayarlarından gelir; hepsi nullable (varsayılan tema)
type IconOverride = { icon?: string; svg?: string; color?: string };
type PortalDesign = {
  fontFamily: string | null; fontScale: number | null;
  headerBgColor: string | null; footerBgColor: string | null; contentBgColor: string | null;
  headerBgImage: string | null; footerBgImage: string | null; contentBgImage: string | null;
  iconOverrides: Record<string, IconOverride> | null;
  iconLayout: Record<string, number> | null;
};
// ekran üst-bant görünürlüğü — "Ana sayfa haricinde Maven ın üst bandı görünmesin;
// her ekranda custom karar" (kullanıcı isteği). Eksik ekran → varsayılanlar.
type PortalChrome = {
  topHeader?: Record<string, boolean> | null; // Maven üst bandı (organizatör + diğer etkinlikler)
  eventBar?: Record<string, boolean> | null; // etkinlik başlığı (home'da hero, diğer ekranlarda kompakt bar)
};
type GameRules = { enabled: boolean; points: Record<string, number>; levels: { name: string; min: number }[] };
type GameQuest = { key: string; kind: string; label: string; points: number; done: boolean; progress?: number; target?: number };
type GameData = {
  enabled: boolean;
  points: number;
  level: string;
  levelMin: number;
  nextLevel: string | null;
  nextLevelMin: number | null;
  pct: number;
  quests: GameQuest[];
  leaderboard: { rank: number; name: string | null; points: number; you: boolean }[];
  isAuth: boolean;
};
// font ailesi anahtarı → CSS stack — lib/portal-fonts (sistem + Google Fonts) tek kaynak
const PORTAL_FONT_STACKS = fontStackFor;

// ikon çözümleyici: override.icon (kütüphane) > override.svg (yüklü logo) > varsayılan lucide
function resolveIconNode(
  key: string,
  fallback: (typeof Icons.Home),
  overrides: Record<string, IconOverride> | null | undefined,
  props: { className?: string; style?: React.CSSProperties },
): React.ReactNode {
  const o = overrides?.[key];
  if (o?.svg) {
    return <img src={o.svg} alt="" className={props.className} style={{ objectFit: "contain", ...(props.style ?? {}) }} />;
  }
  const O = o?.icon ? resolvePortalIcon(o.icon) : null;
  const I = O ?? fallback;
  return <I className={props.className} style={props.style} />;
}
type PortalContent = {
  phase: string;
  session?: { kind: "GUEST" | "AUTH" };
  edition: EditionView;
  tenant: { name: string; logoUrl: string | null };
  maintenanceMessage?: string | null;
  countdownTo?: string | null;
  loginOptions?: { codeLogin: boolean; emailLogin: boolean; allowRegistrationRedirect: boolean; registrationFormId: string | null };
  config?: {
    themeColor: string | null;
    widgets: WidgetCfg[];
    bottomNav: Record<string, boolean>;
    notifications: { enabled: boolean; offsets: number[] };
    venueMap: { enabled: boolean; url: string | null };
    allowRegistrationRedirect: boolean;
    registrationFormId: string | null;
    pwaEnabled: boolean;
    design?: PortalDesign | null;
    chrome?: PortalChrome | null;
    game?: GameRules | null;
    portalSponsor?: { logoUrl: string | null; name: string | null; url: string | null } | null;
  };
  otherEvents?: OtherEvent[];
  program?: ProgramItem[];
  speakers?: SpeakerItem[];
  sponsors?: SponsorItem[];
  forms?: { id: string; name: string; description: string | null; type: string; slug: string | null }[];
  announcements?: Announcement[];
  blocks?: { id: string; type: string; title: string; payloadJson: string | null }[];
  b2b?: B2bMeeting[];
  mySessionRegIds?: string[];
  myQuestions?: { id: string; body: string; status: string; answerBody?: string | null; answeredAt?: string | null; createdAt: string; programSessionId: string | null }[];
};
type MeData = {
  person: { id: string; firstName: string; lastName: string; email: string | null; title: string | null; company: string | null; photoUrl: string | null; linkedin: string | null };
  participation: { id: string; attendance: string | null; roles: string[]; badges: { badgeNo: string | null; status: string; profileName: string | null }[] } | null;
  registrations: { id: string; confirmationNo: string | null; status: string; submittedAt: string | null; decidedAt: string | null; categoryName: string | null; basePrice: number; currency: string }[];
  orders: { id: string; orderNo: string; status: string; totalAmount: number; currency: string; remaining: number }[];
  balanceTotal: number;
  sponsorship: { organizationId: string; name: string; logoUrl: string | null; tierName: string | null } | null;
};

// ─── yardımcılar ────────────────────────────────────────────────────────────
const sessionKeyStorage = (slug: string) => `maven.portal.${slug}`;
const firedStorage = (slug: string) => `maven.portal.fired.${slug}`;
const remindersStorage = (slug: string) => `maven.portal.reminders.${slug}`;

// portal POST yardımcısı — oturum başlığı taşır (apiSend header kabul etmediği için).
// Hata yanıtlarındaki makine-okur "code" alanı (örn. 409 SESSION_FULL / TIME_CONFLICT)
// PortalApiError.code ile taşınır — arayüz dostu mesajı i18n'den seçer.
class PortalApiError extends Error {
  code: string | null;
  conflictWith: string | null;
  constructor(message: string, code: string | null, conflictWith: string | null) {
    super(message);
    this.code = code;
    this.conflictWith = conflictWith;
  }
}
async function portalSend(path: string, body: unknown, sessionKey: string | null): Promise<unknown> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(sessionKey ? { "x-portal-session": sessionKey } : {}) },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const d = data as { error?: string; code?: string; conflictWith?: string };
    throw new PortalApiError(d.error ?? `İşlem başarısız (${res.status})`, d.code ?? null, d.conflictWith ?? null);
  }
  return data;
}

function loadStoredSession(slug: string): string | null {
  try {
    return localStorage.getItem(sessionKeyStorage(slug));
  } catch {
    return null;
  }
}
function storeSession(slug: string, key: string) {
  try {
    localStorage.setItem(sessionKeyStorage(slug), key);
  } catch {
    /* yoksay */
  }
}
function clearSession(slug: string) {
  try {
    localStorage.removeItem(sessionKeyStorage(slug));
  } catch {
    /* yoksay */
  }
}
type MarkedReminder = { key: string; fireAt: number; title: string; body: string };
function loadFired(slug: string): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(firedStorage(slug)) ?? "[]") as string[]);
  } catch {
    return new Set();
  }
}
function saveFired(slug: string, fired: Set<string>) {
  try {
    // faz büyümesini önle — son 200 kayıt yeter
    localStorage.setItem(firedStorage(slug), JSON.stringify([...fired].slice(-200)));
  } catch {
    /* yoksay */
  }
}
function loadReminders(slug: string): MarkedReminder[] {
  try {
    return JSON.parse(localStorage.getItem(remindersStorage(slug)) ?? "[]") as MarkedReminder[];
  } catch {
    return [];
  }
}

// Takvime ekle (ICS) — program oturumunu .ics olarak indirir (RFC 5545, UTC zaman).
// Bağımlılıksız istemci-indirme: dosya Blob olarak oluşturulup <a download> ile verilir.
function downloadIcs(s: ProgramItem) {
  const stamp = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const esc = (v: string) => v.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
  const desc = [s.description ?? "", s.speakers.length ? s.speakers.map((x) => x.name).join(", ") : ""]
    .filter(Boolean)
    .join("\n");
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Maven//Event Portal//TR",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${s.id}@maven-portal`,
    `DTSTAMP:${stamp(new Date().toISOString())}`,
    `DTSTART:${stamp(s.startTime)}`,
    `DTEND:${stamp(s.endTime)}`,
    `SUMMARY:${esc(s.title)}`,
  ];
  if (desc) lines.push(`DESCRIPTION:${esc(desc)}`);
  if (s.room) lines.push(`LOCATION:${esc(s.room)}`);
  lines.push("END:VEVENT", "END:VCALENDAR");
  const blob = new Blob([lines.join("\r\n")], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${s.title.slice(0, 40).replace(/[^\p{L}\p{N} _-]/gu, "").trim() || "session"}.ics`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
function saveReminders(slug: string, items: MarkedReminder[]) {
  try {
    localStorage.setItem(remindersStorage(slug), JSON.stringify(items));
  } catch {
    /* yoksay */
  }
}

// bildirim merkezi (CRON-4) — okunmadı takibi (son açma zamanı) + duyuru kapatma kalıcılığı
const notifReadStorage = (slug: string) => `maven.portal.notifread.${slug}`;
const annDismissStorage = (slug: string) => `maven.portal.anndismiss.${slug}`;
function loadNotifReadMs(slug: string): number {
  try {
    const v = Number(localStorage.getItem(notifReadStorage(slug)));
    return Number.isFinite(v) && v > 0 ? v : 0;
  } catch {
    return 0;
  }
}
function saveNotifReadMs(slug: string, ms: number) {
  try {
    localStorage.setItem(notifReadStorage(slug), String(ms));
  } catch {
    /* yoksay */
  }
}
function loadAnnDismissed(slug: string): string | null {
  try {
    return localStorage.getItem(annDismissStorage(slug));
  } catch {
    return null;
  }
}
function saveAnnDismissed(slug: string, id: string | null) {
  try {
    if (id) localStorage.setItem(annDismissStorage(slug), id);
    else localStorage.removeItem(annDismissStorage(slug));
  } catch {
    /* yoksay */
  }
}

// ─── BİLDİRİM ÇANI — okunmamış sayacıyla (CRON-4) ───────────────────────
function NotifBellButton({ unread, accent, onClick, label }: { unread: number; accent: string; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="relative grid size-8 shrink-0 place-items-center rounded-full transition hover:bg-muted active:scale-95"
    >
      <Icons.Bell className="size-4 text-foreground/80" />
      {unread > 0 && (
        <span
          className="absolute -right-0.5 -top-0.5 grid min-w-[16px] place-items-center rounded-full px-1 text-[9px] font-bold leading-4 text-white"
          style={{ backgroundColor: accent }}
        >
          {unread > 9 ? "9+" : unread}
        </span>
      )}
    </button>
  );
}

// ─── HAFİF BİLDİRİM MERKEZİ (CRON-4) — duyuru geçmişi + yaklaşan hatırlatıcılar ──
// Ağ isteği YOK: anket listesi (20 sn polling zaten çekiyor) + localStorage hatırlatıcıları
// ve B2B randevuları (hatırlatıcı motoruyla BİREBİR kaynaklar) kullanılır.
const ANN_LEVEL_STYLE: Record<string, { chip: string; icon: typeof Icons.Megaphone }> = {
  URGENT: { chip: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300", icon: Icons.AlertTriangle },
  WARNING: { chip: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300", icon: Icons.ShieldAlert },
  INFO: { chip: "bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300", icon: Icons.Megaphone },
};
function NotificationCenterSheet({
  open,
  onOpenChange,
  announcements,
  content,
  editionSlug,
  offsets,
  notificationsEnabled,
  accent,
  lastReadMs,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  announcements: Announcement[];
  content: PortalContent;
  editionSlug: string;
  offsets: number[];
  notificationsEnabled: boolean;
  accent: string;
  lastReadMs: number;
}) {
  const { t } = useLang();
  // yaklaşan hatırlatıcılar — hatırlatıcı motoruyla aynı hedef kümesi (gelecek zamanli)
  const upcoming = useMemo(() => {
    if (!open) return [];
    const now = Date.now();
    const out: { key: string; fireAt: number; title: string; body: string; kind: "B2B" | "SESSION" }[] = [];
    for (const m of content.b2b ?? []) {
      if (!m.startsAt || m.status === "DECLINED" || m.status === "CANCELLED") continue;
      const at = new Date(m.startsAt).getTime();
      if (at <= now) continue;
      out.push({ key: `b2b:${m.assignmentId}`, fireAt: at, title: t("portalApp.reminder.b2bTitle"), body: `${m.subject} — ${fmtDateTime(m.startsAt)}`, kind: "B2B" });
    }
    for (const r of loadReminders(editionSlug)) if (r.fireAt > now) out.push({ ...r, kind: "SESSION" });
    return out.sort((a, b) => a.fireAt - b.fireAt).slice(0, 6);
  }, [open, content, editionSlug, t]);

  const countdown = (fireAt: number): string => {
    const mins = Math.max(0, Math.round((fireAt - Date.now()) / 60_000));
    if (mins < 60) return t("portalApp.notifCenter.inMin", { n: mins });
    const h = Math.floor(mins / 60);
    if (h < 24) return t("portalApp.notifCenter.inHour", { n: h });
    return fmtDateTime(new Date(fireAt).toISOString());
  };
  const relTime = (iso: string): string => {
    const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
    if (m < 1) return t("portalApp.notifCenter.now");
    if (m < 60) return t("portalApp.notifCenter.minAgo", { n: m });
    const h = Math.floor(m / 60);
    if (h < 24) return t("portalApp.notifCenter.hourAgo", { n: h });
    return fmtDate(iso);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="mx-auto max-h-[80dvh] w-full max-w-2xl rounded-t-2xl p-0">
        <SheetHeader className="border-b px-4 pb-3 pt-3">
          <SheetTitle className="flex items-center gap-2 text-sm">
            <span className="grid size-7 place-items-center rounded-lg text-white" style={{ backgroundColor: accent }}>
              <Icons.Bell className="size-3.5" />
            </span>
            {t("portalApp.notifCenter.title")}
            <span className="ml-auto flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[9px] font-medium text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
              <span className="size-1.5 animate-pulse rounded-full bg-emerald-500" />
              {t("portalApp.notifCenter.liveHint")}
            </span>
          </SheetTitle>
          <SheetDescription className="sr-only">{t("portalApp.notifCenter.announcements")} — {t("portalApp.notifCenter.reminders")}</SheetDescription>
        </SheetHeader>
        <div className="maven-scroll max-h-[64dvh] space-y-4 overflow-y-auto px-4 py-3">
          {/* ── DUYURULAR — tam geçmiş + okunmadı noktası ── */}
          <section aria-label={t("portalApp.notifCenter.announcements")}>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{t("portalApp.notifCenter.announcements")}</p>
            {announcements.length === 0 ? (
              <div className="mt-1.5 rounded-xl border border-dashed p-4 text-center">
                <Icons.Megaphone className="mx-auto size-4 text-muted-foreground" />
                <p className="mt-1 text-[11px] text-muted-foreground">{t("portalApp.notifCenter.emptyAnn")}</p>
              </div>
            ) : (
              <ul className="mt-1.5 space-y-1.5">
                {announcements.map((a) => {
                  const st = ANN_LEVEL_STYLE[a.level] ?? ANN_LEVEL_STYLE.INFO;
                  const unread = new Date(a.createdAt).getTime() > lastReadMs;
                  const Ico = st.icon;
                  return (
                    <li key={a.id} className={cn("relative flex items-start gap-2.5 rounded-xl border p-2.5", unread && "bg-muted/30")}>
                      {unread && <span className="absolute right-2.5 top-2.5 size-2 rounded-full" style={{ backgroundColor: accent }} />}
                      <span className={cn("mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg", st.chip)}>
                        <Ico className="size-3.5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline gap-2">
                          <p className="min-w-0 truncate text-xs font-semibold">{a.title}</p>
                          <span className="ml-auto shrink-0 text-[9px] tabular-nums text-muted-foreground">{relTime(a.createdAt)}</span>
                        </div>
                        <p className="mt-0.5 line-clamp-2 text-[11px] leading-relaxed text-muted-foreground">{a.message}</p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {/* ── YAKLAŞAN HATIRLATICILAR — işaretli oturumlar + B2B randevuları ── */}
          <section aria-label={t("portalApp.notifCenter.reminders")}>
            <div className="flex flex-wrap items-center gap-1.5">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{t("portalApp.notifCenter.reminders")}</p>
              {notificationsEnabled && (
                <span className="rounded-full bg-muted px-1.5 py-px text-[9px] text-muted-foreground">
                  {t("portalApp.notifCenter.offsetsLabel", { offsets: offsets.join(" / ") })}
                </span>
              )}
            </div>
            {!notificationsEnabled ? (
              <div className="mt-1.5 rounded-xl border border-dashed p-3">
                <p className="text-xs font-medium">{t("portalApp.reminder.disabledTitle")}</p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">{t("portalApp.reminder.disabledDesc")}</p>
              </div>
            ) : upcoming.length === 0 ? (
              <div className="mt-1.5 rounded-xl border border-dashed p-4 text-center">
                <Icons.BellOff className="mx-auto size-4 text-muted-foreground" />
                <p className="mt-1 text-[11px] text-muted-foreground">{t("portalApp.notifCenter.emptyRem")}</p>
              </div>
            ) : (
              <ul className="mt-1.5 space-y-1.5">
                {upcoming.map((r) => (
                  <li key={r.key} className="flex items-start gap-2.5 rounded-xl border p-2.5">
                    <span
                      className={cn(
                        "mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg",
                        r.kind === "B2B"
                          ? "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300"
                          : "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
                      )}
                    >
                      {r.kind === "B2B" ? <Icons.Handshake className="size-3.5" /> : <Icons.BellRing className="size-3.5" />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-semibold">{r.title}</p>
                      <p className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground">{r.body}</p>
                    </div>
                    <span
                      className="shrink-0 rounded-full px-2 py-0.5 text-[9px] font-semibold tabular-nums"
                      style={{ backgroundColor: `${accent}1a`, color: accent }}
                    >
                      {countdown(r.fireAt)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </SheetContent>
    </Sheet>
  );
}

const SESSION_TYPE_COLORS: Record<string, string> = {
  KEYNOTE: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200",
  TALK: "bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-200",
  PANEL: "bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-200",
  WORKSHOP: "bg-orange-100 text-orange-800 dark:bg-orange-900/40 dark:text-orange-200",
  BREAK: "bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-300",
  NETWORKING: "bg-pink-100 text-pink-800 dark:bg-pink-900/40 dark:text-pink-200",
  POSTER_SESSION: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900/40 dark:text-cyan-200",
};

// ─── ana bileşen ────────────────────────────────────────────────────────────
export function PortalApp({ editionSlug, magicToken }: { editionSlug: string; magicToken?: string }) {
  const { t } = useLang();
  const { toast } = useToast();
  const [phase, setPhase] = useState<Phase>("LOADING");
  const [content, setContent] = useState<PortalContent | null>(null);
  const [kind, setKind] = useState<"GUEST" | "AUTH" | null>(null);
  // ── gezinme yığını: her ekranın "önceki sayfa"sı buradan çözülür (kök: home) ──
  const [nav, setNav] = useState<string[]>(() => [PORTAL_NAV_ROOT]);
  // reload→home: hash yalnizca popstate esitlemesi icindir (derin-bag cozulmez)
  const screen = nav[nav.length - 1] ?? PORTAL_NAV_ROOT;
  // detay-içi geri (konuşmacı/sponsor detayı): açık detay önce kapanır, sonra yığın pop'lanır
  const subBackRef = useRef<(() => boolean) | null>(null);
  const registerSubBack = useCallback((fn: (() => boolean) | null) => { subBackRef.current = fn; }, []);
  const [formRef, setFormRef] = useState<string | null>(null); // portal-İÇİ form ekranı (?form= yerine)
  const [fatal, setFatal] = useState<string | null>(null);
  const [sessionKey, setSessionKey] = useState<string | null>(null);
  const sessionRef = useRef<string | null>(null);
  // ── bildirim merkezi (CRON-4): canlı duyuru listesi + okunmadı takibi ──
  const [liveAnnouncements, setLiveAnnouncements] = useState<Announcement[]>([]);
  const [notifOpen, setNotifOpen] = useState(false);
  // N-06: depo değeri tembel başlatılır; edisyon değişiminde render-fazında tazelenir.
  const [lastReadMs, setLastReadMs] = useState(() => loadNotifReadMs(editionSlug));

  const fetchContent = useCallback(
    async (sessionKey: string | null) => {
      const headers: Record<string, string> = sessionKey ? { "x-portal-session": sessionKey } : {};
      const res = await fetch(`/api/portal/content?slug=${encodeURIComponent(editionSlug)}`, { headers, cache: "no-store" });
      const data = (await res.json()) as PortalContent & { error?: string };
      if (!res.ok) throw new Error(data.error ?? "CONTENT_FAILED");
      return data;
    },
    [editionSlug],
  );

  const bootstrap = useCallback(async () => {
    try {
      // 1) URL magic token — otomatik AUTH girişi (?portal=slug&t=pt_...)
      if (magicToken) {
        try {
          const acc = await apiSend<{ sessionKey: string; kind: "GUEST" | "AUTH" }>("/api/portal/access", "POST", {
            editionSlug,
            mode: "TOKEN",
            token: magicToken,
          });
          storeSession(editionSlug, acc.sessionKey);
          sessionRef.current = acc.sessionKey;
          setKind(acc.kind);
          // token'ı URL'den sil — paylaşımda/refresh'te sızmasın
          window.history.replaceState({}, "", `/?portal=${encodeURIComponent(editionSlug)}`);
        } catch {
          /* geçersiz token → normal giriş ekranına düş */
        }
      }
      // 2) saklı oturum doğrulaması
      let sessionKey = sessionRef.current ?? loadStoredSession(editionSlug);
      if (sessionKey) {
        try {
          const st = await apiGet<{ valid: boolean; kind?: "GUEST" | "AUTH" }>("/api/portal/access", {
            headers: { "x-portal-session": sessionKey },
          });
          if (!st.valid) {
            clearSession(editionSlug);
            sessionKey = null;
          } else {
            setKind(st.kind ?? "GUEST");
          }
        } catch {
          sessionKey = null;
        }
      }
      sessionRef.current = sessionKey;
      // 3) içerik
      const data = await fetchContent(sessionKey);
      setContent(data);
      if (data.announcements?.length) setLiveAnnouncements(data.announcements); // anlık bildirim merkezi tohumu
      setSessionKey(sessionKey); // await sonrası — senkron setState yok
      if (data.phase === "ACTIVE" && sessionKey) {
        setPhase("ACTIVE");
        void portalSend("/api/portal/interact", { action: "VISIT" }, sessionKey).catch(() => undefined);
      } else if (data.phase === "ACTIVE") {
        // oturum yok ama portal aktif → giriş ekranı
        setPhase("LOGIN");
      } else if (data.phase === "DISABLED") {
        setPhase("DISABLED");
      } else {
        setPhase("LOGIN");
      }
    } catch (e) {
      setFatal(e instanceof Error ? e.message : "PORTAL_LOAD_FAILED");
      setPhase("ERROR");
    }
  }, [editionSlug, magicToken, fetchContent]);

  useEffect(() => {
    // bootstrap asenkron akıştır — microtask'ta başlat (senkron setState yok)
    void Promise.resolve().then(() => bootstrap());
  }, []);

  // okunmadı taban çizgisi — localStorage'dan (N-06: render-fazında tazele).
  const [readFor, setReadFor] = useState(editionSlug);
  if (readFor !== editionSlug) {
    setReadFor(editionSlug);
    setLastReadMs(loadNotifReadMs(editionSlug));
  }

  // bildirim merkezinde okundu işaretleme — KAPANIŞTA (okurken okunmadı noktası görünür kalır)
  const markAnnouncementsRead = useCallback(() => {
    const newest = liveAnnouncements[0]?.createdAt;
    if (!newest) return;
    const ms = new Date(newest).getTime();
    if (ms > lastReadMs) {
      saveNotifReadMs(editionSlug, ms);
      setLastReadMs(ms);
    }
  }, [liveAnnouncements, lastReadMs, editionSlug]);
  const unreadNotifCount = useMemo(
    () => liveAnnouncements.filter((a) => new Date(a.createdAt).getTime() > lastReadMs).length,
    [liveAnnouncements, lastReadMs],
  );

  const cfg = content?.config;

  // ── PWA: service worker + install prompt (tek kaynak: usePWAInstall) ──
  const { canInstall, promptInstall } = usePWAInstall();
  // CRON-8: yeni SW sürümü "installed" durumunda beklerken kullanıcıya toast göster
  const [swUpdateReady, setSwUpdateReady] = useState(false);
  const swRegRef = useRef<ServiceWorkerRegistration | null>(null);
  useEffect(() => {
    if (phase !== "ACTIVE") return;
    if (cfg?.pwaEnabled && "serviceWorker" in navigator) {
      let visHandler: (() => void) | null = null;
      navigator.serviceWorker
        .register("/sw.js")
        .then((reg) => {
          swRegRef.current = reg;
          // çalışan bir SW varken yeni sürüm kurulursa güncelleme hazır demektir
          // (ilk kurulumda controller yok → toast gösterilmez)
          reg.addEventListener("updatefound", () => {
            const nw = reg.installing;
            if (!nw) return;
            nw.addEventListener("statechange", () => {
              if (nw.state === "installed" && navigator.serviceWorker.controller) {
                setSwUpdateReady(true);
              }
            });
          });
          // uzun ömürlü seanslar: sekmeye dönüşte sessiz güncelleme kontrolü
          visHandler = () => {
            if (document.visibilityState === "visible") reg.update().catch(() => undefined);
          };
          document.addEventListener("visibilitychange", visHandler);
        })
        .catch(() => undefined);
      return () => {
        if (visHandler) document.removeEventListener("visibilitychange", visHandler);
      };
    }
  }, [phase, cfg?.pwaEnabled]);

  // CRON-8: bekleyen SW'yi devreye al → controllerchange → tek seferlik reload
  const applySwUpdate = useCallback(() => {
    const waiting = swRegRef.current?.waiting;
    if (!waiting) {
      window.location.reload();
      return;
    }
    navigator.serviceWorker.addEventListener("controllerchange", () => window.location.reload(), { once: true });
    waiting.postMessage("SKIP_WAITING");
  }, []);
  useEffect(() => {
    if (!swUpdateReady) return;
    toast({
      title: t("portalApp.swUpdate.title"),
      description: t("portalApp.swUpdate.desc"),
      duration: Infinity,
      action: (
        <ToastAction altText={t("portalApp.swUpdate.reloadA11y")} onClick={applySwUpdate}>
          {t("portalApp.swUpdate.reload")}
        </ToastAction>
      ),
    });
  }, [swUpdateReady, applySwUpdate, toast]);

  // ── PWA: kurulum — sonuç (accepted/dismissed) beklenir; vazgeçmede sessiz çıkılır ──
  const installApp = async () => {
    const accepted = await promptInstall();
    if (!accepted) return;
    haptic.success();
    try {
      await portalSend("/api/portal/interact", { action: "PWA_INSTALL" }, sessionKey);
    } catch {
      /* analitik fire-and-forget */
    }
    toast({ title: t("portalApp.install.doneTitle"), description: t("portalApp.install.doneDesc") });
  };

  // ── canlı duyuru akışı (§5.4) — 20 sn polling ──
  const lastPollRef = useRef<string>(new Date().toISOString());
  useEffect(() => {
    if (phase !== "ACTIVE" || !sessionRef.current) return;
    const poll = async () => {
      try {
        const res = await apiGet<{ items: Announcement[] }>("/api/portal/announcements", {
          headers: { "x-portal-session": sessionRef.current! },
        });
        setLiveAnnouncements(res.items); // bildirim merkezi listesi (son 10)
        const fresh = res.items.filter((a) => new Date(a.createdAt).getTime() > new Date(lastPollRef.current).getTime());
        if (res.items.length > 0) {
          lastPollRef.current = res.items[0].createdAt;
        }
        for (const a of fresh.reverse()) {
          toast({ title: a.title, description: a.message });
          if (typeof Notification !== "undefined" && Notification.permission === "granted") {
            try {
              new Notification(a.title, { body: a.message, icon: "/portal-icon-192.png" });
            } catch {
              /* yoksay */
            }
          }
        }
      } catch {
        /* sessiz — polling */
      }
    };
    void poll();
    const id = setInterval(poll, 20_000);
    return () => clearInterval(id);
  }, [phase, toast]);

  // ── hatırlatıcı motoru (§4.2): B2B randevuları + işaretli oturumlar ──
  useEffect(() => {
    if (phase !== "ACTIVE" || !cfg?.notifications?.enabled || !content) return;
    const offsets = cfg.notifications.offsets.length ? cfg.notifications.offsets : [60, 30, 10];
    const tick = () => {
      const now = Date.now();
      const fired = loadFired(editionSlug);
      const targets: MarkedReminder[] = [];
      // B2B randevuları (AUTH)
      for (const m of content.b2b ?? []) {
        if (!m.startsAt || m.status === "DECLINED" || m.status === "CANCELLED") continue;
        const at = new Date(m.startsAt).getTime();
        if (at <= now) continue;
        targets.push({
          key: `b2b:${m.assignmentId}`,
          fireAt: at,
          title: t("portalApp.reminder.b2bTitle"),
          body: `${m.subject} — ${fmtDateTime(m.startsAt)}`,
        });
      }
      // takvime eklenen (hatırlatması işaretlenen) oturumlar
      for (const r of loadReminders(editionSlug)) targets.push(r);
      for (const target of targets) {
        for (const off of offsets) {
          const fireAt = target.fireAt - off * 60_000;
          const key = `${target.key}@${off}`;
          if (now >= fireAt && now - fireAt < 10 * 60_000 && !fired.has(key)) {
            fired.add(key);
            const body = off >= 60 ? `${t("portalApp.reminder.in")} ${Math.round(off / 60)} ${t("portalApp.reminder.hours")}: ${target.body}` : `${t("portalApp.reminder.in")} ${off} ${t("portalApp.reminder.minutes")}: ${target.body}`;
            toast({ title: target.title, description: body });
            if (typeof Notification !== "undefined" && Notification.permission === "granted") {
              try {
                new Notification(target.title, { body, icon: "/portal-icon-192.png" });
              } catch {
                /* yoksay */
              }
            }
          }
        }
      }
      saveFired(editionSlug, fired);
    };
    void tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, [phase, cfg?.notifications?.enabled, content, editionSlug, toast, t]);

  // ekranı bozmadan içeriği tazele (Q&A gönderimi sonrası vb.)
  const refreshContent = useCallback(async () => {
    try {
      const data = await fetchContent(sessionRef.current);
      setContent(data);
    } catch {
      /* sessiz — mevcut içerik kalır */
    }
  }, [fetchContent]);

  // ── oyunlaştırma durumu — görev/liderlik; level atlama → konfeti (kullanıcı isteği) ──
  const [gameData, setGameData] = useState<GameData | null>(null);
  const [confettiKey, setConfettiKey] = useState(0);
  const prevLevelRef = useRef<string | null>(null);
  const fetchGame = useCallback(async () => {
    if (!sessionRef.current) return;
    try {
      const d = (await apiGet<GameData>("/api/portal/game", { headers: { "x-portal-session": sessionRef.current } })) as GameData;
      if (!d.enabled) {
        setGameData(null);
        return;
      }
      setGameData((prev) => {
        if (prev && prev.points > 0 && d.points > prev.points && prev.level !== d.level) {
          setConfettiKey((k) => k + 1);
        }
        return d;
      });
      if (prevLevelRef.current && d.level !== prevLevelRef.current && d.points > 0) {
        toast({ title: t("portalApp.game.levelUp"), description: t("portalApp.game.levelUpDesc", { level: d.level }) });
      }
      prevLevelRef.current = d.level;
    } catch {
      /* sessiz — oyun verisi opsiyonel */
    }
  }, [toast, t]);
  useEffect(() => {
    if (phase !== "ACTIVE" || !sessionRef.current) return;
    let alive = true;
    void Promise.resolve().then(async () => {
      if (!sessionRef.current) return;
      try {
        const d = (await apiGet<GameData>("/api/portal/game", { headers: { "x-portal-session": sessionRef.current } })) as GameData;
        if (!alive) return;
        if (!d.enabled) {
          if (alive) setGameData(null);
          return;
        }
        if (alive) setGameData(d);
      } catch {
        /* sessiz — oyun verisi opsiyonel */
      }
    });
    return () => {
      alive = false;
    };
  }, [phase, sessionKey]);

  // form gönderimi → puan (FORM_SUBMIT — sunucu form bağlantısını doğrular)
  const onPortalFormSubmitted = useCallback(
    (formIdOrSlug: string) => {
      void (async () => {
        try {
          const r = (await portalSend("/api/portal/interact", { action: "FORM_SUBMIT", formId: formIdOrSlug }, sessionRef.current)) as { game?: { awarded: number } | null };
          if (r?.game?.awarded && r.game.awarded > 0) {
            toast({ title: t("portalApp.game.pointsWon"), description: t("portalApp.game.pointsWonDesc", { points: r.game.awarded }) });
          }
          void fetchGame();
        } catch {
          /* puan opsiyonel — form akışını bozmaz */
        }
      })();
    },
    [fetchGame, toast, t],
  );

  // Google Fonts yükleme — seçili font gf-* ise CDN link enjeksiyonu (idempotent)
  const gfKey = content?.config?.design?.fontFamily ?? null;
  useEffect(() => {
    if (gfKey && gfKey.startsWith("gf-")) loadGoogleFont(gfKey);
  }, [gfKey]);

  // dinamik theme-color — mobil tarayıcı çubuğu portal aksanıyla boyanır (app hissi)
  useEffect(() => {
    if (phase !== "ACTIVE") return;
    const c = content?.config?.themeColor ?? content?.edition.portalHeaderAccent ?? "#0d9488";
    let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    if (!meta) {
      meta = document.createElement("meta");
      meta.name = "theme-color";
      document.head.appendChild(meta);
    }
    meta.content = c;
  }, [phase, content?.config?.themeColor, content?.edition.portalHeaderAccent]);

  // PWA: etkinliğe özel manifest — kurulan uygulama DOĞRU edisyonu açar
  // (statik manifest start_url="/" personel kabuğuna düşerdi — denetim PWA-1).
  // Tek <link rel="manifest"> mutate edilir; tarayıcı href değişiminde yeniden okur.
  useEffect(() => {
    if (phase !== "ACTIVE" || !content) return;
    const href = `/api/portal/manifest?slug=${encodeURIComponent(editionSlug)}`;
    let link = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
    if (!link) {
      link = document.createElement("link");
      link.rel = "manifest";
      document.head.appendChild(link);
    }
    if (link.getAttribute("href") !== href) link.setAttribute("href", href);
  }, [phase, editionSlug, content]);

  const openForm = async (formIdOrSlug: string | null) => {
    if (!formIdOrSlug) return;
    try {
      void portalSend("/api/portal/interact", { action: "FORM_OPEN" }, sessionKey);
    } catch {
      /* fire-and-forget */
    }
    // Kullanıcı isteği: "Formlar acılınca header ve footer kayboluyor Kaybolmasın."
    // → form artık portal İÇİNDE ekran olarak açılır (?form= tam-sayfa yerine)
    setFormRef(formIdOrSlug);
    setNav((prev) => pushNav(prev, "form"));
    mirrorHistory("form", "push");
    window.scrollTo({ top: 0 });
  };

  // N-06: derleyici el-memoizasyonunu koruyamıyor — düz fonksiyon (taban şekli)
  const trackClick = (widgetKey: string) => {
    void portalSend("/api/portal/interact", { action: "WIDGET_CLICK", widgetKey }, sessionKey).catch(() => undefined);
  };

  // history aynası — sistem geri/ileri tuşunun yığını takip etmesi için (#p=<ekran>)
  const mirrorHistory = useCallback((s: string, mode: "push" | "replace") => {
    try {
      const url = `${window.location.pathname}${window.location.search}${navHash(s)}`;
      if (mode === "push") window.history.pushState({ portal: s }, "", url);
      else window.history.replaceState({ portal: s }, "", url);
    } catch {
      /* file:// vb. uç durumlar — yığın yine çalışır */
    }
  }, []);

  // ileri gezinme (widget/kart/CTA) — yığına push'lar
  const gotoScreen = useCallback((s: string) => {
    haptic.selection();
    trackClick(s);
    setNav((prev) => pushNav(prev, s));
    mirrorHistory(s, "push");
    window.scrollTo({ top: 0 });
  }, [trackClick, mirrorHistory]);

  // GERİ — her ekranın geri oku + swipe + (popstate üzerinden) sistem tuşu buraya düşer
  const goBack = useCallback(() => {
    if (subBackRef.current?.()) { haptic.selection(); return; } // açık detay kapandı
    if (nav.length <= 1) {
      if (screen === PORTAL_NAV_ROOT) return; // kök (home) — geri yok
      // sekme kökü (örn. [program]): mantıksal "önceki sayfa" home'dur
      haptic.selection();
      setNav(resetNav(PORTAL_NAV_ROOT));
      mirrorHistory(PORTAL_NAV_ROOT, "replace");
      window.scrollTo({ top: 0 });
      return;
    }
    const next = popNav(nav);
    const target = next[next.length - 1] ?? PORTAL_NAV_ROOT;
    haptic.selection();
    setNav(next);
    mirrorHistory(target, "replace");
    window.scrollTo({ top: 0 });
  }, [nav, screen, mirrorHistory]);

  // sekme değişimi (alt menü) — native davranış: yığın sıfırlanır
  const resetTab = useCallback((s: string) => {
    haptic.selection();
    if (s === screen && nav.length === 1) { window.scrollTo({ top: 0 }); return; }
    trackClick(s);
    setNav(resetNav(s));
    mirrorHistory(s, "replace");
    window.scrollTo({ top: 0 });
  }, [screen, nav.length, trackClick, mirrorHistory]);

  useSwipeBack({ onSwipeBack: goBack, enabled: screen !== "home" });

  // sistem geri/ileri tuşu (Android gesture + tarayıcı) — yığınla eşitle
  useEffect(() => {
    if (phase !== "ACTIVE") return;
    mirrorHistory(screen, "replace"); // ilk girişi çapala (popstate eşitlemesi için)
    const onPop = (e: PopStateEvent) => {
      const target = (e.state as { portal?: unknown } | null)?.portal;
      if (typeof target !== "string") return; // portal öncesi sayfa — tarayıcıya bırak
      const dest = parseNavHash(window.location.hash)
        ?? (isPortalScreen(target) ? target : null)
        ?? (target === "form" && formRef ? "form" : null);
      if (!dest) return;
      setNav((prev) => syncNav(prev, dest));
      window.scrollTo({ top: 0 });
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [phase, mirrorHistory, formRef, screen]);

  // oturumu bırak ve giriş ekranına dön — B2B/Program kapasite kaydı gibi AUTH-gated
  // özelliklerin misafir kullanıcıya gösterdiği tek-tık CTA bunu kullanır
  const gotoLogin = () => {
    clearSession(editionSlug);
    sessionRef.current = null;
    setSessionKey(null);
    setKind(null);
    setNav(resetNav("home"));
    mirrorHistory("home", "replace");
    setPhase("LOGIN");
  };

  // ─── render dalları ───
  if (phase === "LOADING") {
    return (
      <div
        className="grid min-h-dvh place-items-center bg-gradient-to-b from-teal-50 via-background to-background"
        style={{ paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="flex flex-col items-center gap-5" role="status" aria-label={t("portalApp.loading")}>
          <img src="/portal-icon-192.png" alt="" className="size-20 rounded-[22px] shadow-lg motion-safe:animate-[portal-pop-in_0.4s_ease-out]" />
          <div className="h-1.5 w-28 overflow-hidden rounded-full bg-muted" aria-hidden>
            <div className="h-full w-1/2 rounded-full bg-teal-500 motion-safe:animate-[portal-splash-slide_1.1s_ease-in-out_infinite]" />
          </div>
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <Icons.Loader2 className="size-3.5 animate-spin" /> {t("portalApp.loading")}
          </p>
        </div>
      </div>
    );
  }

  if (phase === "ERROR") {
    return (
      <div
        className="grid min-h-dvh place-items-center bg-background p-6"
        style={{ paddingTop: "calc(env(safe-area-inset-top) + 24px)", paddingBottom: "calc(env(safe-area-inset-bottom) + 24px)" }}
      >
        <div className="max-w-sm text-center">
          <div className="mx-auto grid size-12 place-items-center rounded-full bg-red-50 text-red-600">
            <Icons.AlertTriangle className="size-6" />
          </div>
          <h1 className="mt-3 text-lg font-semibold">{t("portalApp.error.title")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {fatal === "CONTENT_FAILED"
              ? t("portalApp.error.content")
              : fatal === "PORTAL_LOAD_FAILED"
                ? t("portalApp.error.title")
                : fatal}
          </p>
          <Button
            className="mt-4"
            onClick={() => {
              setPhase("LOADING");
              void bootstrap();
            }}
          >
            <Icons.RotateCcw className="size-4" /> {t("portalApp.error.retry")}
          </Button>
        </div>
      </div>
    );
  }

  if (phase === "DISABLED" && content) {
    return <DisabledScreen content={content} />;
  }

  if (phase === "LOGIN" && content) {
    return (
      <LoginScreen
        content={content}
        editionSlug={editionSlug}
        onAuthenticated={(newKey, newKind) => {
          storeSession(editionSlug, newKey);
          sessionRef.current = newKey;
          setSessionKey(newKey);
          setKind(newKind);
          void bootstrap();
        }}
        onOpenForm={openForm}
      />
    );
  }

  if (phase !== "ACTIVE" || !content || !cfg) return null;

  const accent = cfg.themeColor ?? content.edition.portalHeaderAccent ?? "#0d9488";
  const design = cfg.design ?? null;
  // oyunlaştırma widget'ı — yalnız gameEnabled açıkken panelde göster
  const visibleWidgets = cfg.widgets.filter((w) => w.key !== "game" || cfg.game?.enabled);
  const iconOverrides = design?.iconOverrides ?? {};
  // ── ekran üst-bant görünürlüğü (kullanıcı isteği): Maven üst bandı varsayılan yalnız
  // anasayfada; etkinlik başlığı her ekranda. Admin her ekran için custom karar verebilir
  // (chromeJson — Portal Ayarları → Ekran Üst Bantları matrisi).
  const chromeCfg = cfg.chrome ?? null;
  const showTopHeader = chromeCfg?.topHeader ? (chromeCfg.topHeader[screen] ?? (screen === "home")) : screen === "home";
  const showEventBar = chromeCfg?.eventBar ? (chromeCfg.eventBar[screen] ?? true) : true;
  // alt menü konum düzeni — admin kanvas grid sırası (varsayılan: home, program, sponsors, map, profile)
  const navOrder = (k: string) => design?.iconLayout?.[k] ?? { home: 0, program: 1, sponsors: 2, map: 3, profile: 4 }[k] ?? 9;
  const navItems: { key: string; label: string; icon: typeof Icons.Home }[] = [
    { key: "home", label: t("portalApp.nav.home"), icon: Icons.Home },
    ...(cfg.bottomNav.program !== false ? [{ key: "program", label: t("portalApp.nav.program"), icon: Icons.CalendarDays }] : []),
    ...(cfg.bottomNav.sponsors !== false ? [{ key: "sponsors", label: t("portalApp.nav.sponsors"), icon: Icons.Handshake }] : []),
    ...(cfg.bottomNav.map !== false && cfg.venueMap.enabled ? [{ key: "map", label: t("portalApp.nav.map"), icon: Icons.Map }] : []),
    { key: "profile", label: t("portalApp.nav.profile"), icon: Icons.UserRound },
  ].sort((a, b) => navOrder(a.key) - navOrder(b.key));
  const sponsor = cfg.portalSponsor ?? null;
  // "neredeyim" deseni — kompakt barda ekran başlığı (ScreenShell başlıklarıyla BİREBİR aynı anahtarlar)
  const screenBarTitle = (s: string): string => {
    switch (s) {
      case "program": return t("portalApp.program.title");
      case "speakers": return t("portalApp.speakers.title");
      case "sponsors": return t("portalApp.sponsors.title");
      case "map": return t("portalApp.map.title");
      case "qa": return t("portalApp.qa.title");
      case "forms": return t("portalApp.forms.title");
      case "form": return t("portalApp.form.title");
      case "b2b": return t("portalApp.b2b.title");
      case "game": return t("portalApp.game.title");
      case "profile": return t("portalApp.profile.title");
      default: return "";
    }
  };
  // diğer etkinlikler: yaklaşanlar önce (en-yakın tarih üstte), geçmişler en sonda (en-yeni geçmiş önce)
  const nowMs = Date.now();
  const otherEventsSorted = [...(content.otherEvents ?? [])].sort((a, b) => {
    const ta = a.startDate ? new Date(a.startDate).getTime() : Number.MAX_SAFE_INTEGER;
    const tb = b.startDate ? new Date(b.startDate).getTime() : Number.MAX_SAFE_INTEGER;
    const ua = ta >= nowMs;
    const ub = tb >= nowMs;
    if (ua !== ub) return ua ? -1 : 1;
    return ua ? ta - tb : tb - ta;
  });
  const isPastEvent = (e: { startDate: string | null }) => (e.startDate ? new Date(e.startDate).getTime() < nowMs : false);
  const headerBgStyle = {
    backgroundColor: design?.headerBgColor || undefined,
    backgroundImage: design?.headerBgImage ? `url(${design.headerBgImage})` : undefined,
    backgroundSize: "cover",
    backgroundPosition: "center",
  } as const;
  const contentBgStyle = {
    backgroundColor: design?.contentBgColor || undefined,
    backgroundImage: design?.contentBgImage ? `url(${design.contentBgImage})` : undefined,
    backgroundSize: "cover",
    backgroundPosition: "center",
  } as const;
  const footerBgStyle = {
    backgroundColor: design?.footerBgColor || undefined,
    backgroundImage: design?.footerBgImage ? `url(${design.footerBgImage})` : undefined,
    backgroundSize: "cover",
    backgroundPosition: "center",
  } as const;

  return (
    <div
      className="flex min-h-screen flex-col bg-muted/40"
      style={{
        ["--portal-accent" as string]: accent,
        fontFamily: design?.fontFamily && design.fontFamily !== "system" ? PORTAL_FONT_STACKS(design.fontFamily) : undefined,
        fontSize: design?.fontScale && design.fontScale !== 100 ? `${16 * (design.fontScale / 100)}px` : undefined,
        WebkitTapHighlightColor: "transparent", // native app hissi — dokunma vurgusu yok
        paddingTop: "env(safe-area-inset-top)", // CRON-8: çentik/çentik güvenli üst boşluk (standalone PWA)
        ...contentBgStyle,
      }}
    >
      {/* ── Top Header (§3.1): organizatör + diğer etkinlikler carousel ──
          Görünürlük: varsayılan yalnız ANASAYFA; admin her ekran için custom karar verir */}
      {showTopHeader && (
      <div className="border-b bg-background" style={headerBgStyle}>
        <div className="mx-auto w-full max-w-2xl px-4 pt-3">
          <div className="flex items-center gap-2">
            {content.tenant.logoUrl ? (
              <img src={content.tenant.logoUrl} alt={content.tenant.name} className="size-6 rounded-md object-contain" />
            ) : (
              <Icons.Building2 className="size-4 text-muted-foreground" />
            )}
            <span className="truncate text-xs font-medium text-muted-foreground">{content.tenant.name}</span>
            <div className="ml-auto flex items-center gap-1.5">
              <NotifBellButton unread={unreadNotifCount} accent={accent} onClick={() => setNotifOpen(true)} label={t("portalApp.notifCenter.ariaOpen")} />
              <span className="rounded-full px-2 py-0.5 text-[10px] font-medium" style={{ backgroundColor: `${accent}1a`, color: accent }}>
                {kind === "AUTH" ? t("portalApp.badge.auth") : t("portalApp.badge.guest")}
              </span>
            </div>
          </div>
          {otherEventsSorted.length > 0 && (
            <div className="maven-scroll -mx-4 mt-2 flex gap-2 overflow-x-auto px-4 pb-2" role="list" aria-label={t("portalApp.otherEvents")}>
              {otherEventsSorted.map((e) => {
                const past = isPastEvent(e);
                return (
                <a key={e.id} href={`?portal=${encodeURIComponent(e.slug)}`} className={`w-44 shrink-0 rounded-lg border bg-muted/30 p-2 transition-colors hover:border-primary/40 hover:bg-muted/60${past ? " opacity-70" : ""}`} role="listitem" aria-label={e.name}>
                  <div className="flex items-center gap-1.5">
                    {e.logoUrl ? (
                      <img src={e.logoUrl} alt="" className="size-5 rounded object-contain" />
                    ) : (
                      <Icons.CalendarRange className="size-3.5 text-muted-foreground" />
                    )}
                    <span className="truncate text-[11px] font-medium">{e.name}</span>
                    {past && (
                      <span className="ml-auto shrink-0 rounded-full bg-muted px-1.5 py-px text-[9px] font-medium text-muted-foreground">
                        {t("portalApp.otherEventsPast")}
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 truncate text-[10px] text-muted-foreground">
                    {[e.city, e.startDate ? fmtDate(e.startDate) : null].filter(Boolean).join(" · ") || "—"}
                  </p>
                </a>
                );
              })}
            </div>
          )}
        </div>
      </div>
      )}

      {/* ── Event Header (§3.1) — ANASAYFA hero: baner tam-bleed, yoksa aksan bandı.
          Admin özel başlık arka planı varsa eski kart düzeni korunur (okunabilirlik). ── */}
      {showEventBar && screen === "home" && (design?.headerBgColor || design?.headerBgImage ? (
        <header className="px-4 pt-3">
          <div className="overflow-hidden rounded-2xl border bg-background shadow-sm" style={headerBgStyle}>
            {content.edition.headerImageUrl && (
              <div className="relative h-32 sm:h-40">
                <img src={content.edition.headerImageUrl} alt={`${content.edition.name} ${t("portalApp.bannerAlt")}`} className="absolute inset-0 size-full object-cover" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/55 via-black/10 to-transparent" />
              </div>
            )}
            <div className="flex items-center gap-3 p-3">
              <div className="grid size-14 shrink-0 place-items-center overflow-hidden rounded-xl border bg-white shadow-sm dark:bg-card">
                {content.edition.logoUrl ? (
                  <img src={content.edition.logoUrl} alt={`${content.edition.name} ${t("portalApp.logoAlt")}`} className="size-full object-contain p-1" />
                ) : (
                  <Icons.CalendarRange className="size-6" style={{ color: accent }} />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <h1 className="line-clamp-2 text-base font-bold leading-tight">
                  {content.edition.portalHeaderTitle || content.edition.name}
                </h1>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                  {[
                    content.edition.startDate ? fmtDate(content.edition.startDate) : null,
                    content.edition.city,
                    content.edition.venueName,
                  ]
                    .filter(Boolean)
                    .join(" · ") || content.edition.portalHeaderSubtitle || "—"}
                </p>
              </div>
            </div>
          </div>
        </header>
      ) : (
        <header className="relative overflow-hidden">
          {content.edition.headerImageUrl ? (
            <>
              <img src={content.edition.headerImageUrl} alt={`${content.edition.name} ${t("portalApp.bannerAlt")}`} className="absolute inset-0 size-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/25 to-transparent" />
            </>
          ) : (
            <div aria-hidden className="absolute inset-0" style={{ background: `linear-gradient(135deg, ${accent}, ${accent}b3)` }}>
              <div className="absolute -right-12 -top-20 size-56 rounded-full bg-white/10" />
              <div className="absolute -left-10 bottom-0 size-36 rounded-full bg-black/10" />
            </div>
          )}
          <div className="relative mx-auto flex w-full max-w-2xl items-center gap-3.5 px-4 pb-6 pt-9">
            <div className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-2xl border border-white/40 bg-white shadow-md">
              {content.edition.logoUrl ? (
                <img src={content.edition.logoUrl} alt={`${content.edition.name} ${t("portalApp.logoAlt")}`} className="size-full object-contain p-1.5" />
              ) : (
                <Icons.CalendarRange className="size-7" style={{ color: accent }} />
              )}
            </div>
            <div className="min-w-0 flex-1 text-white">
              <h1 className="line-clamp-2 text-xl font-extrabold leading-tight tracking-tight">
                {content.edition.portalHeaderTitle || content.edition.name}
              </h1>
              <p className="mt-1 truncate text-xs font-medium text-white/85">
                {[
                  content.edition.startDate ? fmtDate(content.edition.startDate) : null,
                  content.edition.city,
                  content.edition.venueName,
                ]
                  .filter(Boolean)
                  .join(" · ") || content.edition.portalHeaderSubtitle || "—"}
              </p>
            </div>
          </div>
        </header>
      ))}

      {/* ── ALT EKRANLAR: kompakt sabit (sticky) uygulama çubuğu — mobil app hissi; büyük
          banner + Maven bandı YOK (kullanıcı isteği: "Ana sayfa haricinde Maven ın üst bandı görünmesin") ── */}
      {showEventBar && screen !== "home" && (
        <div
          className="sticky z-30 border-b bg-background/90 backdrop-blur supports-[backdrop-filter]:bg-background/80"
          style={{ top: "env(safe-area-inset-top)", ...headerBgStyle }}
        >
          <div className="mx-auto flex h-12 w-full max-w-2xl items-center gap-2 px-4">
            <div className="grid size-7 shrink-0 place-items-center overflow-hidden rounded-md border bg-white dark:bg-card">
              {content.edition.logoUrl ? (
                <img src={content.edition.logoUrl} alt="" className="size-full object-contain p-0.5" />
              ) : (
                <Icons.CalendarRange className="size-3.5" style={{ color: accent }} />
              )}
            </div>
            {/* "neredeyim": üst satır etkinlik bağlamı, alt satır kalın ekran başlığı */}
            <div className="min-w-0 flex-1 leading-tight">
              <p className="truncate text-[10px] text-muted-foreground">{content.edition.portalHeaderTitle || content.edition.name}</p>
              <p className="truncate text-xs font-semibold">{screenBarTitle(screen)}</p>
            </div>
            <NotifBellButton unread={unreadNotifCount} accent={accent} onClick={() => setNotifOpen(true)} label={t("portalApp.notifCenter.ariaOpen")} />
            <span className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium" style={{ backgroundColor: `${accent}1a`, color: accent }}>
              {kind === "AUTH" ? t("portalApp.badge.auth") : t("portalApp.badge.guest")}
            </span>
          </div>
        </div>
      )}

      {/* ── ana içerik (§3.2-§3.4 + §4) — ekran geçiş animasyonu (mobil app hissi) ── */}
      <main
        className="mx-auto w-full max-w-2xl flex-1 px-4 pb-24 pt-3"
        style={{ paddingBottom: `calc(env(safe-area-inset-bottom) + ${sponsor?.logoUrl || sponsor?.name ? 132 : 96}px)` }}
      >
        <div key={screen} className="animate-[portal-screen-in_0.22s_ease-out]">
        {screen === "home" && (
          <HomeScreen
            content={content}
            editionSlug={editionSlug}
            kind={kind}
            accent={accent}
            iconOverrides={iconOverrides}
            gameData={gameData}
            canInstall={canInstall}
            onInstall={() => void installApp()}
            onNavigate={gotoScreen}
            onOpenForm={openForm}
          />
        )}
        {screen === "program" && <ProgramScreen content={content} onBack={goBack} sessionKey={sessionKey} accent={accent} onGotoLogin={gotoLogin} />}
        {screen === "speakers" && <SpeakersScreen content={content} onBack={goBack} onRegisterSubBack={registerSubBack} />}
        {screen === "sponsors" && <SponsorsScreen content={content} onBack={goBack} onRegisterSubBack={registerSubBack} />}
        {screen === "map" && <VenueMapScreen content={content} onBack={goBack} />}
        {screen === "qa" && <QaScreen content={content} sessionKey={sessionKey} onBack={goBack} onSubmitted={() => void refreshContent()} onGameRefresh={() => void fetchGame()} />}
        {screen === "forms" && <FormsScreen content={content} gameData={gameData} accent={accent} onBack={goBack} onOpenForm={openForm} />}
        {screen === "form" && (
          <FormScreen
            content={content}
            formRef={formRef}
            onBack={goBack}
            onSubmitted={formRef ? () => onPortalFormSubmitted(formRef) : undefined}
          />
        )}
        {screen === "game" && (
          <GameScreen
            data={gameData}
            accent={accent}
            confettiKey={confettiKey}
            onBack={goBack}
            onRefresh={() => void fetchGame()}
            onOpenForm={openForm}
            onNavigate={gotoScreen}
          />
        )}
        {screen === "b2b" && <B2bScreen content={content} sessionKey={sessionKey} onBack={goBack} onChanged={() => { void bootstrap(); void fetchGame(); }} onGotoLogin={gotoLogin} />}
        {screen === "profile" && (
          <ProfileScreen
            content={content}
            kind={kind}
            accent={accent}
            onBack={goBack}
            onLogout={() => {
              clearSession(editionSlug);
              sessionRef.current = null;
              setSessionKey(null);
              setKind(null);
              setNav(resetNav("home"));
              mirrorHistory("home", "replace");
              void bootstrap();
            }}
            onNavigate={gotoScreen}
            onOpenForm={openForm}
            onGotoLogin={gotoLogin}
            canInstall={canInstall}
            onInstall={() => void installApp()}
          />
        )}
        </div>
      </main>

      {/* ── Mobil Portal Sponsoru şeridi (§5.2+) — sponsor logo alanı ── */}
      {(sponsor?.logoUrl || sponsor?.name) && (
        <div
          className="fixed inset-x-0 z-40 flex h-9 items-center justify-end gap-2 border-t bg-background/95 px-3 backdrop-blur"
          style={{ bottom: "calc(env(safe-area-inset-bottom) + 56px)", ...footerBgStyle }}
        >
          <span className="text-[10px] font-medium text-muted-foreground">{t("portalApp.design.sponsorLabel")}</span>
          {sponsor.logoUrl ? (
            <img src={sponsor.logoUrl} alt={sponsor.name ?? ""} className="h-5 w-auto max-w-28 object-contain" />
          ) : (
            <Icons.BadgeCheck className="size-4" style={{ color: accent }} />
          )}
          {sponsor.name && <span className="truncate text-[11px] font-semibold">{sponsor.name}</span>}
          {sponsor.url ? (
            <a href={sponsor.url} target="_blank" rel="noopener noreferrer" className="ml-1 shrink-0 text-[10px] underline decoration-dotted" style={{ color: accent }}>
              {t("portalApp.design.sponsorVisit")}
            </a>
          ) : null}
        </div>
      )}

      {/* ── Sabit Alt Menü (§3.3) ── */}
      <nav
        className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80"
        style={{ paddingBottom: "env(safe-area-inset-bottom)", ...footerBgStyle }}
        aria-label={t("portalApp.nav.aria")}
      >
        <div className="mx-auto flex w-full max-w-2xl">
          {navItems.map((n) => {
            const o = iconOverrides[n.key];
            const active = screen === n.key || (n.key === "home" && ["speakers", "qa", "forms", "form", "b2b", "game"].includes(screen));
            return (
              <button
                key={n.key}
                onClick={() => resetTab(n.key)}
                className={cn(
                  "flex flex-1 flex-col items-center justify-center gap-0.5 py-1.5 text-[10px] font-medium transition-[color,background-color,transform] active:scale-95 min-h-[52px]",
                  !active && "text-muted-foreground hover:text-foreground",
                )}
                style={{ color: active ? accent : undefined }}
                aria-current={active ? "page" : undefined}
              >
                {/* aktif-sekme pill'i — native uygulama hissi (kullanıcı isteği: mobil app feel) */}
                <span
                  className={cn("grid size-9 place-items-center rounded-full transition-[transform,background-color]", active ? "scale-105" : "scale-100")}
                  style={active && !o?.svg ? { backgroundColor: `${accent}1f` } : undefined}
                >
                  {o?.svg ? (
                    <img src={o.svg} alt="" className="object-contain" style={{ width: 20, height: 20, opacity: active ? 1 : 0.72 }} />
                  ) : (
                    (() => {
                      const O = o?.icon ? resolvePortalIcon(o.icon) : null;
                      const I = O ?? n.icon;
                      return <I className={cn("size-5", active && "stroke-[2.4]")} style={{ color: active ? accent : (o?.color || undefined) }} />;
                    })()
                  )}
                </span>
                <span className={cn(active && "font-semibold")}>{n.label}</span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* ── Hafif Bildirim Merkezi (CRON-4) — duyuru geçmişi + yaklaşan hatırlatıcılar ── */}
      <NotificationCenterSheet
        open={notifOpen}
        onOpenChange={(o) => {
          setNotifOpen(o);
          if (!o) markAnnouncementsRead(); // kapanışta okundu — okurken noktalar görünür kalır
        }}
        announcements={liveAnnouncements}
        content={content}
        editionSlug={editionSlug}
        offsets={cfg?.notifications?.offsets?.length ? cfg.notifications.offsets : [60, 30, 10]}
        notificationsEnabled={Boolean(cfg?.notifications?.enabled)}
        accent={accent}
        lastReadMs={lastReadMs}
      />
    </div>
  );
}

// ─── PASİF PORTAL: bakım / geri sayım (§5.1) ────────────────────────────────
function DisabledScreen({ content }: { content: PortalContent }) {
  const { t } = useLang();
  const [left, setLeft] = useState<string>("");
  useEffect(() => {
    if (!content.countdownTo) return;
    const tick = () => {
      const diff = new Date(content.countdownTo!).getTime() - Date.now();
      if (diff <= 0) {
        setLeft(t("portalApp.countdown.started"));
        return;
      }
      const d = Math.floor(diff / 86_400_000);
      const h = Math.floor((diff % 86_400_000) / 3_600_000);
      const m = Math.floor((diff % 3_600_000) / 60_000);
      const s = Math.floor((diff % 60_000) / 1000);
      setLeft(`${d > 0 ? `${d}${t("portalApp.countdown.dayUnit")} ` : ""}${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`);
    };
    void tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [content.countdownTo, t]);

  return (
    <div className="grid min-h-screen place-items-center bg-gradient-to-b from-teal-50 to-background p-6">
      <div className="w-full max-w-sm text-center">
        {content.edition.logoUrl ? (
          <img src={content.edition.logoUrl} alt="" className="mx-auto size-16 rounded-2xl border bg-white object-contain p-1.5 shadow-sm" />
        ) : (
          <div className="mx-auto grid size-16 place-items-center rounded-2xl bg-teal-600 text-white shadow-sm">
            <Icons.CalendarRange className="size-7" />
          </div>
        )}
        <h1 className="mt-4 text-lg font-bold">{content.edition.name}</h1>
        {content.countdownTo ? (
          <>
            <p className="mt-1 text-sm text-muted-foreground">{t("portalApp.countdown.desc")}</p>
            <div className="mt-4 rounded-xl border bg-white p-4 font-mono text-2xl font-bold tabular-nums text-teal-700 shadow-sm dark:bg-card" aria-live="polite">
              {left || "--:--:--"}
            </div>
          </>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">{content.maintenanceMessage || t("portalApp.countdown.maintenance")}</p>
        )}
        <p className="mt-6 text-[11px] text-muted-foreground">{content.tenant.name}</p>
      </div>
    </div>
  );
}

// ─── GİRİŞ EKRANI (§2 + Profil mantığı) ─────────────────────────────────────
function LoginScreen({
  content,
  editionSlug,
  onAuthenticated,
  onOpenForm,
}: {
  content: PortalContent;
  editionSlug: string;
  onAuthenticated: (sessionKey: string, kind: "GUEST" | "AUTH") => void;
  onOpenForm: (id: string | null) => void;
}) {
  const { t } = useLang();
  const { toast } = useToast();
  const [mode, setMode] = useState<"CODE" | "EMAIL">("CODE");
  const [code, setCode] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const opts = content.loginOptions ?? { codeLogin: true, emailLogin: true, allowRegistrationRedirect: true, registrationFormId: null };

  const submit = async () => {
    setBusy(true);
    try {
      const acc = await apiSend<{ sessionKey: string; kind: "GUEST" | "AUTH" }>("/api/portal/access", "POST", {
        editionSlug,
        mode,
        code: code.trim(),
        email: email.trim(),
      });
      onAuthenticated(acc.sessionKey, acc.kind);
    } catch (e) {
      toast({ title: t("portalApp.login.fail"), description: e instanceof Error ? e.message : undefined, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  // tasarım uygulaması — giriş ekranı da admin marka ayarlarını izler (§5.2+)
  const dsg = content.config?.design ?? null;
  const sp = content.config?.portalSponsor ?? null;
  const accent = content.config?.themeColor ?? content.edition.portalHeaderAccent ?? "#0d9488";
  const dateCity = [content.edition.startDate ? fmtDate(content.edition.startDate) : null, content.edition.city].filter(Boolean);
  const submitDisabled = busy || !code.trim() || (mode === "EMAIL" && !email.trim());
  const switchMode = (m: "CODE" | "EMAIL") => {
    if (m === mode) return;
    haptic.selection();
    setMode(m);
  };
  return (
    <div
      className="flex min-h-dvh flex-col bg-gradient-to-b from-teal-50 to-background"
      style={{
        fontFamily: dsg?.fontFamily && dsg.fontFamily !== "system" ? PORTAL_FONT_STACKS(dsg.fontFamily) : undefined,
        fontSize: dsg?.fontScale && dsg.fontScale !== 100 ? `${16 * (dsg.fontScale / 100)}px` : undefined,
        paddingTop: "env(safe-area-inset-top)",
        ...(dsg?.contentBgColor ? { backgroundColor: dsg.contentBgColor } : {}),
        ...(dsg?.contentBgImage ? { backgroundImage: `url(${dsg.contentBgImage})`, backgroundSize: "cover", backgroundPosition: "center" } : {}),
      }}
    >
      {/* karşılama bandı — baner varsa tam-bleed görsel, yoksa aksan degrade (boş kutu asla) */}
      <div
        className="relative w-full shrink-0 overflow-hidden"
        style={content.edition.headerImageUrl ? undefined : { background: `linear-gradient(135deg, ${accent}, ${accent}b3)` }}
      >
        {content.edition.headerImageUrl ? (
          <>
            <img src={content.edition.headerImageUrl} alt="" className="absolute inset-0 size-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-black/20 to-black/5" />
          </>
        ) : (
          <>
            <div aria-hidden className="absolute -right-10 -top-16 size-48 rounded-full bg-white/10" />
            <div aria-hidden className="absolute -left-10 top-14 size-32 rounded-full bg-black/10" />
          </>
        )}
        <div className="relative mx-auto flex w-full max-w-md items-center gap-3.5 px-5 pb-7 pt-10">
          <div className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-2xl border border-white/40 bg-white shadow-md">
            {content.edition.logoUrl ? (
              <img src={content.edition.logoUrl} alt="" className="size-full object-contain p-1.5" />
            ) : (
              <Icons.CalendarRange className="size-7" style={{ color: accent }} />
            )}
          </div>
          <div className="min-w-0 text-white">
            <h1 className="text-[22px] font-extrabold leading-tight tracking-tight">
              {content.edition.portalHeaderTitle || content.edition.name}
            </h1>
            {dateCity.length > 0 && (
              <p className="mt-1 flex items-center gap-1.5 truncate text-xs font-medium text-white/85">
                <Icons.MapPin className="size-3.5 shrink-0" /> {dateCity.join(" · ")}
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="mx-auto flex w-full max-w-md flex-1 flex-col px-5 pb-6" style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 24px)" }}>
        <div className="mt-5 rounded-[20px] border bg-white p-5 shadow-md dark:bg-card">
          <div className="mb-4 grid grid-cols-2 rounded-xl bg-muted p-1" role="tablist" aria-label={t("portalApp.login.methodAria")}>
            <button
              role="tab"
              aria-selected={mode === "CODE"}
              onClick={() => switchMode("CODE")}
              className={cn("h-10 rounded-lg text-sm font-semibold transition active:scale-[0.98]", mode === "CODE" ? "bg-white shadow-sm dark:bg-background" : "text-muted-foreground")}
              style={mode === "CODE" ? { color: accent } : undefined}
            >
              {t("portalApp.login.codeTab")}
            </button>
            <button
              role="tab"
              aria-selected={mode === "EMAIL"}
              onClick={() => switchMode("EMAIL")}
              disabled={!opts.emailLogin}
              className={cn("h-10 rounded-lg text-sm font-semibold transition active:scale-[0.98] disabled:opacity-40", mode === "EMAIL" ? "bg-white shadow-sm dark:bg-background" : "text-muted-foreground")}
              style={mode === "EMAIL" ? { color: accent } : undefined}
            >
              {t("portalApp.login.emailTab")}
            </button>
          </div>

          {/* form sarmalayıcı — mobil klavyede "Git" tuşu gönderir */}
          <form
            className="space-y-3.5"
            onSubmit={(e) => {
              e.preventDefault();
              if (!submitDisabled) void submit();
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="p-code" className="text-xs font-semibold">{t("portalApp.login.codeLabel")}</Label>
              <Input
                id="p-code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="ABC123"
                autoCapitalize="characters"
                autoComplete="off"
                autoFocus
                enterKeyHint="go"
                className="h-12 rounded-xl text-center font-mono text-base uppercase tracking-[0.2em]"
              />
            </div>
            {mode === "EMAIL" && (
              <div className="space-y-1.5">
                <Label htmlFor="p-email" className="text-xs font-semibold">{t("portalApp.login.emailLabel")}</Label>
                <Input
                  id="p-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={t("portalApp.login.emailPh")}
                  autoComplete="email"
                  inputMode="email"
                  enterKeyHint="go"
                  className="h-12 rounded-xl text-base"
                />
              </div>
            )}
            <Button type="submit" disabled={submitDisabled} className="h-12 w-full rounded-xl text-[15px] font-bold text-white active:scale-[0.99]" style={{ backgroundColor: accent }}>
              {busy ? <Icons.Loader2 className="size-5 animate-spin" /> : <Icons.LogIn className="size-5" />}
              {t("portalApp.login.submit")}
            </Button>
            <p className="text-center text-[11px] leading-relaxed text-muted-foreground">
              {mode === "EMAIL"
                ? t("portalApp.login.emailHint")
                : t("portalApp.login.codeHint")}
            </p>
          </form>
        </div>

        {/* §2 Anonim oturum mantığı: kayıt yönlendirmesi */}
        {opts.allowRegistrationRedirect && opts.registrationFormId && (
          <div className="mt-3.5 rounded-[20px] border border-dashed bg-white/60 p-4 text-center dark:bg-card/60">
            <p className="text-xs text-muted-foreground">{t("portalApp.login.registerHint")}</p>
            <Button variant="outline" className="mt-2 h-10 rounded-xl font-semibold" onClick={() => onOpenForm(opts.registrationFormId)} disabled={!opts.registrationFormId}>
              <Icons.UserPlus className="size-4" /> {t("portalApp.login.registerBtn")}
            </Button>
          </div>
        )}

        <p className="mt-auto pt-6 text-center text-[11px] text-muted-foreground">{content.tenant.name} · {t("portalApp.login.poweredBy")}</p>
        {/* Mobil Portal Sponsoru şeridi (§5.2+) — giriş ekranında da görünür */}
        {(sp?.logoUrl || sp?.name) && (
          <div className="flex items-center justify-end gap-2 pt-3">
            <span className="text-[10px] font-medium text-muted-foreground">{t("portalApp.design.sponsorLabel")}</span>
            {sp.logoUrl ? <img src={sp.logoUrl} alt={sp.name ?? ""} className="h-5 w-auto max-w-28 object-contain" /> : <Icons.BadgeCheck className="size-4" style={{ color: accent }} />}
            {sp.name && <span className="text-[11px] font-semibold">{sp.name}</span>}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── ANASAYFA — Dashboard Grid (§3.2) ───────────────────────────────────────
function HomeScreen({
  content,
  editionSlug,
  kind,
  accent,
  iconOverrides,
  gameData,
  canInstall,
  onInstall,
  onNavigate,
  onOpenForm,
}: {
  content: PortalContent;
  editionSlug: string;
  kind: "GUEST" | "AUTH" | null;
  accent: string;
  iconOverrides: Record<string, IconOverride>;
  gameData: GameData | null;
  canInstall: boolean;
  onInstall: () => void;
  onNavigate: (s: string) => void;
  onOpenForm: (id: string | null) => void;
}) {
  const { t } = useLang();
  const cfg = content.config!;
  const program = content.program ?? [];
  const nowMs = Date.now();
  const liveSession = program.find((s) => {
    const st = new Date(s.startTime).getTime();
    const en = new Date(s.endTime).getTime();
    return st <= nowMs && nowMs <= en;
  });
  const nextSession = program.find((s) => new Date(s.startTime).getTime() > nowMs);
  // duyuru görünürlüğü (CRON-4): kapatılan duyuru kalıcı — kapatılmamış EN GÜNCEL duyuru gösterilir
  const [dismissed, setDismissed] = useState<string | null>(() => loadAnnDismissed(editionSlug));
  const dismiss = (id: string) => {
    setDismissed(id);
    saveAnnDismissed(editionSlug, id);
  };
  const announcement = (content.announcements ?? []).find((a) => a.id !== dismissed);

  const widgets = cfg.widgets;
  // modül renkleri — lider event uygulamalarındaki renkli modül dili (Whova/Cvent referansı);
  // admin renk override ederse (iconOverrides[w].color) onunki kazanır
  const WIDGET_META: Record<string, { label: string; icon: typeof Icons.Home; sub: string; target: string; color: string }> = {
    agenda: { label: t("portalApp.widget.agenda"), icon: Icons.CalendarDays, sub: nextSession ? fmtDateTime(nextSession.startTime) : t("portalApp.widget.agendaEmpty"), target: "program", color: "#2563eb" },
    speakers: { label: t("portalApp.widget.speakers"), icon: Icons.Mic2, sub: t("portalApp.widget.speakersSub", { count: content.speakers?.length ?? 0 }), target: "speakers", color: "#9333ea" },
    forms: { label: t("portalApp.widget.forms"), icon: Icons.ClipboardList, sub: t("portalApp.widget.formsSub", { count: content.forms?.length ?? 0 }), target: "forms", color: "#d97706" },
    qa: { label: t("portalApp.widget.qa"), icon: Icons.MessageCircleQuestion, sub: t("portalApp.widget.qaSub"), target: "qa", color: "#db2777" },
    map: { label: t("portalApp.widget.map"), icon: Icons.Map, sub: content.edition.venueName ?? t("portalApp.widget.mapSub"), target: "map", color: "#059669" },
    b2b: { label: t("portalApp.widget.b2b"), icon: Icons.Handshake, sub: t("portalApp.widget.b2bSub", { count: content.b2b?.length ?? 0 }), target: "b2b", color: "#0284c7" },
    game: { label: t("portalApp.widget.game"), icon: Icons.Trophy, sub: gameData ? t("portalApp.widget.gameSub", { points: gameData.points }) : t("portalApp.widget.gameEmpty"), target: "game", color: "#ea580c" },
  };

  return (
    <div className="space-y-3">
      {/* canlı duyuru şeridi */}
      {announcement && dismissed !== announcement.id && (
        <div
          className={cn(
            "flex items-start gap-2 rounded-xl border p-3",
            announcement.level === "URGENT" ? "border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/40" : announcement.level === "WARNING" ? "border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/40" : "border-teal-200 bg-teal-50 dark:border-teal-900 dark:bg-teal-950/40",
          )}
          role="status"
        >
          <Icons.Megaphone className="mt-0.5 size-4 shrink-0 text-teal-700 dark:text-teal-300" />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold">{announcement.title}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">{announcement.message}</p>
          </div>
          <button onClick={() => dismiss(announcement.id)} aria-label={t("portalApp.announce.dismiss")} className="rounded p-0.5 text-muted-foreground hover:text-foreground">
            <Icons.X className="size-3.5" />
          </button>
        </div>
      )}

      {/* düzenleyici blokları (TASK-B 25) */}
      {(content.blocks ?? []).map((b) => (
        <div key={b.id} className="rounded-xl border bg-white p-3 shadow-sm dark:bg-card">
          <p className="text-xs font-semibold">{b.title}</p>
        </div>
      ))}

      {/* widget grid — admin sırası ile; ikon kütüphanesi/SVG override'lı (kullanıcı isteği) */}
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3" role="list" aria-label={t("portalApp.widget.aria")}>
        {widgets.map((w) => {
          const meta = WIDGET_META[w.key];
          if (!meta) return null;
          const o = iconOverrides[w.key];
          const hasCustom = Boolean(o?.svg || o?.icon);
          return (
            <div key={w.key} role="listitem" className="min-h-[92px]">
            <button
              onClick={() => onNavigate(meta.target)}
              className="group flex h-full w-full flex-col items-start gap-1.5 rounded-xl border bg-white p-3 text-left shadow-sm transition hover:shadow-md active:scale-[0.97] dark:bg-card"
            >
              <span
                className={cn("grid size-8 place-items-center rounded-lg text-white transition-transform", !hasCustom && "group-hover:scale-105")}
                style={{ backgroundColor: hasCustom && o?.svg ? "transparent" : (o?.color ?? meta.color) }}
              >
                {o?.svg ? (
                  <img src={o.svg} alt="" className="size-7 object-contain" />
                ) : (() => {
                  const O = o?.icon ? resolvePortalIcon(o.icon) : null;
                  const I = O ?? meta.icon;
                  return <I className="size-4" />;
                })()}
              </span>
              <span className="text-xs font-semibold leading-tight">{meta.label}</span>
              <span className="line-clamp-2 text-[10px] text-muted-foreground">{meta.sub}</span>
              {w.visibility === "AUTH" && kind === "AUTH" && (
                <span className="mt-auto rounded-full bg-teal-50 px-1.5 py-0.5 text-[9px] font-medium text-teal-700 dark:bg-teal-900/40 dark:text-teal-200">{t("portalApp.widget.authOnly")}</span>
              )}
            </button>
            </div>
          );
        })}
      </div>

      {/* sıradaki/canli hero — "Up Next" deseni (Eventbase/Whova referansı) */}
      {(liveSession ?? nextSession) && (() => {
        const s = (liveSession ?? nextSession)!;
        const live = Boolean(liveSession);
        const sp = s.speakers.slice(0, 3);
        return (
          <button
            onClick={() => onNavigate("program")}
            className="relative block w-full overflow-hidden rounded-2xl p-4 text-left text-white shadow-md transition active:scale-[0.99]"
            style={{ background: `linear-gradient(135deg, ${accent}, ${accent}cc)` }}
          >
            <div aria-hidden className="absolute -right-10 -top-14 size-44 rounded-full bg-white/10" />
            <div aria-hidden className="absolute -bottom-16 right-16 size-32 rounded-full bg-black/10" />
            <div className="relative">
              <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-white/85">
                {live && (
                  <span className="relative flex size-2">
                    <span className="absolute inline-flex size-full rounded-full bg-white opacity-75 motion-safe:animate-ping" />
                    <span className="relative inline-flex size-2 rounded-full bg-white" />
                  </span>
                )}
                {live ? t("portalApp.home.liveNow") : t("portalApp.home.upNext")}
              </p>
              <p className="mt-1 line-clamp-2 text-base font-extrabold leading-snug">{s.title}</p>
              <p className="mt-0.5 truncate text-xs font-medium text-white/85">
                {fmtDateTime(s.startTime)}{s.room ? ` · ${s.room}` : ""}
              </p>
              {sp.length > 0 && (
                <span className="mt-2.5 flex items-center">
                  {sp.map((p) => (
                    <span key={p.personId} className="-ml-1.5 grid size-7 place-items-center overflow-hidden rounded-full border-2 border-white/70 bg-white/20 text-[9px] font-bold first:ml-0">
                      {p.photoUrl ? <img src={p.photoUrl} alt="" className="size-full object-cover" /> : p.name.split(" ").map((x) => x[0]).slice(0, 2).join("")}
                    </span>
                  ))}
                  <span className="ml-2 truncate text-[11px] font-medium text-white/85">
                    {sp.map((p) => p.name).join(", ")}{s.speakers.length > 3 ? ` +${s.speakers.length - 3}` : ""}
                  </span>
                </span>
              )}
            </div>
          </button>
        );
      })()}

      {/* PWA kurulum kartı */}
      {cfg.pwaEnabled && canInstall && (
        <div className="flex items-center gap-3 rounded-xl border border-dashed border-teal-300 bg-teal-50/60 p-3 dark:bg-teal-950/30">
          <div className="grid size-10 shrink-0 place-items-center rounded-lg bg-white shadow-sm dark:bg-card">
            <img src="/portal-icon-192.png" alt="" className="size-7 rounded-md" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold">{t("portalApp.install.title")}</p>
            <p className="text-[11px] text-muted-foreground">{t("portalApp.install.desc")}</p>
          </div>
          <Button size="sm" onClick={onInstall}>{t("portalApp.install.btn")}</Button>
        </div>
      )}

      {/* hızlı bağlantılar — sponsors (alt menüde ama home kısayolu da faydalı) */}
      {(cfg.bottomNav.sponsors !== false) && (
        <button onClick={() => onNavigate("sponsors")} className="flex w-full items-center gap-3 rounded-xl border bg-white p-3 text-left shadow-sm dark:bg-card">
          <div className="grid size-10 shrink-0 place-items-center rounded-lg bg-amber-50 text-amber-700 dark:bg-amber-900/40 dark:text-amber-200">
            <Icons.Handshake className="size-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold">{t("portalApp.home.sponsorsTitle")}</p>
            <p className="text-[11px] text-muted-foreground">{t("portalApp.home.sponsorsDesc", { count: content.sponsors?.length ?? 0 })}</p>
          </div>
          <Icons.ChevronRight className="size-4 text-muted-foreground" />
        </button>
      )}
    </div>
  );
}

// ─── PROGRAM (§3.2 Genel Program) ───────────────────────────────────────────
function ProgramScreen({ content, onBack, sessionKey, accent, onGotoLogin }: { content: PortalContent; onBack: () => void; sessionKey: string | null; accent: string; onGotoLogin: () => void }) {
  const { t } = useLang();
  const { toast } = useToast();
  const [open, setOpen] = useState<string | null>(null);
  const [activeDay, setActiveDay] = useState(0);
  const nowMs = Date.now();
  const program = content.program ?? [];
  const slug = content.edition.slug;
  const reminders = loadReminders(slug);
  const isAuth = content.session?.kind === "AUTH";
  // kapasite kayıtlarım — sunucudan tohumlanır; aksiyonlarda yerel olarak güncellenir
  const [regIds, setRegIds] = useState<Set<string>>(() => new Set(content.mySessionRegIds ?? []));
  const [busyReg, setBusyReg] = useState<string | null>(null);
  // doluluk çipleri yerel iyileştirme — aksiyon sonrası bootstrap beklemeden tutarlı görünüm
  const [countDelta, setCountDelta] = useState<Record<string, number>>({});
  // N-06: tohum senkronu render-fazında (resmî "önceki render" deseni) — effect içi senkron setState yok.
  const [regFor, setRegFor] = useState(content.mySessionRegIds);
  if (regFor !== content.mySessionRegIds) {
    setRegFor(content.mySessionRegIds);
    setRegIds(new Set(content.mySessionRegIds ?? []));
    setCountDelta({});
  }

  const toggleRegistration = async (s: ProgramItem) => {
    if (!sessionKey || !isAuth) {
      onGotoLogin();
      return;
    }
    const registered = regIds.has(s.id);
    setBusyReg(s.id);
    try {
      await portalSend(
        "/api/portal/interact",
        { action: registered ? "SESSION_UNREGISTER" : "SESSION_REGISTER", sessionId: s.id },
        sessionKey,
      );
      setRegIds((prev) => {
        const next = new Set(prev);
        if (registered) next.delete(s.id);
        else next.add(s.id);
        return next;
      });
      setCountDelta((prev) => ({ ...prev, [s.id]: (prev[s.id] ?? 0) + (registered ? -1 : 1) }));
      if (registered) {
        toast({ title: t("portalApp.sessionReg.cancelled") });
      } else {
        toast({ title: t("portalApp.sessionReg.done") });
      }
    } catch (e) {
      const err = e instanceof PortalApiError ? e : null;
      if (err?.code === "SESSION_FULL") {
        toast({ title: t("portalApp.sessionReg.fullTitle"), description: t("portalApp.sessionReg.fullDesc"), variant: "destructive" });
      } else if (err?.code === "TIME_CONFLICT") {
        toast({ title: t("portalApp.sessionReg.conflictTitle"), description: err.conflictWith ? t("portalApp.sessionReg.conflictDesc", { session: err.conflictWith }) : undefined, variant: "destructive" });
      } else {
        toast({ title: t("portalApp.sessionReg.fail"), description: e instanceof Error ? e.message : undefined, variant: "destructive" });
      }
    } finally {
      setBusyReg(null);
    }
  };

  const liveCount = (s: ProgramItem) => Math.max(0, s.registeredCount + (countDelta[s.id] ?? 0));

  const byDay = useMemo(() => {
    const map = new Map<string, ProgramItem[]>();
    for (const s of program) {
      const day = fmtDate(s.startTime);
      const arr = map.get(day) ?? [];
      arr.push(s);
      map.set(day, arr);
    }
    return [...map.entries()];
  }, [program]);

  const toggleReminder = (s: ProgramItem) => {
    const key = `session:${s.id}`;
    const cur = loadReminders(slug);
    const existing = cur.find((r) => r.key === key);
    if (existing) {
      saveReminders(slug, cur.filter((r) => r.key !== key));
      toast({ title: t("portalApp.reminder.off") });
      return;
    }
    if (!content.config?.notifications.enabled) {
      toast({ title: t("portalApp.reminder.disabledTitle"), description: t("portalApp.reminder.disabledDesc") });
      return;
    }
    cur.push({ key, fireAt: new Date(s.startTime).getTime(), title: t("portalApp.reminder.sessionTitle"), body: `${s.title} — ${fmtDateTime(s.startTime)}` });
    saveReminders(slug, cur);
    void portalSend("/api/portal/interact", { action: "REMINDER_SET" }, sessionKey).catch(() => undefined);
    if (typeof Notification !== "undefined" && Notification.permission === "default") void Notification.requestPermission();
    toast({ title: t("portalApp.reminder.on") });
  };

  // QA: scroll-spy — manuel kaydırmada aktif gün hapı görünür bölümle senkron kalır
  // (yalnızca tıklamada set ediliyordu; kaydırınca hap-bölüm eşleşmesi bozuluyordu).
  useEffect(() => {
    if (byDay.length < 2 || typeof IntersectionObserver === "undefined") return;
    const obs = new IntersectionObserver(
      (entries) => {
        const vis = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (vis.length > 0) {
          const di = Number((vis[0].target.id ?? "").replace("portal-day-", ""));
          if (Number.isInteger(di) && di >= 0 && di < byDay.length) setActiveDay(di);
        }
      },
      { rootMargin: "-30% 0px -60% 0px" },
    );
    for (let di = 0; di < byDay.length; di++) {
      const el = document.getElementById(`portal-day-${di}`);
      if (el) obs.observe(el);
    }
    return () => obs.disconnect();
  }, [byDay]);

  if (program.length === 0) {
    return <ScreenShell title={t("portalApp.program.title")} onBack={onBack} icon={<Icons.CalendarDays className="size-4" />}>
      <EmptyMini text={t("portalApp.program.empty")} />
    </ScreenShell>;
  }

  const jumpToDay = (di: number) => {
    setActiveDay(di);
    const smooth = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches !== true;
    document.getElementById(`portal-day-${di}`)?.scrollIntoView({ behavior: smooth ? "smooth" : "auto", block: "start" });
  };

  return (
    <ScreenShell title={t("portalApp.program.title")} onBack={onBack} icon={<Icons.CalendarDays className="size-4" />}>
      {/* gün hapları — çok-günlü programda hızlı atlama (Cvent/EventMobi deseni) */}
      {byDay.length > 1 && (
        <div className="sticky top-0 z-20 -mx-1 mb-3 flex gap-1.5 overflow-x-auto bg-background/95 px-1 py-2 backdrop-blur-sm" role="tablist" aria-label={t("portalApp.program.title")}>
          {byDay.map(([day], di) => (
            <button
              key={day}
              role="tab"
              aria-selected={activeDay === di}
              onClick={() => jumpToDay(di)}
              className={cn(
                "shrink-0 rounded-full border px-3.5 py-1.5 text-[11px] font-semibold transition active:scale-95",
                activeDay === di ? "border-transparent text-white shadow-sm" : "bg-white text-muted-foreground dark:bg-card",
              )}
              style={activeDay === di ? { backgroundColor: accent } : undefined}
            >
              {t("portalApp.program.day", { n: di + 1 })}
            </button>
          ))}
        </div>
      )}
      <div className="space-y-4">
        {byDay.map(([day, items], di) => (
          <div key={day} id={`portal-day-${di}`} className="scroll-mt-14">
            <div className="py-1">
              <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{day}</h3>
            </div>
            <div className="mt-2 space-y-2">
              {items.map((s) => {
                const expanded = open === s.id;
                const reminded = reminders.some((r) => r.key === `session:${s.id}`);
                const live = new Date(s.startTime).getTime() <= nowMs && nowMs <= new Date(s.endTime).getTime();
                return (
                  <div key={s.id} className={cn("overflow-hidden rounded-xl border bg-white shadow-sm dark:bg-card", live && "border-red-300 ring-1 ring-red-500/40 dark:border-red-800")}>
                    <button className="flex w-full items-start gap-3 p-3 text-left" onClick={() => setOpen(expanded ? null : s.id)} aria-expanded={expanded}>
                      <div className="w-14 shrink-0 text-center">
                        <p className="text-sm font-bold tabular-nums">
                          {new Date(s.startTime).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}
                        </p>
                        <p className="text-[10px] text-muted-foreground tabular-nums">
                          {new Date(s.endTime).toLocaleTimeString("tr-TR", { hour: "2-digit", minute: "2-digit" })}
                        </p>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold leading-snug">{s.title}</p>
                        <div className="mt-1 flex flex-wrap items-center gap-1">
                          {live && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-red-600 px-1.5 py-0.5 text-[9px] font-bold text-white">
                              <span className="relative flex size-1.5">
                                <span className="absolute inline-flex size-full rounded-full bg-white opacity-75 motion-safe:animate-ping" />
                                <span className="relative inline-flex size-1.5 rounded-full bg-white" />
                              </span>
                              {t("portalApp.program.liveNow")}
                            </span>
                          )}
                          <span className={cn("rounded-full px-1.5 py-0.5 text-[9px] font-medium", SESSION_TYPE_COLORS[s.type] ?? "bg-muted text-muted-foreground")}>
                            {t(`portalApp.sessionType.${s.type}`)}
                          </span>
                          {s.room && <span className="rounded-full bg-muted px-1.5 py-0.5 text-[9px] text-muted-foreground">{s.room}</span>}
                          {s.track && <span className="rounded-full bg-muted px-1.5 py-0.5 text-[9px] text-muted-foreground">{s.track}</span>}
                          {(() => {
                            // kapasite doluluk çipi — çoğunlukla yeşil, ≥%80 amber, dolu kırmızı
                            if (s.capacity === null) return null;
                            const cnt = liveCount(s);
                            const full = cnt >= s.capacity;
                            const almost = !full && cnt >= Math.ceil(s.capacity * 0.8);
                            return (
                              <span className={cn(
                                "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[9px] font-medium tabular-nums",
                                full
                                  ? "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-200"
                                  : almost
                                    ? "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200"
                                    : "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
                              )}>
                                <Icons.Users className="size-2.5" />
                                {full ? t("portalApp.sessionReg.fullChip") : `${cnt}/${s.capacity}`}
                              </span>
                            );
                          })()}
                        </div>
                        {s.speakers.length > 0 && (
                          <div className="mt-1.5 flex items-center">
                            {s.speakers.slice(0, 4).map((sp) => (
                              <span key={sp.personId} title={sp.name} className="-ml-1 grid size-5 place-items-center overflow-hidden rounded-full border border-white bg-muted text-[7px] font-bold text-muted-foreground first:ml-0 dark:border-card">
                                {sp.photoUrl ? <img src={sp.photoUrl} alt="" className="size-full object-cover" /> : sp.name.split(" ").map((x) => x[0]).slice(0, 2).join("")}
                              </span>
                            ))}
                            {s.speakers.length > 4 && <span className="ml-1 text-[9px] tabular-nums text-muted-foreground">+{s.speakers.length - 4}</span>}
                          </div>
                        )}
                      </div>
                      <Icons.ChevronDown className={cn("mt-1 size-4 shrink-0 text-muted-foreground transition-transform", expanded && "rotate-180")} />
                    </button>
                    {expanded && (
                      <div className="border-t bg-muted/20 p-3">
                        {s.description && <p className="text-[11px] leading-relaxed text-muted-foreground">{s.description}</p>}
                        {s.speakers.length > 0 && (
                          <div className="mt-2">
                            <p className="text-[10px] font-semibold uppercase text-muted-foreground">{t("portalApp.program.speakers")}</p>
                            <ul className="mt-1 space-y-0.5">
                              {s.speakers.map((sp) => (
                                <li key={sp.personId} className="flex items-center gap-1.5 text-[11px]">
                                  <Icons.Mic2 className="size-3 text-muted-foreground" /> {sp.name}
                                  <span className="text-[9px] text-muted-foreground">({t(`portalApp.role.${sp.role}`)})</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {s.cmeCredits ? <p className="mt-2 text-[10px] text-teal-700 dark:text-teal-300">+{s.cmeCredits} CME</p> : null}
                        {(() => {
                          // kapasite kayıt alanı — kapasiteli veya kayıt-gerektirir oturumlarda gösterilir
                          if (s.capacity === null && s.accessRule !== "REGISTRATION_REQUIRED") return null;
                          const full = s.capacity !== null && liveCount(s) >= s.capacity;
                          const registered = regIds.has(s.id);
                          if (!isAuth) {
                            return (
                              <div className="mt-2">
                                <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={onGotoLogin}>
                                  <Icons.Lock className="size-3" /> {t("portalApp.sessionReg.guestCta")}
                                </Button>
                              </div>
                            );
                          }
                          return (
                            <div className="mt-2 flex flex-wrap items-center gap-1.5">
                              {registered ? (
                                <>
                                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                                    <Icons.CheckCircle2 className="size-3" /> {t("portalApp.sessionReg.registeredChip")}
                                  </span>
                                  <Button size="sm" variant="ghost" className="h-7 text-[11px] text-red-600 hover:text-red-700" disabled={busyReg === s.id} onClick={() => void toggleRegistration(s)}>
                                    {busyReg === s.id ? <Icons.Loader2 className="size-3 animate-spin" /> : <Icons.X className="size-3" />} {t("portalApp.sessionReg.cancelBtn")}
                                  </Button>
                                </>
                              ) : (
                                <Button size="sm" className="h-7 text-[11px]" disabled={busyReg === s.id || full} onClick={() => void toggleRegistration(s)}>
                                  {busyReg === s.id ? <Icons.Loader2 className="size-3 animate-spin" /> : <Icons.UserPlus className="size-3" />} {full ? t("portalApp.sessionReg.fullChip") : t("portalApp.sessionReg.regBtn")}
                                </Button>
                              )}
                            </div>
                          );
                        })()}
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          <Button
                            size="sm"
                            variant={reminded ? "secondary" : "outline"}
                            className="h-7 text-[11px]"
                            onClick={() => toggleReminder(s)}
                          >
                            {reminded ? <Icons.BellRing className="size-3" /> : <Icons.Bell className="size-3" />}
                            {reminded ? t("portalApp.reminder.remove") : t("portalApp.reminder.add")}
                          </Button>
                          <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => downloadIcs(s)}>
                            <Icons.CalendarPlus className="size-3" />
                            {t("portalApp.program.ics")}
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </ScreenShell>
  );
}

// ─── KONUŞMACILAR (§3.4) ────────────────────────────────────────────────────
function SpeakersScreen({ content, onBack, onRegisterSubBack }: { content: PortalContent; onBack: () => void; onRegisterSubBack?: (fn: (() => boolean) | null) => void }) {
  const { t } = useLang();
  const [selected, setSelected] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const { lang } = useLang(); // arama locale'i (çift çağrı: aynı store, ek maliyet yok)
  // sistem geri/swipe önce açık detayı kapatır (ekrandan çıkarmaz)
  useEffect(() => {
    onRegisterSubBack?.(() => {
      if (selected) { setSelected(null); return true; }
      return false;
    });
    return () => onRegisterSubBack?.(null);
  }, [selected, onRegisterSubBack]);
  const speakers = content.speakers ?? [];
  const current = speakers.find((s) => s.personId === selected);
  const q = query.trim().toLocaleLowerCase(lang);
  const filtered = q.length === 0
    ? speakers
    : speakers.filter((s) => `${s.name} ${s.title ?? ""} ${s.company ?? ""}`.toLocaleLowerCase(lang).includes(q));

  if (current) {
    return (
      <ScreenShell title={t("portalApp.speakers.detail")} onBack={() => setSelected(null)} icon={<Icons.Mic2 className="size-4" />}>
        <div className="space-y-3">
          <div className="rounded-xl border bg-white p-4 text-center shadow-sm dark:bg-card">
            <div className="mx-auto grid size-20 place-items-center overflow-hidden rounded-full border bg-muted">
              {current.photoUrl ? (
                <img src={current.photoUrl} alt={current.name} className="size-full object-cover" />
              ) : (
                <span className="text-xl font-bold text-muted-foreground">{current.name.split(" ").map((p) => p[0]).slice(0, 2).join("")}</span>
              )}
            </div>
            <h2 className="mt-2 text-sm font-bold">{current.name}</h2>
            <p className="text-xs text-muted-foreground">{[current.title, current.company].filter(Boolean).join(" · ") || "—"}</p>
            {current.linkedin && (
              <a href={current.linkedin} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1 rounded-full bg-sky-50 px-2.5 py-1 text-[11px] font-medium text-sky-700 dark:bg-sky-900/40 dark:text-sky-200">
                <Icons.Linkedin className="size-3" /> LinkedIn
              </a>
            )}
            {current.bio && <p className="mt-3 whitespace-pre-line text-left text-[11px] leading-relaxed text-muted-foreground">{current.bio}</p>}
          </div>
          <div>
            <h3 className="mb-1.5 text-xs font-bold uppercase tracking-wide text-muted-foreground">{t("portalApp.speakers.sessions", { count: current.sessions.length })}</h3>
            <div className="space-y-2">
              {current.sessions.map((s) => (
                <div key={s.id} className="rounded-lg border bg-white p-2.5 shadow-sm dark:bg-card">
                  <p className="text-xs font-semibold">{s.title}</p>
                  <p className="mt-0.5 text-[10px] text-muted-foreground">
                    {fmtDateTime(s.startTime)} · {t(`portalApp.role.${s.role}`)}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </ScreenShell>
    );
  }

  return (
    <ScreenShell title={t("portalApp.speakers.title")} onBack={onBack} icon={<Icons.Mic2 className="size-4" />}>
      {speakers.length === 0 ? (
        <EmptyMini text={t("portalApp.speakers.empty")} />
      ) : (
        <div className="space-y-2" role="list">
          {/* konuşmacı arama — isim/unvan/kurum (lider uygulamalarda standart) */}
          <div className="relative">
            <Icons.Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("portalApp.speakers.search")}
              aria-label={t("portalApp.speakers.search")}
              className="h-10 rounded-xl bg-white pl-9 shadow-sm dark:bg-card"
            />
            {query && (
              <button onClick={() => setQuery("")} aria-label={t("portalApp.announce.dismiss")} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted-foreground hover:text-foreground">
                <Icons.X className="size-4" />
              </button>
            )}
          </div>
          {filtered.length === 0 && <EmptyMini text={t("portalApp.speakers.noResult")} />}
          {filtered.map((s) => (
            <div key={s.personId} role="listitem">
            <button onClick={() => setSelected(s.personId)} className="flex w-full items-center gap-3 rounded-xl border bg-white p-3 text-left shadow-sm transition hover:border-teal-300 dark:bg-card">
              <div className="grid size-11 shrink-0 place-items-center overflow-hidden rounded-full border bg-muted">
                {s.photoUrl ? (
                  <img src={s.photoUrl} alt={s.name} className="size-full object-cover" />
                ) : (
                  <span className="text-sm font-bold text-muted-foreground">{s.name.split(" ").map((p) => p[0]).slice(0, 2).join("")}</span>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-semibold">{s.name}</p>
                <p className="truncate text-[11px] text-muted-foreground">{[s.title, s.company].filter(Boolean).join(" · ")}</p>
                <p className="mt-0.5 truncate text-[10px] text-teal-700 dark:text-teal-300">
                  {s.sessions.length > 0 ? s.sessions.map((x) => x.title).join(", ") : t("portalApp.speakers.noSession")}
                </p>
              </div>
              <Icons.ChevronRight className="size-4 shrink-0 text-muted-foreground" />
            </button>
            </div>
          ))}
        </div>
      )}
    </ScreenShell>
  );
}

// ─── SPONSORLAR (§3.3 nav-3) ────────────────────────────────────────────────
function SponsorsScreen({ content, onBack, onRegisterSubBack }: { content: PortalContent; onBack: () => void; onRegisterSubBack?: (fn: (() => boolean) | null) => void }) {
  const { t } = useLang();
  const [selected, setSelected] = useState<string | null>(null);
  // sistem geri/swipe önce açık detayı kapatır (ekrandan çıkarmaz)
  useEffect(() => {
    onRegisterSubBack?.(() => {
      if (selected) { setSelected(null); return true; }
      return false;
    });
    return () => onRegisterSubBack?.(null);
  }, [selected, onRegisterSubBack]);
  const sponsors = content.sponsors ?? [];
  const current = sponsors.find((s) => s.organizationId === selected);
  // katman gruplama — liste küçük olduğundan memo gerektirmez (erken-return ile uyumlu)
  const tiers = (() => {
    const map = new Map<string, SponsorItem[]>();
    for (const s of sponsors) {
      const tier = s.tierName ?? t("portalApp.sponsors.untiered");
      const arr = map.get(tier) ?? [];
      arr.push(s);
      map.set(tier, arr);
    }
    return [...map.entries()];
  })();

  // detay kartı — sponsor logoları başlıklarla aynı kart deseninde tam içerik gösterir
  if (current) {
    return (
      <ScreenShell title={t("portalApp.sponsors.detail")} onBack={() => setSelected(null)} icon={<Icons.Handshake className="size-4" />}>
        <div className="rounded-xl border bg-white p-4 text-center shadow-sm dark:bg-card">
          <div className="mx-auto grid size-20 place-items-center overflow-hidden rounded-2xl border bg-muted">
            {current.logoUrl ? (
              <img src={current.logoUrl} alt={current.name} className="size-full object-contain p-1" />
            ) : (
              <Icons.Building2 className="size-8 text-muted-foreground" />
            )}
          </div>
          <h2 className="mt-2 text-sm font-bold">{current.name}</h2>
          <p className="text-xs text-muted-foreground">{[current.city, current.country].filter(Boolean).join(", ") || "—"}</p>
          {current.tierName && (
            <span className="mt-2 inline-flex rounded-full bg-teal-50 px-2.5 py-1 text-[11px] font-medium text-teal-700 dark:bg-teal-900/40 dark:text-teal-200">
              {current.tierName}
            </span>
          )}
          {current.description && <p className="mt-3 whitespace-pre-line text-left text-[11px] leading-relaxed text-muted-foreground">{current.description}</p>}
          {current.website && (
            <a
              href={current.website.startsWith("http") ? current.website : `https://${current.website}`}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-flex items-center gap-1 rounded-full bg-teal-50 px-3 py-1.5 text-[11px] font-medium text-teal-700 hover:underline dark:bg-teal-900/40 dark:text-teal-200"
            >
              <Icons.ExternalLink className="size-3" /> {t("portalApp.sponsors.website")}
            </a>
          )}
        </div>
      </ScreenShell>
    );
  }

  return (
    <ScreenShell title={t("portalApp.sponsors.title")} onBack={onBack} icon={<Icons.Handshake className="size-4" />}>
      {sponsors.length === 0 ? (
        <EmptyMini text={t("portalApp.sponsors.empty")} />
      ) : (
        <div className="space-y-4">
          {tiers.map(([tier, items]) => (
            <div key={tier}>
              <h3 className="mb-1.5 text-xs font-bold uppercase tracking-wide text-muted-foreground">{tier}</h3>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {items.map((s) => (
                  <button
                    key={s.organizationId}
                    onClick={() => setSelected(s.organizationId)}
                    className="rounded-xl border bg-white p-3 text-left shadow-sm transition hover:border-teal-300 dark:bg-card"
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-lg border bg-muted">
                        {s.logoUrl ? (
                          <img src={s.logoUrl} alt={s.name} className="size-full object-contain p-0.5" />
                        ) : (
                          <Icons.Building2 className="size-4 text-muted-foreground" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-semibold">{s.name}</p>
                        <p className="truncate text-[10px] text-muted-foreground">{[s.city, s.country].filter(Boolean).join(", ") || "—"}</p>
                      </div>
                      <Icons.ChevronRight className="size-4 shrink-0 text-muted-foreground" />
                    </div>
                    {s.description && <p className="mt-2 line-clamp-2 text-[11px] text-muted-foreground">{s.description}</p>}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </ScreenShell>
  );
}

// ─── YER PLANI (§3.3 nav-4) ─────────────────────────────────────────────────
function VenueMapScreen({ content, onBack }: { content: PortalContent; onBack: () => void }) {
  const { t } = useLang();
  const map = content.config!.venueMap;
  return (
    <ScreenShell title={t("portalApp.map.title")} onBack={onBack} icon={<Icons.Map className="size-4" />}>
      {content.edition.venueName && (
        <div className="mb-2 flex items-center gap-2 rounded-xl border bg-white p-3 shadow-sm dark:bg-card">
          <Icons.MapPin className="size-4 shrink-0 text-teal-600" />
          <div className="min-w-0">
            <p className="truncate text-xs font-semibold">{content.edition.venueName}</p>
            {content.edition.city && <p className="truncate text-[11px] text-muted-foreground">{content.edition.city}</p>}
          </div>
        </div>
      )}
      {map.enabled && map.url ? (
        <div className="overflow-hidden rounded-xl border bg-white shadow-sm dark:bg-card">
          <img src={map.url} alt={t("portalApp.map.alt")} className="max-h-[70vh] w-full object-contain" />
        </div>
      ) : (
        <EmptyMini text={t("portalApp.map.empty")} />
      )}
    </ScreenShell>
  );
}

// ─── Q&A (§3.2 widget) ──────────────────────────────────────────────────────
function QaScreen({ content, sessionKey, onBack, onSubmitted, onGameRefresh }: { content: PortalContent; sessionKey: string | null; onBack: () => void; onSubmitted?: () => void; onGameRefresh?: () => void }) {
  const { t } = useLang();
  const { toast } = useToast();
  const program = content.program ?? [];
  const [sessionId, setSessionId] = useState<string>("general");
  const [body, setBody] = useState("");
  const [anon, setAnon] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const mine = content.myQuestions ?? [];

  const submit = async () => {
    if (!sessionKey) return;
    setBusy(true);
    try {
      const r = (await portalSend(
        "/api/portal/interact",
        {
          action: "QA_SUBMIT",
          programSessionId: sessionId === "general" ? undefined : sessionId,
          body: body.trim(),
          isAnonymous: anon,
          displayName: name.trim() || undefined,
        },
        sessionKey,
      )) as { ok?: boolean; id?: string; game?: { awarded?: number } | null };
      setBody("");
      // oyunlaştırma: soru puanı — anında toast (kullanıcı isteği: formlarla etkileşimli)
      const awarded = r?.game?.awarded ?? 0;
      toast({
        title: awarded > 0 ? t("portalApp.game.pointsWon") : t("portalApp.qa.sent"),
        description: awarded > 0 ? t("portalApp.game.pointsWonDesc", { points: awarded }) : t("portalApp.qa.sentDesc"),
      });
      onSubmitted?.(); // ekran korunur, soru listesi tazelenir
      onGameRefresh?.();
    } catch (e) {
      toast({ title: t("portalApp.qa.fail"), description: e instanceof Error ? e.message : undefined, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScreenShell title={t("portalApp.qa.title")} onBack={onBack} icon={<Icons.MessageCircleQuestion className="size-4" />}>
      <div className="rounded-xl border bg-white p-3 shadow-sm dark:bg-card">
        <div className="space-y-2.5">
          <div className="space-y-1.5">
            <Label>{t("portalApp.qa.target")}</Label>
            <Select value={sessionId} onValueChange={setSessionId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="general">{t("portalApp.qa.general")}</SelectItem>
                {program.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {new Date(s.startTime).toLocaleDateString("tr-TR", { day: "2-digit", month: "2-digit" })} · {s.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="qa-body">{t("portalApp.qa.question")}</Label>
            <Textarea id="qa-body" value={body} onChange={(e) => setBody(e.target.value)} placeholder={t("portalApp.qa.ph")} rows={3} maxLength={500} />
          </div>
          <div className="flex items-center justify-between rounded-lg border bg-muted/30 px-3 py-2">
            <Label htmlFor="qa-anon" className="text-[11px] font-normal text-muted-foreground">{t("portalApp.qa.anon")}</Label>
            <Switch id="qa-anon" checked={anon} onCheckedChange={setAnon} />
          </div>
          {anon ? null : (
            content.session?.kind === "AUTH" ? (
              <p className="text-[11px] text-muted-foreground">{t("portalApp.qa.authName")}</p>
            ) : (
              <div className="space-y-1.5">
                <Label htmlFor="qa-name">{t("portalApp.qa.guestName")}</Label>
                <Input id="qa-name" value={name} onChange={(e) => setName(e.target.value)} placeholder={t("portalApp.qa.guestNamePh")} maxLength={80} />
              </div>
            )
          )}
          <Button className="w-full" onClick={() => void submit()} disabled={busy || body.trim().length < 5}>
            {busy ? <Icons.Loader2 className="size-4 animate-spin" /> : <Icons.Send className="size-4" />} {t("portalApp.qa.submit")}
          </Button>
        </div>
      </div>

      {mine.length > 0 && (
        <div className="mt-3">
          <h3 className="mb-1.5 text-xs font-bold uppercase tracking-wide text-muted-foreground">{t("portalApp.qa.mine")}</h3>
          <div className="space-y-2">
            {mine.map((q) => (
              <div key={q.id} className="rounded-lg border bg-white p-2.5 shadow-sm dark:bg-card">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-[11px] leading-snug">{q.body}</p>
                  <span className={cn("shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-medium", q.status === "ANSWERED" ? "bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-200" : q.status === "HIDDEN" ? "bg-muted text-muted-foreground" : "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200")}>
                    {t(`portalApp.qa.status.${q.status}`)}
                  </span>
                </div>
                {q.status === "ANSWERED" && q.answerBody ? (
                  <div className="mt-2 rounded-lg border-l-2 border-teal-500 bg-muted/30 px-2 py-1.5">
                    <p className="text-[10px] font-semibold text-teal-700 dark:text-teal-300">{t("portalApp.qa.answerLabel")}</p>
                    <p className="mt-0.5 whitespace-pre-line text-[11px] leading-relaxed">{q.answerBody}</p>
                    {q.answeredAt ? <p className="mt-1 text-[9px] text-muted-foreground">{fmtDateTime(q.answeredAt)}</p> : null}
                  </div>
                ) : null}
                <p className="mt-1 text-[10px] text-muted-foreground">{fmtDateTime(q.createdAt)}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </ScreenShell>
  );
}

// ─── FORMLAR & QUIZLER (§3.2 widget hedefi) ─────────────────────────────────
// Oyunlaştırma bağlıysa formlar görev durumuyla eşleşir: gönderilenler
// "Tamamlandı" grubuna düşer (yeşil-tik + soluk), puanlık formlarda +puan
// rozeti ve form türü etiketi (Kayıt/Anket/Geri Bildirim…) görünür.
function FormsScreen({
  content,
  gameData,
  accent,
  onBack,
  onOpenForm,
}: {
  content: PortalContent;
  gameData: GameData | null;
  accent: string;
  onBack: () => void;
  onOpenForm: (id: string | null) => void;
}) {
  const { t } = useLang();
  const forms = content.forms ?? [];
  const questByForm = useMemo(() => {
    const m = new Map<string, { done: boolean; points: number }>();
    if (!gameData?.enabled) return m;
    for (const q of gameData.quests) {
      if (q.kind !== "FORM") continue;
      m.set(q.key.slice("form:".length), { done: q.done, points: q.points });
    }
    return m;
  }, [gameData]);
  const gameOn = Boolean(gameData?.enabled) && questByForm.size > 0;
  const pending = forms.filter((f) => !questByForm.get(f.id)?.done);
  const completed = forms.filter((f) => questByForm.get(f.id)?.done);

  const formRow = (f: { id: string; name: string; description: string | null; type: string; slug: string | null }) => {
    const q = questByForm.get(f.id);
    const done = Boolean(q?.done);
    const TypeIcon =
      f.type === "REGISTRATION" ? Icons.UserPlus :
      f.type === "SURVEY" || f.type === "QA_MOBILE" ? Icons.ListChecks :
      f.type === "FEEDBACK" ? Icons.MessageSquareHeart : Icons.FileText;
    const typeLabel = t(`portalApp.forms.type.${f.type || "CUSTOM"}`);
    return (
      <div key={f.id} role="listitem">
      <button
        onClick={() => onOpenForm(f.slug ?? f.id)}
        className={cn(
          "flex w-full items-center gap-3 rounded-xl border bg-white p-3 text-left shadow-sm transition hover:border-teal-300 active:scale-[0.99] dark:bg-card",
          done && "opacity-75",
        )}
      >
        <div
          className={cn("grid size-10 shrink-0 place-items-center rounded-lg", !done && "bg-teal-50 text-teal-700 dark:bg-teal-900/40 dark:text-teal-200", done && "text-white")}
          style={done ? { backgroundColor: accent } : undefined}
        >
          {done ? <Icons.Check className="size-5" /> : <TypeIcon className="size-5" />}
        </div>
        <div className="min-w-0 flex-1">
          <p className={cn("truncate text-xs font-semibold", done && "line-through opacity-70")}>{f.name}</p>
          <div className="mt-0.5 flex items-center gap-1.5">
            <span className="shrink-0 rounded-full bg-muted px-1.5 py-px text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">{typeLabel}</span>
            {f.description && <p className="truncate text-[11px] text-muted-foreground">{f.description}</p>}
          </div>
        </div>
        {gameOn && q && !q.done && q.points > 0 && (
          <span className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ backgroundColor: `${accent}1a`, color: accent }}>
            +{q.points}
          </span>
        )}
        {done ? <Icons.CheckCircle2 className="size-4 shrink-0" style={{ color: accent }} /> : <Icons.ExternalLink className="size-4 shrink-0 text-muted-foreground" />}
      </button>
      </div>
    );
  };

  return (
    <ScreenShell title={t("portalApp.forms.title")} onBack={onBack} icon={<Icons.ClipboardList className="size-4" />}>
      {forms.length === 0 ? (
        <EmptyMini text={t("portalApp.forms.empty")} />
      ) : gameOn ? (
        <div className="space-y-2" role="list">
          {pending.length > 0 && (
            <h3 className="mb-1.5 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
              {t("portalApp.forms.pendingGroup")}
              <span className="rounded-full bg-muted px-2 py-px text-[10px] font-bold normal-case">{pending.length}</span>
            </h3>
          )}
          {pending.map(formRow)}
          {completed.length > 0 && (
            <h3 className="mb-1.5 mt-4 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
              {t("portalApp.forms.completedGroup")}
              <span className="rounded-full bg-muted px-2 py-px text-[10px] font-bold normal-case">{completed.length}</span>
            </h3>
          )}
          {completed.map(formRow)}
        </div>
      ) : (
        <div className="space-y-2" role="list">{forms.map(formRow)}</div>
      )}
    </ScreenShell>
  );
}

// ─── B2B GÖRÜŞMELER (§4.1 — yalnız AUTH) ────────────────────────────────────
function B2bScreen({ content, sessionKey, onBack, onChanged, onGotoLogin }: { content: PortalContent; sessionKey: string | null; onBack: () => void; onChanged: () => void; onGotoLogin: () => void }) {
  const { t } = useLang();
  const { toast } = useToast();
  const meetings = content.b2b ?? [];
  const [resched, setResched] = useState<B2bMeeting | null>(null);
  const [note, setNote] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  if (content.session?.kind !== "AUTH") {
    return (
      <ScreenShell title={t("portalApp.b2b.title")} onBack={onBack} icon={<Icons.Handshake className="size-4" />}>
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-center dark:border-amber-900 dark:bg-amber-950/40">
          <Icons.Lock className="mx-auto size-5 text-amber-600" />
          <p className="mt-1.5 text-xs font-medium">{t("portalApp.b2b.authOnly")}</p>
          <p className="mt-1 text-[11px] text-muted-foreground">{t("portalApp.b2b.authOnlyDesc")}</p>
          <Button size="sm" className="mt-3" onClick={onGotoLogin}>
            <Icons.LogIn className="size-3.5" /> {t("portalApp.b2b.loginCta")}
          </Button>
        </div>
      </ScreenShell>
    );
  }

  const respond = async (m: B2bMeeting, response: "ACCEPTED" | "DECLINED" | "RESCHEDULE", extra?: string) => {
    if (!sessionKey) return;
    setBusyId(m.assignmentId);
    try {
      const r = (await portalSend("/api/portal/interact", { action: "B2B_RESPOND", assignmentId: m.assignmentId, response, note: extra }, sessionKey)) as { game?: { awarded: number } | null } | null;
      toast({ title: t(`portalApp.b2b.done.${response}`) });
      // puan tutarlılığı — form/QA ile aynı "Puan kazandın!" bildirimi (oyunlaştırma açıkken)
      if (r?.game?.awarded && r.game.awarded > 0) {
        toast({ title: t("portalApp.game.pointsWon"), description: t("portalApp.game.pointsWonDesc", { points: r.game.awarded }) });
      }
      setResched(null);
      setNote("");
      onChanged();
    } catch (e) {
      toast({ title: t("portalApp.b2b.fail"), description: e instanceof Error ? e.message : undefined, variant: "destructive" });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <ScreenShell title={t("portalApp.b2b.title")} onBack={onBack} icon={<Icons.Handshake className="size-4" />}>
      {meetings.length === 0 ? (
        <EmptyMini text={t("portalApp.b2b.empty")} />
      ) : (
        <div className="space-y-2">
          {meetings.map((m) => (
            <div key={m.assignmentId} className="rounded-xl border bg-white p-3 shadow-sm dark:bg-card">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs font-semibold">{m.subject}</p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    {[m.startsAt ? fmtDateTime(m.startsAt) : null, m.location ? `${t("portalApp.b2b.table")}: ${m.location}` : null].filter(Boolean).join(" · ") || "—"}
                  </p>
                </div>
                <span className={cn("inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-medium",
                  m.status === "ACCEPTED" || m.status === "COMPLETED" ? "bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-200" : m.status === "DECLINED" ? "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-200" : "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200")}>
                  {m.status === "ACCEPTED" || m.status === "COMPLETED" ? <Icons.CheckCircle2 className="size-2.5" /> : m.status === "DECLINED" ? <Icons.XCircle className="size-2.5" /> : <Icons.Clock className="size-2.5" />}
                  {t(`portalApp.b2b.status.${m.status}`)}
                </span>
              </div>
              {m.counterpart.length > 0 && (
                <p className="mt-1.5 flex items-center gap-1 text-[11px] text-muted-foreground">
                  <Icons.Users className="size-3 shrink-0" />
                  <span className="truncate">{m.counterpart.map((c) => [c.name, c.company].filter(Boolean).join(" · ")).join(", ")}</span>
                </p>
              )}
              {m.venue && <p className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground"><Icons.MapPin className="size-3 shrink-0" /> {m.venue}</p>}
              {m.feedback?.startsWith("Zaman talebi") && (
                <p className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">
                  <Icons.Clock className="size-2.5" /> {t("portalApp.b2b.reschedPending")}
                </p>
              )}
              {m.status !== "DECLINED" && m.status !== "COMPLETED" && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {m.status !== "ACCEPTED" && (
                    <Button size="sm" className="h-7 text-[11px]" disabled={busyId === m.assignmentId} onClick={() => void respond(m, "ACCEPTED")}>
                      <Icons.Check className="size-3" /> {t("portalApp.b2b.accept")}
                    </Button>
                  )}
                  <Button size="sm" variant="outline" className="h-7 text-[11px]" disabled={busyId === m.assignmentId} onClick={() => setResched(m)}>
                    <Icons.Clock className="size-3" /> {t("portalApp.b2b.reschedule")}
                  </Button>
                  {m.status !== "DECLINED" && (
                    <Button size="sm" variant="ghost" className="h-7 text-[11px] text-red-600 hover:text-red-700" disabled={busyId === m.assignmentId} onClick={() => void respond(m, "DECLINED")}>
                      <Icons.X className="size-3" /> {t("portalApp.b2b.decline")}
                    </Button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <Dialog open={Boolean(resched)} onOpenChange={(o) => !o && setResched(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-sm">{t("portalApp.b2b.reschedTitle")}</DialogTitle>
            <DialogDescription className="text-xs">{t("portalApp.b2b.reschedDesc")}</DialogDescription>
          </DialogHeader>
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("portalApp.b2b.reschedPh")} rows={3} maxLength={300} />
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setResched(null)}>{t("portalApp.b2b.cancel")}</Button>
            <Button size="sm" disabled={busyId !== null} onClick={() => resched && void respond(resched, "RESCHEDULE", note.trim())}>
              {busyId ? <Icons.Loader2 className="size-3 animate-spin" /> : <Icons.Send className="size-3" />} {t("portalApp.b2b.reschedSend")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ScreenShell>
  );
}

// ─── PROFİL (§2 Profil Sayfası Mantığı) ─────────────────────────────────────
function ProfileScreen({
  content,
  kind,
  accent,
  onBack,
  onLogout,
  onNavigate,
  onOpenForm,
  onGotoLogin,
  canInstall,
  onInstall,
}: {
  content: PortalContent;
  kind: "GUEST" | "AUTH" | null;
  accent: string;
  onBack: () => void;
  onLogout: () => void;
  onNavigate: (s: string) => void;
  onOpenForm: (id: string | null) => void;
  onGotoLogin: () => void;
  canInstall: boolean;
  onInstall: () => void;
}) {
  const { t } = useLang();
  const [me, setMe] = useState<MeData | null>(null);
  const [meError, setMeError] = useState<string | null>(null);
  // izin durumu — lazy init (SSR güvenli) + aksiyonlarda güncellenir
  const [notifState, setNotifState] = useState<string>(() =>
    typeof Notification === "undefined" ? "default" : Notification.permission,
  );

  useEffect(() => {
    if (kind !== "AUTH") return;
    let alive = true;
    apiGet<MeData>("/api/portal/me", { headers: { "x-portal-session": localStorage.getItem(sessionKeyStorage(content.edition.slug)) ?? "" } })
      .then((d) => alive && setMe(d))
      .catch((e) => alive && setMeError(e instanceof Error ? e.message : "Profil alınamadı"));
    return () => {
      alive = false;
    };
  }, [kind, content.edition.slug]);

  const askNotifications = async () => {
    if (typeof Notification === "undefined") return;
    const p = await Notification.requestPermission();
    setNotifState(p);
    if (p === "granted") {
      try {
        new Notification(t("portalApp.profile.notifTestTitle"), { body: t("portalApp.profile.notifTestBody"), icon: "/portal-icon-192.png" });
      } catch {
        /* yoksay */
      }
    }
  };

  const REG_STATUS_COLORS: Record<string, string> = {
    CONFIRMED: "bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-200",
    PENDING: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200",
    REJECTED: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-200",
    CANCELLED: "bg-muted text-muted-foreground",
  };

  return (
    <ScreenShell title={t("portalApp.profile.title")} onBack={onBack} icon={<Icons.UserRound className="size-4" />}>
      {kind === "GUEST" || kind === null ? (
        /* ── ANONİM: giriş çağrısı + kayıt formu (§2) ── */
        <div className="space-y-3">
          <div className="rounded-xl border border-dashed bg-white p-4 text-center shadow-sm dark:bg-card">
            <div className="mx-auto grid size-12 place-items-center rounded-full bg-muted">
              <Icons.UserRound className="size-6 text-muted-foreground" />
            </div>
            <p className="mt-2 text-xs font-semibold">{t("portalApp.profile.guestTitle")}</p>
            <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{t("portalApp.profile.guestDesc")}</p>
            <Button size="sm" className="mt-3" onClick={onGotoLogin}>
              <Icons.LogIn className="size-4" /> {t("portalApp.profile.guestLogin")}
            </Button>
          </div>
          {content.config?.allowRegistrationRedirect && (
            <button onClick={() => onOpenForm(content.config?.registrationFormId ?? null)} className="flex w-full items-center gap-3 rounded-xl border bg-white p-3 text-left shadow-sm dark:bg-card">
              <div className="grid size-10 shrink-0 place-items-center rounded-lg bg-teal-50 text-teal-700 dark:bg-teal-900/40 dark:text-teal-200">
                <Icons.UserPlus className="size-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold">{t("portalApp.profile.registerTitle")}</p>
                <p className="text-[11px] text-muted-foreground">{t("portalApp.profile.registerDesc")}</p>
              </div>
              <Icons.ChevronRight className="size-4 text-muted-foreground" />
            </button>
          )}
          <p className="px-1 text-[11px] leading-relaxed text-muted-foreground">{t("portalApp.profile.guestRights")}</p>
        </div>
      ) : (
        /* ── DOĞRULANMIŞ: bilet/kayıt + haklar + sponsorluk (§2) ── */
        <div className="space-y-3">
          <div className="rounded-xl border bg-white p-4 shadow-sm dark:bg-card">
            <div className="flex items-center gap-3">
              <div className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-full border bg-muted">
                {me?.person.photoUrl ? (
                  <img src={me.person.photoUrl} alt="" className="size-full object-cover" />
                ) : (
                  <span className="text-sm font-bold text-muted-foreground">
                    {`${me?.person.firstName ?? "?"} ${me?.person.lastName ?? ""}`.trim().split(" ").map((p) => p[0]).slice(0, 2).join("")}
                  </span>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold">{me ? `${me.person.firstName} ${me.person.lastName}` : "…"}</p>
                <p className="truncate text-[11px] text-muted-foreground">{[me?.person.title, me?.person.company].filter(Boolean).join(" · ") || me?.person.email || "—"}</p>
              </div>
              <span className="shrink-0 rounded-full px-2 py-0.5 text-[9px] font-medium" style={{ backgroundColor: `${accent}1a`, color: accent }}>{t("portalApp.badge.auth")}</span>
            </div>
            {meError && <p className="mt-2 text-[11px] text-red-600">{meError}</p>}
          </div>

          {/* bilet / kayıt bilgileri */}
          <div>
            <h3 className="mb-1.5 text-xs font-bold uppercase tracking-wide text-muted-foreground">{t("portalApp.profile.tickets")}</h3>
            {me && me.registrations.length === 0 && <EmptyMini text={t("portalApp.profile.noRegs")} />}
            <div className="space-y-2">
              {me?.registrations.map((r) => (
                <div key={r.id} className="rounded-xl border bg-white p-3 shadow-sm dark:bg-card">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-semibold">{r.confirmationNo ?? t("portalApp.profile.noConf")}</p>
                    <span className={cn("rounded-full px-2 py-0.5 text-[9px] font-medium", REG_STATUS_COLORS[r.status] ?? "bg-muted text-muted-foreground")}>
                      {t(`portalApp.regStatus.${r.status}`)}
                    </span>
                  </div>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    {[r.categoryName, r.basePrice > 0 ? fmtMoney(r.basePrice, r.currency) : null].filter(Boolean).join(" · ")}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* erişim hakları — roller + yaka */}
          {me?.participation && (me.participation.roles.length > 0 || me.participation.badges.length > 0) && (
            <div>
              <h3 className="mb-1.5 text-xs font-bold uppercase tracking-wide text-muted-foreground">{t("portalApp.profile.rights")}</h3>
              <div className="flex flex-wrap gap-1.5 rounded-xl border bg-white p-3 shadow-sm dark:bg-card">
                {me.participation.roles.map((r) => (
                  <span key={r} className="rounded-full bg-teal-50 px-2 py-0.5 text-[10px] font-medium text-teal-700 dark:bg-teal-900/40 dark:text-teal-200">{t(`portalApp.role.${r}`)}</span>
                ))}
                {me.participation.badges.map((b, i) => (
                  <span key={i} className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                    {t("portalApp.profile.badgeShort")}{b.badgeNo ? ` · ${b.badgeNo}` : ""}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* bağlı sponsorluk */}
          {me?.sponsorship && (
            <div className="flex items-center gap-3 rounded-xl border bg-white p-3 shadow-sm dark:bg-card">
              <div className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-lg border bg-muted">
                {me.sponsorship.logoUrl ? <img src={me.sponsorship.logoUrl} alt="" className="size-full object-contain p-0.5" /> : <Icons.Building2 className="size-4 text-muted-foreground" />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-semibold">{me.sponsorship.name}</p>
                {me.sponsorship.tierName && <p className="text-[10px] text-muted-foreground">{me.sponsorship.tierName}</p>}
              </div>
            </div>
          )}

          {/* bildirim tercihleri (§4.2) */}
          {content.config?.notifications.enabled && (
            <div className="rounded-xl border bg-white p-3 shadow-sm dark:bg-card">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-xs font-semibold">{t("portalApp.profile.notifTitle")}</p>
                  <p className="text-[11px] text-muted-foreground">{t("portalApp.profile.notifDesc", { offsets: content.config.notifications.offsets.join(", ") })}</p>
                </div>
                {notifState === "granted" ? (
                  <span className="flex items-center gap-1 rounded-full bg-teal-50 px-2 py-1 text-[10px] font-medium text-teal-700 dark:bg-teal-900/40 dark:text-teal-200">
                    <Icons.BellRing className="size-3" /> {t("portalApp.profile.notifOn")}
                  </span>
                ) : notifState === "denied" ? (
                  <span className="flex items-center gap-1 rounded-full bg-muted px-2 py-1 text-[10px] text-muted-foreground">
                    <Icons.BellOff className="size-3" /> {t("portalApp.profile.notifBlocked")}
                  </span>
                ) : (
                  <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => void askNotifications()}>
                    <Icons.Bell className="size-3" /> {t("portalApp.profile.notifEnable")}
                  </Button>
                )}
              </div>
            </div>
          )}

          {/* B2B kısayolu */}
          {(content.b2b?.length ?? 0) > 0 && (
            <button onClick={() => onNavigate("b2b")} className="flex w-full items-center gap-3 rounded-xl border bg-white p-3 text-left shadow-sm dark:bg-card">
              <div className="grid size-10 shrink-0 place-items-center rounded-lg" style={{ backgroundColor: `${accent}1a`, color: accent }}>
                <Icons.Handshake className="size-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold">{t("portalApp.widget.b2b")}</p>
                <p className="text-[11px] text-muted-foreground">{t("portalApp.widget.b2bSub", { count: content.b2b?.length ?? 0 })}</p>
              </div>
              <Icons.ChevronRight className="size-4 text-muted-foreground" />
            </button>
          )}

          {/* PWA kurulum */}
          {content.config?.pwaEnabled && canInstall && (
            <Button variant="outline" className="w-full" onClick={onInstall}>
              <Icons.Smartphone className="size-4" /> {t("portalApp.install.btn")}
            </Button>
          )}

          <Button variant="outline" className="w-full text-red-600 hover:text-red-700" onClick={onLogout}>
            <Icons.LogOut className="size-4" /> {t("portalApp.profile.logout")}
          </Button>
        </div>
      )}
    </ScreenShell>
  );
}

// ─── PORTAL-İÇİ FORM EKRANI (kullanıcı isteği: "Formlar acılınca header ve footer
// kayboluyor Kaybolmasın.") — form artık tam-sayfa ?form= yerine portal Shell'i içinde
// açılır: üst bant + kompakt event bar + alt menü GÖRÜNÜR kalır, geri butonlu.
function FormScreen({
  content,
  formRef,
  onBack,
  onSubmitted,
}: {
  content: PortalContent;
  formRef: string | null;
  onBack: () => void;
  onSubmitted?: (info: { status: string }) => void;
}) {
  const { t } = useLang();
  const form = (content.forms ?? []).find((f) => f.id === formRef || f.slug === formRef);
  if (!formRef) return <EmptyMini text={t("portalApp.forms.empty")} />;
  return (
    <ScreenShell title={form?.name ?? t("portalApp.form.title")} icon={<Icons.ClipboardList className="size-4" />} onBack={onBack}>
      <div className="-mx-1 overflow-hidden rounded-xl border bg-white shadow-sm dark:bg-card">
        <PublicFormPageLazy key={formRef} idOrSlug={formRef} embed onSubmitted={onSubmitted} />
      </div>
    </ScreenShell>
  );
}

// ─── OYUNLAŞTIRMA EKRANI (§ gamification — formlarla etkileşimli) ───────────
// Seviye kartı (Bronz→Elmas) + görev listesi (form gönderimi, Q&A, B2B) + liderlik
// tablosu + level-atlama konfetisi. Kullanıcı isteği: "mobil app gamification alanları
// düşünülsün modullerdeki formlar ile etkileşimli olsun."
function GameScreen({
  data,
  accent,
  confettiKey,
  onBack,
  onRefresh,
  onOpenForm,
  onNavigate,
}: {
  data: GameData | null;
  accent: string;
  confettiKey: number;
  onBack: () => void;
  onRefresh: () => void;
  onOpenForm: (id: string | null) => void;
  onNavigate: (s: string) => void;
}) {
  const { t } = useLang();
  if (!data) {
    return (
      <ScreenShell title={t("portalApp.game.title")} onBack={onBack} icon={<Icons.Trophy className="size-4" />}>
        <EmptyMini text={t("portalApp.game.disabled")} />
      </ScreenShell>
    );
  }
  return (
    <ScreenShell
      title={t("portalApp.game.title")}
      icon={<Icons.Trophy className="size-4" />}
      onBack={onBack}
      action={
        <button onClick={onRefresh} aria-label={t("portalApp.game.refresh")} className="grid size-8 place-items-center rounded-lg border bg-white shadow-sm transition hover:bg-muted active:scale-95 dark:bg-card">
          <Icons.RotateCcw className="size-4" />
        </button>
      }
    >
      {confettiKey > 0 && <Confetti key={confettiKey} accent={accent} />}

      {/* seviye kartı — ilerleme çubuğu + "kaç puan kaldı" teşviki */}
      <div className="relative overflow-hidden rounded-2xl border p-4 shadow-sm" style={{ background: `linear-gradient(135deg, ${accent}14, transparent 60%)` }}>
        <div className="flex items-center gap-3">
          <div className="grid size-14 shrink-0 place-items-center rounded-2xl text-white shadow-sm animate-[portal-pop-in_0.5s_ease-out]" style={{ backgroundColor: accent }}>
            <Icons.Trophy className="size-7" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{t("portalApp.game.currentLevel")}</p>
            <p className="text-lg font-bold leading-tight">{data.level}</p>
            <p className="text-xs text-muted-foreground">{t("portalApp.game.points", { points: data.points })}</p>
          </div>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={data.pct} aria-valuemin={0} aria-valuemax={100}>
          <div className="h-full w-full origin-left rounded-full transition-transform duration-500 ease-out" style={{ transform: `scaleX(${Math.min(100, Math.max(0, data.pct)) / 100})`, backgroundColor: accent }} />
        </div>
        {data.nextLevel ? (
          <div className="mt-2 flex items-center justify-between gap-2 text-[11px]">
            <span className="truncate text-muted-foreground">{t("portalApp.game.nextLevel", { level: data.nextLevel, min: data.nextLevelMin ?? 0 })}</span>
            <span className="shrink-0 font-semibold" style={{ color: accent }}>
              {t("portalApp.game.remaining", { points: Math.max(0, (data.nextLevelMin ?? 0) - data.points) })}
            </span>
          </div>
        ) : (
          <p className="mt-2 flex items-center justify-end gap-1 text-[11px] font-semibold" style={{ color: accent }}>
            <Icons.Medal className="size-3.5" /> {t("portalApp.game.maxLevel")}
          </p>
        )}
      </div>

      {/* görev listesi — tamamlanma sayacı + mini ilerleme çubukları */}
      <div>
        <h3 className="mb-1.5 mt-4 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
          {t("portalApp.game.quests")}
          {data.quests.length > 0 && (
            <span className="rounded-full px-2 py-px text-[10px] font-bold normal-case" style={{ backgroundColor: `${accent}1a`, color: accent }}>
              {t("portalApp.game.questsDone", { done: data.quests.filter((q) => q.done).length, total: data.quests.length })}
            </span>
          )}
        </h3>
        <div className="space-y-2" role="list">
          {data.quests.length === 0 && <EmptyMini text={t("portalApp.game.noQuests")} />}
          {data.quests.map((q) => {
            const isForm = q.kind === "FORM";
            const formId = isForm ? q.key.slice("form:".length) : null;
            const IconC = q.kind === "FORM" ? Icons.ClipboardList : q.kind === "QA" ? Icons.MessageCircleQuestion : Icons.Handshake;
            const questLabel = q.kind === "QA" ? t("portalApp.game.questQa") : q.kind === "B2B" ? t("portalApp.game.questB2b") : q.label;
            return (
              <div key={q.key} role="listitem">
              <button
                onClick={isForm && formId ? () => onOpenForm(formId) : q.kind === "QA" ? () => onNavigate("qa") : q.kind === "B2B" ? () => onNavigate("b2b") : undefined}
                className={cn(
                  "flex w-full items-center gap-3 rounded-xl border bg-white p-3 text-left shadow-sm transition active:scale-[0.98] dark:bg-card",
                  !q.done && "hover:border-teal-300",
                )}
              >
                <span
                  className={cn(
                    "grid size-9 shrink-0 place-items-center rounded-full",
                    q.done ? "text-white" : "bg-muted text-muted-foreground",
                  )}
                  style={q.done ? { backgroundColor: accent } : undefined}
                >
                  {q.done ? <Icons.Check className="size-4" /> : <IconC className="size-4" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className={cn("block truncate text-xs font-semibold", q.done && "line-through opacity-60")}>{questLabel}</span>
                  {typeof q.progress === "number" && typeof q.target === "number" && (
                    <span className="mt-1 flex items-center gap-1.5">
                      <span className="h-1 flex-1 overflow-hidden rounded-full bg-muted">
                        <span className="block h-full w-full origin-left rounded-full transition-transform duration-500 ease-out" style={{ transform: `scaleX(${Math.min(100, Math.round((q.progress / Math.max(1, q.target)) * 100)) / 100})`, backgroundColor: accent }} />
                      </span>
                      <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">{q.progress}/{q.target}</span>
                    </span>
                  )}
                </span>
                <span
                  className={cn(
                    "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold",
                    q.done ? "bg-muted text-muted-foreground line-through" : "",
                  )}
                  style={!q.done ? { backgroundColor: `${accent}1a`, color: accent } : undefined}
                >
                  +{q.points}
                </span>
              </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* liderlik tablosu — gizlilik maskeli adlar */}
      <div>
        <h3 className="mb-1.5 mt-4 text-xs font-bold uppercase tracking-wide text-muted-foreground">{t("portalApp.game.leaderboard")}</h3>
        <div className="overflow-hidden rounded-xl border bg-white shadow-sm dark:bg-card">
          {data.leaderboard.length === 0 ? (
            <p className="p-4 text-center text-xs text-muted-foreground">{t("portalApp.game.leaderEmpty")}</p>
          ) : (
            data.leaderboard.map((r) => (
              <div key={r.rank} className={cn("flex items-center gap-2.5 border-b px-3 py-2 last:border-b-0", r.you && "font-semibold")} style={r.you ? { backgroundColor: `${accent}0f` } : undefined}>
                <span className={cn("grid size-6 shrink-0 place-items-center rounded-full text-[10px] font-bold", r.rank <= 3 ? "text-white" : "bg-muted text-muted-foreground")} style={r.rank <= 3 ? { backgroundColor: accent } : undefined}>
                  {r.rank}
                </span>
                <Icons.Crown className={cn("size-3.5 shrink-0", r.rank === 1 ? "text-amber-500" : "opacity-0")} />
                <span className="min-w-0 flex-1 truncate text-xs">{r.name || (r.you && !data.isAuth ? t("portalApp.game.guest") : t("portalApp.game.anon"))}{r.you ? ` · ${t("portalApp.game.you")}` : ""}</span>
                <span className="shrink-0 text-xs font-bold tabular-nums">{r.points}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </ScreenShell>
  );
}

// konfeti — level atlama kutlaması (bağımlılık yok; saf CSS animasyonu)
function Confetti({ accent }: { accent: string }) {
  const dots = useMemo(() => {
    const colors = [accent, "#f59e0b", "#10b981", "#ef4444", "#8b5cf6", "#0ea5e9"];
    return Array.from({ length: 26 }, (_, i) => ({
      left: 4 + ((i * 37) % 92),
      color: colors[i % colors.length],
      dx: `${(i % 2 === 0 ? 1 : -1) * (8 + ((i * 13) % 30))}px`,
      rot: `${(i % 2 === 0 ? 1 : -1) * (120 + ((i * 29) % 240))}deg`,
      delay: (i % 7) * 40,
      size: 5 + (i % 3) * 2,
    }));
  }, [accent]);
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-50" aria-hidden="true">
      {dots.map((d, i) => (
        <span
          key={i}
          className="portal-confetti-dot absolute top-2 block rounded-[2px]"
          style={{
            left: `${d.left}%`,
            width: d.size,
            height: d.size,
            backgroundColor: d.color,
            ["--cx" as string]: d.dx,
            ["--cr" as string]: d.rot,
            animation: `portal-confetti-fall 1.1s ease-in ${d.delay}ms forwards`,
          }}
        />
      ))}
    </div>
  );
}

// ─── küçük parçalar ─────────────────────────────────────────────────────────
function ScreenShell({ title, icon: _icon, onBack, action, children }: { title: string; icon?: React.ReactNode; onBack?: () => void; action?: React.ReactNode; children: React.ReactNode }) {
  void _icon; // büyük-başlık düzeninde ikon gösterilmez (prop geriye-uyumluluk için durur)
  const { t } = useLang();
  return (
    <div>
      <div className="mb-4 flex items-center gap-2.5">
        {onBack && (
          <button onClick={() => { haptic.selection(); onBack(); }} aria-label={t("portalApp.back")} className="grid size-9 shrink-0 place-items-center rounded-full border bg-white shadow-sm transition hover:bg-muted active:scale-95 dark:bg-card">
            <Icons.ArrowLeft className="size-4" />
          </button>
        )}
        <h2 className="min-w-0 flex-1 truncate text-[22px] font-extrabold tracking-tight">{title}</h2>
        {action && <span className="shrink-0">{action}</span>}
      </div>
      {children}
    </div>
  );
}

function EmptyMini({ text }: { text: string }) {
  return (
    <div className="rounded-xl border border-dashed bg-white/60 p-6 text-center dark:bg-card/60">
      <Icons.Inbox className="mx-auto size-5 text-muted-foreground" />
      <p className="mt-1.5 text-xs text-muted-foreground">{text}</p>
    </div>
  );
}
