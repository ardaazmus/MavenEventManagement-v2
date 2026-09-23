"use client";
// Kabuk: sidebar (§53 modül menüsü — capability kapalıysa gizli), üst şerit (bağlam seçici), footer
import { useApp, hasCapability } from "@/lib/store";
import { MODULES, EDITION_STATUS, label, fmtDate } from "@/lib/constants";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Separator } from "@/components/ui/separator";
import * as Icons from "lucide-react";
import { cn } from "@/lib/utils";
import { useState } from "react";

function ModuleIcon({ name, className }: { name: string; className?: string }) {
  const Icon = (Icons as unknown as Record<string, Icons.LucideIcon>)[name] ?? Icons.Circle;
  return <Icon className={className} />;
}

function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const { module, setModule, editions, currentEditionId } = useApp();
  const edition = editions.find((e) => e.id === currentEditionId);

  const groups: { id: string; label: string }[] = [
    { id: "workspace", label: "Çalışma Alanı" },
    { id: "people", label: "İnsanlar & Kurumlar" },
    { id: "edition", label: edition ? `Edisyon — ${edition.name}` : "Edisyon" },
  ];

  return (
    <nav aria-label="Ana menü" className="flex h-full flex-col gap-1 overflow-y-auto maven-scroll px-3 py-4">
      <div className="mb-2 flex items-center gap-2 px-2">
        <div className="grid size-8 place-items-center rounded-lg bg-primary font-bold text-primary-foreground">M</div>
        <div>
          <p className="text-sm font-semibold leading-none">Maven</p>
          <p className="text-[11px] text-sidebar-foreground/60">Event Management</p>
        </div>
      </div>
      <Separator className="bg-sidebar-border/60" />
      {groups.map((g) => {
        const items = MODULES.filter((m) => m.group === g.id && visibleFor(m.capability, edition));
        if (items.length === 0) return null;
        return (
          <div key={g.id} className="mt-3">
            <p className="px-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-sidebar-foreground/50">{g.label}</p>
            {items.map((m) => (
              <button
                key={m.id}
                onClick={() => { setModule(m.id); onNavigate?.(); }}
                aria-current={module === m.id ? "page" : undefined}
                className={cn(
                  "group relative flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-primary/40",
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
                <span className="truncate">{m.label}</span>
              </button>
            ))}
          </div>
        );
      })}
      <div className="mt-auto rounded-lg border border-sidebar-border/60 bg-gradient-to-br from-sidebar-accent/60 to-sidebar-accent/20 p-3 text-[11px] leading-relaxed text-sidebar-foreground/70">
        <p className="flex items-center gap-1.5 font-semibold text-sidebar-foreground/90"><Icons.Shapes className="size-3.5 text-primary" /> Ortak Organizasyonel Mimari</p>
        <p className="mt-1">Kişi ≠ Katılım ≠ Kayıt ≠ Rol ≠ Ödeme — her eksen bağımsız yönetilir.</p>
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
  const { tenant, editions, currentEditionId, setCurrentEdition, module, loading, error, bootstrap, seed } = useApp();
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
                <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Menüyü aç">
                  <Icons.Menu className="size-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-72 bg-sidebar p-0 text-sidebar-foreground">
                <SheetTitle className="sr-only">Ana menü</SheetTitle>
                <SidebarNav onNavigate={() => setOpen(false)} />
              </SheetContent>
            </Sheet>

            <div className="hidden items-center gap-1.5 text-sm text-muted-foreground lg:flex">
              <span className="font-medium text-foreground">{tenant?.name ?? "Çalışma alanı"}</span>
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
              <Select
                value={currentEditionId ?? ""}
                onValueChange={(v) => {
                  setCurrentEdition(v);
                  try { window.localStorage.setItem("maven.edition", v); } catch { /* yoksay */ }
                }}
              >
                <SelectTrigger className="h-9 w-[220px] gap-2" aria-label="Edisyon seçici">
                  <SelectValue placeholder="Edisyon seçin" />
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
              <Button variant="ghost" size="icon" aria-label="Yenile" onClick={() => bootstrap()} disabled={loading}>
                <Icons.RefreshCw className={cn("size-4", loading && "animate-spin text-primary")} />
              </Button>
              <Avatar className="size-8">
                <AvatarFallback className="bg-primary/15 text-xs font-semibold text-primary">EK</AvatarFallback>
              </Avatar>
            </div>
          </div>
          {edition && (
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t bg-muted/40 px-4 py-1.5 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1"><Icons.CalendarDays className="size-3.5" /> {fmtDate(edition.startDate)} — {fmtDate(edition.endDate)}</span>
              {edition.venueName && <span className="inline-flex items-center gap-1"><Icons.MapPin className="size-3.5" /> {edition.venueName}{edition.city ? `, ${edition.city}` : ""}</span>}
              <span className="inline-flex items-center gap-1"><Icons.Globe2 className="size-3.5" /> {tenant?.timezone}</span>
              <span className="ml-auto hidden md:inline">Edisyon değiştirilince ekran başlığı ve filtreler güncellenir</span>
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
                  <p className="text-sm">Maven yükleniyor…</p>
                </div>
              </div>
            ) : error ? (
              <div className="grid min-h-[60vh] place-items-center gap-4 text-center">
                <Icons.AlertTriangle className="mx-auto size-10 text-rose-400" />
                <p className="text-sm font-medium">{error}</p>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => bootstrap()}><Icons.RefreshCw className="size-4" /> Yeniden dene</Button>
                  <Button onClick={() => seed()}><Icons.Database className="size-4" /> Demo verisi yükle</Button>
                </div>
              </div>
            ) : !tenant ? (
              <div className="grid min-h-[60vh] place-items-center gap-4 text-center">
                <Icons.Database className="mx-auto size-10 text-muted-foreground/40" />
                <div>
                  <p className="font-medium">Henüz veri yok</p>
                  <p className="mt-1 text-sm text-muted-foreground">Demo verisini yükleyerek tüm modülleri gerçekçi kayıtlarla inceleyin.</p>
                </div>
                <Button onClick={() => seed()} size="lg"><Icons.Sparkles className="size-4" /> Demo verisi yükle</Button>
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
              <span className="inline-flex items-center gap-1"><Icons.Layers className="size-3.5" /> {editions.length} edisyon</span>
              <span className="inline-flex items-center gap-1"><Icons.Users className="size-3.5" /> 64 model</span>
            </p>
          </div>
        </footer>
      </div>
    </TooltipProvider>
  );
}
