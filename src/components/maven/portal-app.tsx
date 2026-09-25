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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useLang, t } from "@/lib/i18n";
import { fmtDate, fmtDateTime, fmtMoney } from "@/lib/constants";
import { apiGet, apiSend } from "@/lib/client";
import { cn } from "@/lib/utils";

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
  counterpart: { name: string; company: string | null }[];
};
type OtherEvent = { id: string; slug: string; name: string; editionLabel: string | null; startDate: string | null; endDate: string | null; city: string | null; logoUrl: string | null; headerImageUrl: string | null };
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
  };
  otherEvents?: OtherEvent[];
  program?: ProgramItem[];
  speakers?: SpeakerItem[];
  sponsors?: SponsorItem[];
  forms?: { id: string; name: string; description: string | null; type: string; slug: string | null }[];
  announcements?: Announcement[];
  blocks?: { id: string; type: string; title: string; payloadJson: string | null }[];
  b2b?: B2bMeeting[];
  myQuestions?: { id: string; body: string; status: string; createdAt: string; programSessionId: string | null }[];
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

// portal POST yardımcısı — oturum başlığı taşır (apiSend header kabul etmediği için)
async function portalSend(path: string, body: unknown, sessionKey: string | null): Promise<unknown> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(sessionKey ? { "x-portal-session": sessionKey } : {}) },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `İşlem başarısız (${res.status})`);
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
function saveReminders(slug: string, items: MarkedReminder[]) {
  try {
    localStorage.setItem(remindersStorage(slug), JSON.stringify(items));
  } catch {
    /* yoksay */
  }
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
  const [screen, setScreen] = useState("home");
  const [fatal, setFatal] = useState<string | null>(null);
  const [sessionKey, setSessionKey] = useState<string | null>(null);
  const sessionRef = useRef<string | null>(null);

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

  const cfg = content?.config;

  // ── PWA: service worker + install prompt ──
  const [deferredPrompt, setDeferredPrompt] = useState<{ prompt: () => void } | null>(null);
  useEffect(() => {
    if (phase !== "ACTIVE") return;
    if (cfg?.pwaEnabled && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    }
    const onBip = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as unknown as { prompt: () => void });
    };
    window.addEventListener("beforeinstallprompt", onBip);
    return () => window.removeEventListener("beforeinstallprompt", onBip);
  }, [phase, cfg?.pwaEnabled]);

  const installApp = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    try {
      await portalSend("/api/portal/interact", { action: "PWA_INSTALL" }, sessionKey);
      toast({ title: t("portalApp.install.doneTitle"), description: t("portalApp.install.doneDesc") });
    } catch {
      /* analitik fire-and-forget */
    }
    setDeferredPrompt(null);
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
    if (phase !== "ACTIVE" || !cfg?.notifications.enabled || !content) return;
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
  }, [phase, cfg?.notifications.enabled, content, editionSlug, toast, t]);

  // ekranı bozmadan içeriği tazele (Q&A gönderimi sonrası vb.)
  const refreshContent = useCallback(async () => {
    try {
      const data = await fetchContent(sessionRef.current);
      setContent(data);
    } catch {
      /* sessiz — mevcut içerik kalır */
    }
  }, [fetchContent]);

  const openForm = async (formIdOrSlug: string | null) => {
    if (!formIdOrSlug) return;
    try {
      void portalSend("/api/portal/interact", { action: "FORM_OPEN" }, sessionKey);
    } catch {
      /* fire-and-forget */
    }
    window.location.href = `/?form=${encodeURIComponent(formIdOrSlug)}`;
  };

  const trackClick = (widgetKey: string) => {
    void portalSend("/api/portal/interact", { action: "WIDGET_CLICK", widgetKey }, sessionKey).catch(() => undefined);
  };

  const gotoScreen = (s: string) => {
    trackClick(s);
    setScreen(s);
    window.scrollTo({ top: 0 });
  };

  // ─── render dalları ───
  if (phase === "LOADING") {
    return (
      <div className="grid min-h-screen place-items-center bg-background">
        <div className="flex flex-col items-center gap-3" role="status" aria-label={t("portalApp.loading")}>
          <img src="/portal-icon-192.png" alt="" className="size-16 rounded-2xl shadow-sm" />
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Icons.Loader2 className="size-4 animate-spin" /> {t("portalApp.loading")}
          </div>
        </div>
      </div>
    );
  }

  if (phase === "ERROR") {
    return (
      <div className="grid min-h-screen place-items-center bg-background p-6">
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
  const visibleWidgets = cfg.widgets;
  const navItems: { key: string; label: string; icon: typeof Icons.Home }[] = [
    { key: "home", label: t("portalApp.nav.home"), icon: Icons.Home },
    ...(cfg.bottomNav.program !== false ? [{ key: "program", label: t("portalApp.nav.program"), icon: Icons.CalendarDays }] : []),
    ...(cfg.bottomNav.sponsors !== false ? [{ key: "sponsors", label: t("portalApp.nav.sponsors"), icon: Icons.Handshake }] : []),
    ...(cfg.bottomNav.map !== false && cfg.venueMap.enabled ? [{ key: "map", label: t("portalApp.nav.map"), icon: Icons.Map }] : []),
    { key: "profile", label: t("portalApp.nav.profile"), icon: Icons.UserRound },
  ];

  return (
    <div className="flex min-h-screen flex-col bg-muted/40" style={{ ["--portal-accent" as string]: accent }}>
      {/* ── Top Header (§3.1): organizatör + diğer etkinlikler carousel ── */}
      <div className="border-b bg-background">
        <div className="mx-auto w-full max-w-2xl px-4 pt-3">
          <div className="flex items-center gap-2">
            {content.tenant.logoUrl ? (
              <img src={content.tenant.logoUrl} alt={content.tenant.name} className="size-6 rounded-md object-contain" />
            ) : (
              <Icons.Building2 className="size-4 text-muted-foreground" />
            )}
            <span className="truncate text-xs font-medium text-muted-foreground">{content.tenant.name}</span>
            <span className="ml-auto rounded-full bg-teal-50 px-2 py-0.5 text-[10px] font-medium text-teal-700 dark:bg-teal-900/40 dark:text-teal-200">
              {kind === "AUTH" ? t("portalApp.badge.auth") : t("portalApp.badge.guest")}
            </span>
          </div>
          {(content.otherEvents?.length ?? 0) > 0 && (
            <div className="maven-scroll -mx-4 mt-2 flex gap-2 overflow-x-auto px-4 pb-2" role="list" aria-label={t("portalApp.otherEvents")}>
              {content.otherEvents!.map((e) => (
                <div key={e.id} className="w-44 shrink-0 rounded-lg border bg-muted/30 p-2" role="listitem">
                  <div className="flex items-center gap-1.5">
                    {e.logoUrl ? (
                      <img src={e.logoUrl} alt="" className="size-5 rounded object-contain" />
                    ) : (
                      <Icons.CalendarRange className="size-3.5 text-muted-foreground" />
                    )}
                    <span className="truncate text-[11px] font-medium">{e.name}</span>
                  </div>
                  <p className="mt-0.5 truncate text-[10px] text-muted-foreground">
                    {[e.city, e.startDate ? fmtDate(e.startDate) : null].filter(Boolean).join(" · ") || "—"}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Event Header (§3.1): banner + logo + ad + tarih ── */}
      <header className="relative overflow-hidden bg-background">
        {content.edition.headerImageUrl && (
          <div className="relative h-28 sm:h-36">
            <img src={content.edition.headerImageUrl} alt={`${content.edition.name} ${t("portalApp.bannerAlt")}`} className="absolute inset-0 size-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/55 to-transparent" />
          </div>
        )}
        <div className={cn("mx-auto w-full max-w-2xl px-4 pb-3", !content.edition.headerImageUrl && "pt-4")}>
          <div className="flex items-end gap-3">
            {/* yalnız logo banner'a bindirilir — başlık hiçbir genişlikte kesilmez */}
            <div className={cn("grid size-14 shrink-0 place-items-center overflow-hidden rounded-xl border bg-white shadow-sm dark:bg-card", content.edition.headerImageUrl && "-mt-7")}>
              {content.edition.logoUrl ? (
                <img src={content.edition.logoUrl} alt={`${content.edition.name} ${t("portalApp.logoAlt")}`} className="size-full object-contain p-1" />
              ) : (
                <Icons.CalendarRange className="size-6" style={{ color: accent }} />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-base font-bold">
                {content.edition.portalHeaderTitle || content.edition.name}
              </h1>
              <p className="truncate text-xs text-muted-foreground">
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

      {/* ── ana içerik (§3.2-§3.4 + §4) ── */}
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 pb-24 pt-3">
        {screen === "home" && (
          <HomeScreen
            content={content}
            kind={kind}
            accent={accent}
            deferredPrompt={deferredPrompt}
            onInstall={() => void installApp()}
            onNavigate={gotoScreen}
            onOpenForm={openForm}
          />
        )}
        {screen === "program" && <ProgramScreen content={content} onBack={() => setScreen("home")} sessionKey={sessionKey} />}
        {screen === "speakers" && <SpeakersScreen content={content} onBack={() => setScreen("home")} />}
        {screen === "sponsors" && <SponsorsScreen content={content} />}
        {screen === "map" && <VenueMapScreen content={content} />}
        {screen === "qa" && <QaScreen content={content} sessionKey={sessionKey} onSubmitted={() => void refreshContent()} />}
        {screen === "forms" && <FormsScreen content={content} onOpenForm={openForm} />}
        {screen === "b2b" && <B2bScreen content={content} sessionKey={sessionKey} onChanged={() => void bootstrap()} />}
        {screen === "profile" && (
          <ProfileScreen
            content={content}
            kind={kind}
            accent={accent}
            onLogout={() => {
              clearSession(editionSlug);
              sessionRef.current = null;
              setSessionKey(null);
              setKind(null);
              setScreen("home");
              void bootstrap();
            }}
            onNavigate={gotoScreen}
            onOpenForm={openForm}
            onGotoLogin={() => {
              clearSession(editionSlug);
              sessionRef.current = null;
              setSessionKey(null);
              setKind(null);
              setPhase("LOGIN");
            }}
            deferredPrompt={deferredPrompt}
            onInstall={() => void installApp()}
          />
        )}
      </main>

      {/* ── Sabit Alt Menü (§3.3) ── */}
      <nav
        className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        aria-label={t("portalApp.nav.aria")}
      >
        <div className="mx-auto flex w-full max-w-2xl">
          {navItems.map((n) => {
            const I = n.icon;
            const active = screen === n.key || (n.key === "home" && ["speakers", "qa", "forms", "b2b"].includes(screen));
            return (
              <button
                key={n.key}
                onClick={() => setScreen(n.key)}
                className={cn(
                  "flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px] font-medium transition-colors min-h-[44px] justify-center",
                  active ? "text-primary" : "text-muted-foreground hover:text-foreground",
                )}
                aria-current={active ? "page" : undefined}
              >
                <I className={cn("size-5", active && "stroke-[2.4]")} />
                {n.label}
              </button>
            );
          })}
        </div>
      </nav>
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

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-b from-teal-50 to-background">
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col px-5 py-8">
        <div className="text-center">
          {content.edition.headerImageUrl ? (
            <img src={content.edition.headerImageUrl} alt="" className="mx-auto h-28 w-full rounded-2xl object-cover shadow-sm" />
          ) : null}
          <div className={cn("mx-auto -mt-6 grid size-14 place-items-center overflow-hidden rounded-xl border bg-white shadow-sm", !content.edition.headerImageUrl && "mt-0")}>
            {content.edition.logoUrl ? (
              <img src={content.edition.logoUrl} alt="" className="size-full object-contain p-1" />
            ) : (
              <Icons.CalendarRange className="size-6 text-teal-600" />
            )}
          </div>
          <h1 className="mt-3 text-lg font-bold">{content.edition.portalHeaderTitle || content.edition.name}</h1>
          <p className="mt-1 text-xs text-muted-foreground">
            {[content.edition.startDate ? fmtDate(content.edition.startDate) : null, content.edition.city].filter(Boolean).join(" · ")}
          </p>
        </div>

        <div className="mt-6 rounded-2xl border bg-white p-4 shadow-sm dark:bg-card">
          <div className="mb-3 flex rounded-lg bg-muted p-1" role="tablist" aria-label={t("portalApp.login.methodAria")}>
            <button
              role="tab"
              aria-selected={mode === "CODE"}
              onClick={() => setMode("CODE")}
              className={cn("flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition", mode === "CODE" ? "bg-background shadow-sm" : "text-muted-foreground")}
            >
              {t("portalApp.login.codeTab")}
            </button>
            <button
              role="tab"
              aria-selected={mode === "EMAIL"}
              onClick={() => setMode("EMAIL")}
              disabled={!opts.emailLogin}
              className={cn("flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition disabled:opacity-40", mode === "EMAIL" ? "bg-background shadow-sm" : "text-muted-foreground")}
            >
              {t("portalApp.login.emailTab")}
            </button>
          </div>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="p-code">{t("portalApp.login.codeLabel")}</Label>
              <Input
                id="p-code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="ABC123"
                autoCapitalize="characters"
                autoComplete="off"
                className="text-center font-mono text-base uppercase tracking-widest"
              />
            </div>
            {mode === "EMAIL" && (
              <div className="space-y-1.5">
                <Label htmlFor="p-email">{t("portalApp.login.emailLabel")}</Label>
                <Input
                  id="p-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={t("portalApp.login.emailPh")}
                  autoComplete="email"
                  inputMode="email"
                />
              </div>
            )}
            <Button className="w-full" onClick={() => void submit()} disabled={busy || !code.trim() || (mode === "EMAIL" && !email.trim())}>
              {busy ? <Icons.Loader2 className="size-4 animate-spin" /> : <Icons.LogIn className="size-4" />}
              {t("portalApp.login.submit")}
            </Button>
            <p className="text-center text-[11px] leading-relaxed text-muted-foreground">
              {mode === "EMAIL"
                ? t("portalApp.login.emailHint")
                : t("portalApp.login.codeHint")}
            </p>
          </div>
        </div>

        {/* §2 Anonim oturum mantığı: kayıt yönlendirmesi */}
        {opts.allowRegistrationRedirect && (
          <div className="mt-4 rounded-2xl border border-dashed bg-white/60 p-4 text-center dark:bg-card/60">
            <p className="text-xs text-muted-foreground">{t("portalApp.login.registerHint")}</p>
            <Button variant="outline" size="sm" className="mt-2" onClick={() => onOpenForm(opts.registrationFormId)} disabled={!opts.registrationFormId}>
              <Icons.UserPlus className="size-4" /> {t("portalApp.login.registerBtn")}
            </Button>
          </div>
        )}

        <p className="mt-auto pt-6 text-center text-[11px] text-muted-foreground">{content.tenant.name} · {t("portalApp.login.poweredBy")}</p>
      </div>
    </div>
  );
}

// ─── ANASAYFA — Dashboard Grid (§3.2) ───────────────────────────────────────
function HomeScreen({
  content,
  kind,
  accent,
  deferredPrompt,
  onInstall,
  onNavigate,
  onOpenForm,
}: {
  content: PortalContent;
  kind: "GUEST" | "AUTH" | null;
  accent: string;
  deferredPrompt: { prompt: () => void } | null;
  onInstall: () => void;
  onNavigate: (s: string) => void;
  onOpenForm: (id: string | null) => void;
}) {
  const { t } = useLang();
  const cfg = content.config!;
  const program = content.program ?? [];
  const nextSession = program.find((s) => new Date(s.startTime).getTime() > Date.now());
  const announcement = content.announcements?.[0];
  const [dismissed, setDismissed] = useState<string | null>(null);

  const widgets = cfg.widgets;
  const WIDGET_META: Record<string, { label: string; icon: typeof Icons.Home; sub: string; target: string }> = {
    agenda: { label: t("portalApp.widget.agenda"), icon: Icons.CalendarDays, sub: nextSession ? fmtDateTime(nextSession.startTime) : t("portalApp.widget.agendaEmpty"), target: "program" },
    speakers: { label: t("portalApp.widget.speakers"), icon: Icons.Mic2, sub: t("portalApp.widget.speakersSub", { count: content.speakers?.length ?? 0 }), target: "speakers" },
    forms: { label: t("portalApp.widget.forms"), icon: Icons.ClipboardList, sub: t("portalApp.widget.formsSub", { count: content.forms?.length ?? 0 }), target: "forms" },
    qa: { label: t("portalApp.widget.qa"), icon: Icons.MessageCircleQuestion, sub: t("portalApp.widget.qaSub"), target: "qa" },
    map: { label: t("portalApp.widget.map"), icon: Icons.Map, sub: content.edition.venueName ?? t("portalApp.widget.mapSub"), target: "map" },
    b2b: { label: t("portalApp.widget.b2b"), icon: Icons.Handshake, sub: t("portalApp.widget.b2bSub", { count: content.b2b?.length ?? 0 }), target: "b2b" },
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
          <button onClick={() => setDismissed(announcement.id)} aria-label={t("portalApp.announce.dismiss")} className="rounded p-0.5 text-muted-foreground hover:text-foreground">
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

      {/* widget grid — admin sırası ile */}
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3" role="list" aria-label={t("portalApp.widget.aria")}>
        {widgets.map((w) => {
          const meta = WIDGET_META[w.key];
          if (!meta) return null;
          const I = meta.icon;
          return (
            <button
              key={w.key}
              role="listitem"
              onClick={() => onNavigate(meta.target)}
              className="group flex min-h-[92px] flex-col items-start gap-1.5 rounded-xl border bg-white p-3 text-left shadow-sm transition hover:border-teal-300 hover:shadow dark:bg-card"
            >
              <span className="grid size-8 place-items-center rounded-lg text-white" style={{ backgroundColor: accent }}>
                <I className="size-4" />
              </span>
              <span className="text-xs font-semibold leading-tight">{meta.label}</span>
              <span className="line-clamp-2 text-[10px] text-muted-foreground">{meta.sub}</span>
              {w.visibility === "AUTH" && kind === "AUTH" && (
                <span className="mt-auto rounded-full bg-teal-50 px-1.5 py-0.5 text-[9px] font-medium text-teal-700 dark:bg-teal-900/40 dark:text-teal-200">{t("portalApp.widget.authOnly")}</span>
              )}
            </button>
          );
        })}
      </div>

      {/* yaklaşan oturum şeridi */}
      {nextSession && (
        <button onClick={() => onNavigate("program")} className="flex w-full items-center gap-3 rounded-xl border bg-white p-3 text-left shadow-sm dark:bg-card">
          <div className="grid size-10 shrink-0 place-items-center rounded-lg bg-teal-50 text-teal-700 dark:bg-teal-900/40 dark:text-teal-200">
            <Icons.Clock className="size-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{t("portalApp.home.upNext")}</p>
            <p className="truncate text-xs font-semibold">{nextSession.title}</p>
            <p className="truncate text-[11px] text-muted-foreground">
              {fmtDateTime(nextSession.startTime)}{nextSession.room ? ` · ${nextSession.room}` : ""}
            </p>
          </div>
          <Icons.ChevronRight className="size-4 shrink-0 text-muted-foreground" />
        </button>
      )}

      {/* PWA kurulum kartı */}
      {cfg.pwaEnabled && deferredPrompt && (
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
function ProgramScreen({ content, onBack, sessionKey }: { content: PortalContent; onBack: () => void; sessionKey: string | null }) {
  const { t } = useLang();
  const { toast } = useToast();
  const [open, setOpen] = useState<string | null>(null);
  const program = content.program ?? [];
  const slug = content.edition.slug;
  const reminders = loadReminders(slug);

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

  if (program.length === 0) {
    return <ScreenShell title={t("portalApp.program.title")} onBack={onBack} icon={<Icons.CalendarDays className="size-4" />}>
      <EmptyMini text={t("portalApp.program.empty")} />
    </ScreenShell>;
  }

  return (
    <ScreenShell title={t("portalApp.program.title")} onBack={onBack} icon={<Icons.CalendarDays className="size-4" />}>
      <div className="space-y-4">
        {byDay.map(([day, items]) => (
          <div key={day}>
            <div className="sticky top-0 z-10 -mx-1 bg-muted/40 px-1 py-1.5 backdrop-blur-sm">
              <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{day}</h3>
            </div>
            <div className="mt-2 space-y-2">
              {items.map((s) => {
                const expanded = open === s.id;
                const reminded = reminders.some((r) => r.key === `session:${s.id}`);
                return (
                  <div key={s.id} className="overflow-hidden rounded-xl border bg-white shadow-sm dark:bg-card">
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
                          <span className={cn("rounded-full px-1.5 py-0.5 text-[9px] font-medium", SESSION_TYPE_COLORS[s.type] ?? "bg-muted text-muted-foreground")}>
                            {t(`portalApp.sessionType.${s.type}`)}
                          </span>
                          {s.room && <span className="rounded-full bg-muted px-1.5 py-0.5 text-[9px] text-muted-foreground">{s.room}</span>}
                          {s.track && <span className="rounded-full bg-muted px-1.5 py-0.5 text-[9px] text-muted-foreground">{s.track}</span>}
                        </div>
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
                        <Button
                          size="sm"
                          variant={reminded ? "secondary" : "outline"}
                          className="mt-2 h-7 text-[11px]"
                          onClick={() => toggleReminder(s)}
                        >
                          {reminded ? <Icons.BellRing className="size-3" /> : <Icons.Bell className="size-3" />}
                          {reminded ? t("portalApp.reminder.remove") : t("portalApp.reminder.add")}
                        </Button>
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
function SpeakersScreen({ content, onBack }: { content: PortalContent; onBack: () => void }) {
  const { t } = useLang();
  const [selected, setSelected] = useState<string | null>(null);
  const speakers = content.speakers ?? [];
  const current = speakers.find((s) => s.personId === selected);

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
          {speakers.map((s) => (
            <button key={s.personId} role="listitem" onClick={() => setSelected(s.personId)} className="flex w-full items-center gap-3 rounded-xl border bg-white p-3 text-left shadow-sm transition hover:border-teal-300 dark:bg-card">
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
          ))}
        </div>
      )}
    </ScreenShell>
  );
}

// ─── SPONSORLAR (§3.3 nav-3) ────────────────────────────────────────────────
function SponsorsScreen({ content }: { content: PortalContent }) {
  const { t } = useLang();
  const sponsors = content.sponsors ?? [];
  const tiers = useMemo(() => {
    const map = new Map<string, SponsorItem[]>();
    for (const s of sponsors) {
      const tier = s.tierName ?? t("portalApp.sponsors.untiered");
      const arr = map.get(tier) ?? [];
      arr.push(s);
      map.set(tier, arr);
    }
    return [...map.entries()];
  }, [sponsors, t]);

  return (
    <ScreenShell title={t("portalApp.sponsors.title")} icon={<Icons.Handshake className="size-4" />}>
      {sponsors.length === 0 ? (
        <EmptyMini text={t("portalApp.sponsors.empty")} />
      ) : (
        <div className="space-y-4">
          {tiers.map(([tier, items]) => (
            <div key={tier}>
              <h3 className="mb-1.5 text-xs font-bold uppercase tracking-wide text-muted-foreground">{tier}</h3>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {items.map((s) => (
                  <div key={s.organizationId} className="rounded-xl border bg-white p-3 shadow-sm dark:bg-card">
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
                    </div>
                    {s.description && <p className="mt-2 line-clamp-2 text-[11px] text-muted-foreground">{s.description}</p>}
                    {s.website && (
                      <a href={s.website.startsWith("http") ? s.website : `https://${s.website}`} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1 text-[11px] font-medium text-teal-700 hover:underline dark:text-teal-300">
                        <Icons.ExternalLink className="size-3" /> {t("portalApp.sponsors.website")}
                      </a>
                    )}
                  </div>
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
function VenueMapScreen({ content }: { content: PortalContent }) {
  const { t } = useLang();
  const map = content.config!.venueMap;
  return (
    <ScreenShell title={t("portalApp.map.title")} icon={<Icons.Map className="size-4" />}>
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
function QaScreen({ content, sessionKey, onSubmitted }: { content: PortalContent; sessionKey: string | null; onSubmitted?: () => void }) {
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
      await portalSend(
        "/api/portal/interact",
        {
          action: "QA_SUBMIT",
          programSessionId: sessionId === "general" ? undefined : sessionId,
          body: body.trim(),
          isAnonymous: anon,
          displayName: name.trim() || undefined,
        },
        sessionKey,
      );
      setBody("");
      toast({ title: t("portalApp.qa.sent"), description: t("portalApp.qa.sentDesc") });
      onSubmitted?.(); // ekran korunur, soru listesi tazelenir
    } catch (e) {
      toast({ title: t("portalApp.qa.fail"), description: e instanceof Error ? e.message : undefined, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScreenShell title={t("portalApp.qa.title")} icon={<Icons.MessageCircleQuestion className="size-4" />}>
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
function FormsScreen({ content, onOpenForm }: { content: PortalContent; onOpenForm: (id: string | null) => void }) {
  const { t } = useLang();
  const forms = content.forms ?? [];
  return (
    <ScreenShell title={t("portalApp.forms.title")} icon={<Icons.ClipboardList className="size-4" />}>
      {forms.length === 0 ? (
        <EmptyMini text={t("portalApp.forms.empty")} />
      ) : (
        <div className="space-y-2" role="list">
          {forms.map((f) => (
            <button key={f.id} role="listitem" onClick={() => onOpenForm(f.slug ?? f.id)} className="flex w-full items-center gap-3 rounded-xl border bg-white p-3 text-left shadow-sm transition hover:border-teal-300 dark:bg-card">
              <div className="grid size-10 shrink-0 place-items-center rounded-lg bg-teal-50 text-teal-700 dark:bg-teal-900/40 dark:text-teal-200">
                <Icons.FileText className="size-5" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-semibold">{f.name}</p>
                {f.description && <p className="line-clamp-1 text-[11px] text-muted-foreground">{f.description}</p>}
              </div>
              <Icons.ExternalLink className="size-4 shrink-0 text-muted-foreground" />
            </button>
          ))}
        </div>
      )}
    </ScreenShell>
  );
}

// ─── B2B GÖRÜŞMELER (§4.1 — yalnız AUTH) ────────────────────────────────────
function B2bScreen({ content, sessionKey, onChanged }: { content: PortalContent; sessionKey: string | null; onChanged: () => void }) {
  const { t } = useLang();
  const { toast } = useToast();
  const meetings = content.b2b ?? [];
  const [resched, setResched] = useState<B2bMeeting | null>(null);
  const [note, setNote] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  if (content.session?.kind !== "AUTH") {
    return (
      <ScreenShell title={t("portalApp.b2b.title")} icon={<Icons.Handshake className="size-4" />}>
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-center dark:border-amber-900 dark:bg-amber-950/40">
          <Icons.Lock className="mx-auto size-5 text-amber-600" />
          <p className="mt-1.5 text-xs font-medium">{t("portalApp.b2b.authOnly")}</p>
          <p className="mt-1 text-[11px] text-muted-foreground">{t("portalApp.b2b.authOnlyDesc")}</p>
        </div>
      </ScreenShell>
    );
  }

  const respond = async (m: B2bMeeting, response: "ACCEPTED" | "DECLINED" | "RESCHEDULE", extra?: string) => {
    if (!sessionKey) return;
    setBusyId(m.assignmentId);
    try {
      await portalSend("/api/portal/interact", { action: "B2B_RESPOND", assignmentId: m.assignmentId, response, note: extra }, sessionKey);
      toast({ title: t(`portalApp.b2b.done.${response}`) });
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
    <ScreenShell title={t("portalApp.b2b.title")} icon={<Icons.Handshake className="size-4" />}>
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
                <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[9px] font-medium",
                  m.status === "ACCEPTED" || m.status === "COMPLETED" ? "bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-200" : m.status === "DECLINED" ? "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-200" : "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200")}>
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
  onLogout,
  onNavigate,
  onOpenForm,
  onGotoLogin,
  deferredPrompt,
  onInstall,
}: {
  content: PortalContent;
  kind: "GUEST" | "AUTH" | null;
  accent: string;
  onLogout: () => void;
  onNavigate: (s: string) => void;
  onOpenForm: (id: string | null) => void;
  onGotoLogin: () => void;
  deferredPrompt: { prompt: () => void } | null;
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
    <ScreenShell title={t("portalApp.profile.title")} icon={<Icons.UserRound className="size-4" />}>
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
              <span className="shrink-0 rounded-full bg-teal-100 px-2 py-0.5 text-[9px] font-medium text-teal-800 dark:bg-teal-900/40 dark:text-teal-200">{t("portalApp.badge.auth")}</span>
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
          {content.config?.pwaEnabled && deferredPrompt && (
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

// ─── küçük parçalar ─────────────────────────────────────────────────────────
function ScreenShell({ title, icon, onBack, children }: { title: string; icon?: React.ReactNode; onBack?: () => void; children: React.ReactNode }) {
  const { t } = useLang();
  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        {onBack && (
          <button onClick={onBack} aria-label={t("portalApp.back")} className="grid size-8 shrink-0 place-items-center rounded-lg border bg-white shadow-sm transition hover:bg-muted dark:bg-card">
            <Icons.ArrowLeft className="size-4" />
          </button>
        )}
        {icon}
        <h2 className="text-sm font-bold">{title}</h2>
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
