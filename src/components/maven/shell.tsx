"use client";
// Kabuk: sidebar (§53 modül menüsü — yetenek kapalıysa VE rol kapalıysa gizli, UI-AKIS 2026
// 7 sektör-yaşam-döngüsü grubu), üst şerit (bağlam seçici + oturum kimliği), footer
import { useApp, hasCapability } from "@/lib/store";
import { MODULES, MODULE_GROUPS, roleCanSee, EDITION_STATUS, label, fmtDate } from "@/lib/constants";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Separator } from "@/components/ui/separator";
import * as Icons from "lucide-react";
import { cn } from "@/lib/utils";
import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { NotificationBell } from "./notification-bell";
import { useLang, t } from "@/lib/i18n";

type ThemeOption = "light" | "system" | "dark";

// Üst şerit tema seçici: açık/sistem/koyu. Seçim next-themes'e + SSR çerezine
// yazılır (PATCH /api/account/theme) — yenilemede tercih korunur. Kayıtlı
// tercih yoksa kök yerleşim AÇIK temayı varsayar.
function ThemeSwitcher() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  const pick = (value: ThemeOption) => {
    setTheme(value);
    fetch("/api/account/theme", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ theme: value }),
    }).catch(() => { /* çevrimdışı: yalnız oturum tercihi yaşar */ });
  };
  const current: ThemeOption = mounted && (theme === "dark" || theme === "system" || theme === "light") ? theme : "light";
  const options: Array<{ value: ThemeOption; label: string; Icon: Icons.LucideIcon }> = [
    { value: "light", label: t("shell.themeLight"), Icon: Icons.Sun },
    { value: "system", label: t("shell.themeSystem"), Icon: Icons.Monitor },
    { value: "dark", label: t("shell.themeDark"), Icon: Icons.Moon },
  ];
  return (
    <div role="group" aria-label={t("shell.themeLabel")} className="flex items-center rounded-md border p-0.5">
      {options.map(({ value, label, Icon }) => (
        <Button
          key={value}
          variant="ghost"
          size="icon"
          className={cn("size-8", current === value && "bg-muted text-foreground shadow-none")}
          aria-label={label}
          aria-pressed={current === value}
          title={label}
          onClick={() => pick(value)}
        >
          <Icon className="size-4" />
        </Button>
      ))}
    </div>
  );
}

function ModuleIcon({ name, className }: { name: string; className?: string }) {
  const Icon = (Icons as unknown as Record<string, Icons.LucideIcon>)[name] ?? Icons.Circle;
  return <Icon className={className} />;
}

function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const { module, setModule, editions, currentEditionId, tenant, me } = useApp();
  const edition = editions.find((e) => e.id === currentEditionId);
  const role = me?.role ?? null;

  return (
    <nav aria-label={t("shell.srMenu")} className="flex h-full flex-col gap-1 overflow-y-auto maven-scroll px-3 py-4">
      {/* Faz C: firma kimliği — logoUrl varsa görsel, yoksa "M"; alt yazı tagline */}
      <div className="mb-2 flex items-center gap-2 px-2">
        {tenant?.logoUrl ? (
          <img
            src={tenant.logoUrl}
            alt={`${tenant.name} logosu`}
            className="size-8 shrink-0 rounded-lg border border-sidebar-border/60 object-cover"
          />
        ) : (
          <div className="grid size-8 place-items-center rounded-lg bg-primary font-bold text-primary-foreground">M</div>
        )}
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold leading-none">{tenant?.name ?? "Maven"}</p>
          <p className="truncate text-[11px] text-sidebar-foreground/60">{tenant?.tagline?.trim() || t("shell.defaultTagline")}</p>
        </div>
      </div>
      <Separator className="bg-sidebar-border/60" />
      {/* UI-AKIS 2026: 7 sektör-yaşam-döngüsü grubu — Genel Takış → Kurulum → CRM &
          İletişim → Kayıt & Finans → Bilimsel & Program → Sponsor & Katılım →
          Konaklama & Saha. Görünürlük: yetenek + ROL matrisi (§48). */}
      {MODULE_GROUPS.map((g) => {
        const items = MODULES.filter(
          (m) => m.group === g.id && visibleFor(m.capability, edition) && roleCanSee(m, role),
        );
        if (items.length === 0) return null;
        const GroupIcon = (Icons as unknown as Record<string, Icons.LucideIcon>)[g.icon] ?? Icons.Circle;
        return (
          <div key={g.id} className="mt-3">
            <p className="flex items-center gap-1.5 px-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-sidebar-foreground/70">
              <GroupIcon className="size-3" aria-hidden /> {t(g.labelKey)}
            </p>
            {items.map((m) => (
              <button
                key={m.id}
                onClick={() => { setModule(m.id); onNavigate?.(); }}
                aria-current={module === m.id ? "page" : undefined}
                className={cn(
                  "group relative flex w-full items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-primary/40",
                  module === m.id
                    ? "bg-sidebar-primary/15 font-medium text-sidebar-primary"
                    : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground hover:pl-3"
                )}
              >
                {/* aktif modül göstergesi — sol kenarda teal vurgu çubuğu */}
                <span
                  aria-hidden
                  className={cn(
                    "absolute left-0 top-1/2 h-4 w-[3px] -translate-y-1/2 rounded-r-full bg-primary transition-all duration-200",
                    module === m.id ? "scale-y-100 opacity-100" : "scale-y-0 opacity-0"
                  )}
                />
                <ModuleIcon
                  name={m.icon}
                  className={cn(
                    "size-4 shrink-0 transition-transform duration-150",
                    module === m.id ? "text-sidebar-primary" : "group-hover:scale-110"
                  )}
                />
                <span className="truncate">{t(`modules.${m.id}`)}</span>
              </button>
            ))}
          </div>
        );
      })}
      <div className="mt-auto rounded-lg border border-sidebar-border/60 bg-gradient-to-br from-sidebar-accent/60 to-sidebar-accent/20 p-3 text-[11px] leading-relaxed text-sidebar-foreground/70">
        <p className="flex items-center gap-1.5 font-semibold text-sidebar-foreground/90"><Icons.Shapes className="size-3.5 text-primary" /> {t("shell.archTitle")}</p>
        <p className="mt-1">{t("shell.archDesc")}</p>
      </div>
    </nav>
  );
}

function visibleFor(capability: string | null | undefined, edition: ReturnType<typeof currentEditionOf>) {
  if (!capability) return true;
  if (!edition) return false;
  return hasCapability(edition, capability);
}

function currentEditionOf() {
  // yardımcı — tip için
  return useApp.getState().editions.find((e) => e.id === useApp.getState().currentEditionId);
}

export function Shell({ children }: { children: React.ReactNode }) {
  const { tenant, editions, currentEditionId, setCurrentEdition, module, loading, error, bootstrap, seed, modelCount, me } = useApp();
  const { lang, setLang: setUiLang } = useLang();
  const edition = editions.find((e) => e.id === currentEditionId);
  const activeModule = MODULES.find((m) => m.id === module);

  // mobil menü
  const [open, setOpen] = useState(false);

  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex min-h-screen flex-col">
        {/* Üst şerit (§03): Çalışma alanı > Seri > Edisyon */}
        <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
          <div className="flex h-14 items-center gap-3 px-4">
            <Sheet open={open} onOpenChange={setOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="lg:hidden" aria-label={t("shell.openMenu")}>
                  <Icons.Menu className="size-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-72 bg-sidebar p-0 text-sidebar-foreground">
                <SheetTitle className="sr-only">{t("shell.srMenu")}</SheetTitle>
                <SidebarNav onNavigate={() => setOpen(false)} />
              </SheetContent>
            </Sheet>

            <div className="hidden items-center gap-1.5 text-sm text-muted-foreground lg:flex">
              <span className="font-medium text-foreground">{tenant?.name ?? t("shell.workspace")}</span>
              <Icons.ChevronRight className="size-3.5" />
              {edition?.series?.name && (
                <>
                  <span>{edition.series.name}</span>
                  <Icons.ChevronRight className="size-3.5" />
                </>
              )}
              <span className="font-medium text-foreground">{edition?.name ?? "Edisyon seçin"}</span>
            </div>

            <div className="ml-auto flex items-center gap-2">
              <ThemeSwitcher />
              {/* Faz E: mini dil butonu — TR/EN tek tıkla değişir */}
              <Button
                variant="outline"
                size="sm"
                className="h-9 w-[52px] px-0 font-semibold tabular-nums"
                aria-label={lang === "tr" ? "Switch to English" : "Türkçe'ye geç"}
                onClick={() => setUiLang(lang === "tr" ? "en" : "tr")}
              >
                {lang === "tr" ? "EN" : "TR"}
              </Button>
              <Select
                value={currentEditionId ?? ""}
                onValueChange={(v) => {
                  setCurrentEdition(v);
                  try { window.localStorage.setItem("maven.edition", v); } catch { /* yoksay */ }
                }}
              >
                <SelectTrigger className="h-9 w-[110px] gap-1 sm:w-[220px] sm:gap-2" aria-label={t("shell.selectEditionAria")}>
                  <SelectValue placeholder={t("shell.selectEdition")} />
                </SelectTrigger>
                <SelectContent>
                  {editions.map((e) => (
                    <SelectItem key={e.id} value={e.id}>
                      <span className="flex items-center gap-2">
                        <span className="relative flex size-2">
                          {e.status === "ONSITE" && (
                            <span aria-hidden className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                          )}
                          <span className={cn("relative inline-flex size-2 rounded-full", e.isPublished ? "bg-emerald-500" : "bg-amber-500")} />
                        </span>
                        {e.name}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {edition && (
                <Badge variant="outline" className="hidden gap-1.5 sm:flex">
                  <span className="relative flex size-1.5">
                    {edition.status === "ONSITE" && (
                      <span aria-hidden className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                    )}
                    <span className={cn("relative inline-flex size-1.5 rounded-full", edition.isPublished ? "bg-emerald-500" : "bg-amber-500")} />
                  </span>
                  {label(EDITION_STATUS, edition.status)}
                </Badge>
              )}
              <Button variant="ghost" size="icon" aria-label={t("shell.refresh")} onClick={() => bootstrap()} disabled={loading}>
                <Icons.RefreshCw className={cn("size-4", loading && "animate-spin text-primary")} />
              </Button>
              <NotificationBell />
              {/* UI-AKIS 2026: oturum kimliği — ad baş harfleri + rol etiketi;
                  oturum yoksa (auth-off/serbest mod) nötr gösterge */}
              {me?.authenticated ? (
                <div className="flex items-center gap-2">
                  <span className="hidden max-w-36 truncate text-xs text-muted-foreground xl:inline">{me.name}</span>
                  <Badge variant="outline" className="hidden gap-1 md:flex">
                    <Icons.ShieldCheck className="size-3 text-primary" aria-hidden />
                    {t(`staffRole.${me.role ?? ""}`)}
                  </Badge>
                  <Avatar className="size-8">
                    <AvatarFallback className="bg-primary/15 text-xs font-semibold text-primary">
                      {(me.name ?? "?")
                        .split(" ")
                        .map((p) => p.slice(0, 1).toLocaleUpperCase("tr-TR"))
                        .slice(0, 2)
                        .join("") || "?"}
                    </AvatarFallback>
                  </Avatar>
                </div>
              ) : (
                <Badge variant="outline" className="gap-1" title={t("shell.freeModeHint")}>
                  <Icons.Unlock className="size-3 text-amber-500" aria-hidden />
                  <span className="hidden sm:inline">{t("shell.freeMode")}</span>
                </Badge>
              )}
            </div>
          </div>
          {edition && (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t bg-muted/40 px-4 py-1.5 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1"><Icons.CalendarDays className="size-3.5" /> {fmtDate(edition.startDate)} — {fmtDate(edition.endDate)}</span>
              {edition.venueName && <span className="inline-flex items-center gap-1"><Icons.MapPin className="size-3.5" /> {edition.venueName}{edition.city ? `, ${edition.city}` : ""}</span>}
              <span className="inline-flex items-center gap-1"><Icons.Globe2 className="size-3.5" /> {tenant?.timezone}</span>
              <span className="ml-auto hidden md:inline">{t("shell.editionHint")}</span>
            </div>
          )}
        </header>

        <div className="flex flex-1">
          <aside className="sticky top-14 hidden h-[calc(100vh-3.5rem)] w-60 shrink-0 border-r bg-sidebar text-sidebar-foreground lg:block">
            <SidebarNav />
          </aside>

          <main className="min-w-0 flex-1 p-4 md:p-6" aria-label={activeModule?.label}>
            {/* modül geçişinde yumuşak fade/slide — key sayesinde her geçişte tetiklenir */}
            <div key={module} className="animate-in fade-in slide-in-from-bottom-2 duration-300">
            {loading ? (
              <div className="grid min-h-[60vh] place-items-center">
                <div className="flex flex-col items-center gap-3 text-muted-foreground">
                  <Icons.Loader2 className="size-8 animate-spin text-primary" />
                  <p className="text-sm">{t("shell.loading")}</p>
                </div>
              </div>
            ) : error ? (
              <div className="grid min-h-[60vh] place-items-center gap-4 text-center">
                <Icons.AlertTriangle className="mx-auto size-10 text-rose-400" />
                <p className="text-sm font-medium">{error}</p>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => bootstrap()}><Icons.RefreshCw className="size-4" /> {t("shell.retry")}</Button>
                  <Button onClick={() => seed()}><Icons.Database className="size-4" /> {t("shell.seed")}</Button>
                </div>
              </div>
            ) : !tenant ? (
              <div className="grid min-h-[60vh] place-items-center gap-4 text-center">
                <Icons.Database className="mx-auto size-10 text-muted-foreground/40" />
                <div>
                  <p className="font-medium">{t("shell.noData")}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{t("shell.noDataDesc")}</p>
                </div>
                <Button onClick={() => seed()} size="lg"><Icons.Sparkles className="size-4" /> {t("shell.seed")}</Button>
              </div>
            ) : (
              children
            )}
            </div>
          </main>
        </div>

        {/* Sabit footer (§UI kuralı: mt-auto ile tabana yapışık) */}
        <footer className="mt-auto border-t bg-background">
          <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-xs text-muted-foreground md:px-6">
            <p>© 2026 Maven Event Management — Ortak Organizasyonel Mimari v1.0 · Tenant: {tenant?.name ?? "—"}</p>
            <p className="flex items-center gap-3">
              <span className="inline-flex items-center gap-1"><Icons.Layers className="size-3.5" /> {editions.length} {t("shell.footerEditions")}</span>
              <span className="inline-flex items-center gap-1"><Icons.Users className="size-3.5" /> {modelCount} {t("shell.footerModels")}</span>
            </p>
          </div>
        </footer>
      </div>
    </TooltipProvider>
  );
}
