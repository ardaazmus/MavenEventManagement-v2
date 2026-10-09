"use client";
import React, { useState } from "react";
import { useApp } from "@/lib/store";
import {
  GLOBAL_NAV_AREAS,
  WORK_NAV_GROUPS,
  WORK_OPERATIONAL_HUBS,
  WORK_UTILITY_HUBS,
  getProductContextScope,
  type GlobalNavAreaId,
} from "@/lib/product-taxonomy";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import * as Icons from "lucide-react";
import { cn } from "@/lib/utils";
import { t } from "@/lib/i18n";

function DynamicIcon({ name, className }: { name: string; className?: string }) {
  const IconComponent = (Icons as unknown as Record<string, Icons.LucideIcon>)[name] ?? Icons.Circle;
  return <IconComponent className={className} />;
}

interface DualSidebarProps {
  onNavigate?: () => void;
  activeGlobalArea?: GlobalNavAreaId;
  onSelectGlobalArea?: (area: GlobalNavAreaId) => void;
  jobsFilter?: string;
  onSelectJobsFilter?: (filter: string) => void;
}

export function DualSidebar({
  onNavigate,
  activeGlobalArea = "jobs",
  onSelectGlobalArea,
  jobsFilter = "all",
  onSelectJobsFilter,
}: DualSidebarProps) {
  const {
    module,
    moduleSubView,
    setModule,
    currentEditionId,
    setCurrentEdition,
    editions,
    tenant,
    me,
  } = useApp();

  const [localArea, setLocalArea] = useState<GlobalNavAreaId>(activeGlobalArea);
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<"hub" | "all">("hub");
  const [expandedHubs, setExpandedHubs] = useState<Record<string, boolean>>({});

  // Global modül değişiminde sol ikon şeridini ve aktif alanı doğrudan türet (re-render kaskadı önleme)
  const computedAreaFromModule: GlobalNavAreaId | null = React.useMemo(() => {
    if (module === "portfolio") return "portfolio";
    if (module === "company-communications") return "comms";
    if (module === "company-reports" || module === "reports") return "reports";
    if (module === "company-settings" || module === "integrations" || module === "compliance") return "settings";
    if (module === "editions" || module === "archive") return "jobs";
    return null;
  }, [module]);

  const activeAreaId = onSelectGlobalArea ? activeGlobalArea : (computedAreaFromModule ?? localArea);

  const activeHubId = React.useMemo(() => {
    if (module === "dashboard" || module === "operations" || (module === "editions" && moduleSubView === "checklist")) {
      return "hub_cockpit";
    }
    if (module === "registrations" || module === "forms" || module === "people") {
      return "hub_registration";
    }
    if (module === "program" || module === "scientific" || module === "social") {
      return "hub_program";
    }
    if (module === "sponsorship" || module === "floors" || module === "b2b") {
      return "hub_sponsor";
    }
    if (module === "onsite" || module === "badges" || module === "certificates" || module === "accommodation") {
      return "hub_logistics";
    }
    if (module === "communications" || module === "portals" || module === "media") {
      return "hub_comms";
    }
    if (module === "accounting") {
      return "hub_reports";
    }
    if (module === "settings") {
      return "hub_settings";
    }
    return "hub_cockpit";
  }, [module, moduleSubView]);

  const toggleHub = (hubId: string) => {
    setExpandedHubs((prev) => ({
      ...prev,
      [hubId]: !(prev[hubId] ?? (hubId === activeHubId)),
    }));
  };

  const isHubExpanded = (hubId: string) => {
    if (expandedHubs[hubId] !== undefined) {
      return expandedHubs[hubId];
    }
    return hubId === activeHubId;
  };

  const currentWork = editions.find((e) => e.id === currentEditionId);
  // Bir iş seçiliyse ve iş modülü açıksa iş bağlamı aktiftir
  const isWorkContextActive = Boolean(
    currentWork &&
    module !== "editions" &&
    module !== "archive" &&
    (getProductContextScope(module) === "WORK_WORKSPACE" || getProductContextScope(module) === "EXTERNAL_EXPERIENCE")
  );

  const [localContextTab, setLocalContextTab] = useState<"work" | "company">(
    isWorkContextActive ? "work" : "company"
  );
  const contextTab: "work" | "company" = isWorkContextActive ? localContextTab : "company";

  const [expandedGlobalAreas, setExpandedGlobalAreas] = useState<Record<string, boolean>>({
    [activeAreaId]: true,
  });

  const toggleGlobalArea = (areaId: GlobalNavAreaId) => {
    setExpandedGlobalAreas((prev) => ({
      ...prev,
      [areaId]: !(prev[areaId] ?? (areaId === activeAreaId)),
    }));
  };

  const isGlobalAreaExpanded = (areaId: GlobalNavAreaId) => {
    if (expandedGlobalAreas[areaId] !== undefined) {
      return expandedGlobalAreas[areaId];
    }
    return areaId === activeAreaId;
  };

  const handleGlobalAreaClick = (areaId: GlobalNavAreaId) => {
    if (onSelectGlobalArea) {
      onSelectGlobalArea(areaId);
    }
    setLocalArea(areaId);
    setExpandedGlobalAreas((prev) => ({
      ...prev,
      [areaId]: true,
    }));

    if (areaId === "jobs") {
      onSelectJobsFilter?.("all");
      setModule("editions", "all");
    } else if (areaId === "portfolio") {
      setModule("portfolio", "people");
    } else if (areaId === "comms") {
      setModule("company-communications", "overview");
    } else if (areaId === "reports") {
      setModule("company-reports");
    } else if (areaId === "settings") {
      setModule("company-settings", "profile");
    }
    setLocalContextTab("company");
    onNavigate?.();
  };

  const setContextTab = (tab: "work" | "company") => {
    setLocalContextTab(tab);
    if (tab === "company") {
      handleGlobalAreaClick(activeAreaId || "portfolio");
    } else if (tab === "work") {
      if (currentWork) {
        setModule("dashboard");
      } else {
        setModule("editions");
      }
      onNavigate?.();
    }
  };

  const handleGlobalSubItemClick = (areaId: GlobalNavAreaId, subItemId: string) => {
    if (onSelectGlobalArea) {
      onSelectGlobalArea(areaId);
    }
    setLocalArea(areaId);

    const item = { id: subItemId };

    if (areaId === "jobs") {
      onSelectJobsFilter?.(subItemId);
      setModule("editions", subItemId);
    } else if (areaId === "portfolio") {
      setModule("portfolio", subItemId);
    } else if (areaId === "comms") {
      setModule("company-communications", subItemId);
    } else if (areaId === "reports") {
      setModule("company-reports", item.id);
    } else if (areaId === "settings") {
      if (subItemId === "integrations") {
        setModule("integrations");
      } else if (subItemId === "compliance") {
        setModule("compliance");
      } else if (subItemId === "comms-consents") {
        setModule("company-settings", "comms-consent");
      } else {
        setModule("company-settings", subItemId);
      }
    }
    setContextTab("company");
    onNavigate?.();
  };

  const isGlobalSubItemActive = (areaId: GlobalNavAreaId, subItemId: string) => {
    if (areaId === "jobs") {
      return module === "editions" && (jobsFilter === subItemId || moduleSubView === subItemId || (subItemId === "all" && !jobsFilter && !moduleSubView));
    }
    if (areaId === "portfolio") {
      return module === "portfolio" && (moduleSubView === subItemId || (!moduleSubView && subItemId === "people"));
    }
    if (areaId === "comms") {
      return module === "company-communications" && (moduleSubView === subItemId || (!moduleSubView && subItemId === "overview"));
    }
    if (areaId === "reports") {
      return (module === "company-reports" || module === "reports") && (moduleSubView === subItemId || (!moduleSubView && subItemId === "works-report"));
    }
    if (areaId === "settings") {
      if (subItemId === "integrations") return module === "integrations";
      if (subItemId === "compliance") return module === "compliance";
      if (subItemId === "comms-consents") return module === "company-settings" && moduleSubView === "comms-consent";
      return module === "company-settings" && (moduleSubView === subItemId || (!moduleSubView && subItemId === "profile"));
    }
    return false;
  };

  const getItemDisplayTitle = (item: { id: string; title: string; primaryModuleId?: string }) => {
    let displayTitle = item.title;
    if (item.primaryModuleId === "registrations" && item.id === "participants") {
      displayTitle = t("modules.registrations");
    } else if (item.primaryModuleId === "communications" && item.id === "work-comms") {
      displayTitle = t("modules.communications");
    } else if (item.primaryModuleId === "portals" && item.id === "external-experiences") {
      displayTitle = t("modules.portals");
    } else if (item.primaryModuleId === "accounting" && item.id === "work-finance-reports") {
      displayTitle = t("modules.accounting");
    } else if (item.primaryModuleId === "settings" && item.id === "work-general-settings") {
      displayTitle = t("modules.settings");
    } else if (item.primaryModuleId === "forms" && item.id === "forms") {
      displayTitle = t("modules.forms");
    } else if (item.primaryModuleId === "editions" && item.id === "setup-checklist") {
      displayTitle = t("modules.editions");
    } else if (item.primaryModuleId === "scientific" && item.id === "scientific") {
      displayTitle = t("modules.scientific");
    } else if (item.primaryModuleId === "program" && item.id === "program") {
      displayTitle = t("modules.program");
    } else if (item.primaryModuleId === "social" && item.id === "social-tours") {
      displayTitle = t("modules.social");
    } else if (item.primaryModuleId === "sponsorship" && item.id === "sponsors") {
      displayTitle = t("modules.sponsorship");
    } else if (item.primaryModuleId === "floors" && item.id === "booths-floors") {
      displayTitle = t("modules.floors");
    } else if (item.primaryModuleId === "b2b" && item.id === "b2b") {
      displayTitle = t("modules.b2b");
    } else if (item.primaryModuleId === "media" && item.id === "media") {
      displayTitle = t("modules.media");
    } else if (item.primaryModuleId === "onsite" && item.id === "onsite-operations") {
      displayTitle = t("modules.onsite");
    } else if (item.primaryModuleId === "badges" && item.id === "badges-print") {
      displayTitle = t("modules.badges");
    } else if (item.primaryModuleId === "certificates" && item.id === "certificates-docs") {
      displayTitle = t("modules.certificates");
    } else if (item.primaryModuleId === "accommodation" && item.id === "accommodation") {
      displayTitle = t("modules.accommodation");
    }
    return displayTitle;
  };

  const isWorkItemActive = (item: { id: string; primaryModuleId?: string }) => {
    let isItemActive = item.primaryModuleId === module;
    if (item.primaryModuleId === "registrations") {
      if (item.id === "categories-rights") {
        isItemActive = module === "registrations" && moduleSubView === "categories";
      } else if (item.id === "approval-center") {
        isItemActive = module === "registrations" && moduleSubView === "approval";
      } else if (item.id === "import-export") {
        isItemActive = module === "registrations" && moduleSubView === "import";
      } else if (item.id === "participants") {
        isItemActive = module === "registrations" && (!moduleSubView || moduleSubView === "list");
      }
    } else if (item.primaryModuleId === "sponsorship") {
      if (item.id === "sponsors") {
        isItemActive = module === "sponsorship" && (!moduleSubView || moduleSubView === "sponsors");
      } else if (item.id === "packages-agreements") {
        isItemActive = module === "sponsorship" && moduleSubView === "packages";
      } else if (item.id === "deliverables-entitlements") {
        isItemActive = module === "sponsorship" && (moduleSubView === "deliverables" || moduleSubView === "entitlements");
      }
    } else if (item.primaryModuleId === "onsite") {
      isItemActive = module === "onsite";
    } else if (item.primaryModuleId === "badges") {
      isItemActive = module === "badges";
    } else if (item.primaryModuleId === "certificates") {
      isItemActive = module === "certificates";
    } else if (item.primaryModuleId === "accommodation") {
      if (item.id === "accommodation") {
        isItemActive = module === "accommodation" && (!moduleSubView || moduleSubView === "hotels" || moduleSubView === "reservations" || moduleSubView === "rooming");
      } else if (item.id === "travel-transfers") {
        isItemActive = module === "accommodation" && moduleSubView === "transfers";
      }
    } else if (item.primaryModuleId === "communications") {
      isItemActive = module === "communications";
    } else if (item.primaryModuleId === "portals") {
      isItemActive = module === "portals";
    } else if (item.primaryModuleId === "media") {
      isItemActive = module === "media";
    } else if (item.primaryModuleId === "accounting") {
      isItemActive = module === "accounting";
    } else if (item.id === "work-finance-reports") {
      isItemActive = module === "accounting";
    } else if (item.id === "work-reg-reports") {
      isItemActive = module === "registrations" && moduleSubView === "reports";
    } else if (item.id === "work-sponsor-reports") {
      isItemActive = module === "sponsorship" && moduleSubView === "roi";
    }
    return isItemActive;
  };

  const handleWorkItemClick = (
    item: { id: string; primaryModuleId?: string; defaultSubView?: string | null },
    groupInput?: { id: string } | string
  ) => {
    if (!item.primaryModuleId) return;

    const group = typeof groupInput === "object" ? groupInput : { id: groupInput ?? "" };
    const gid = group.id;
    if (group.id === "people_registration" || gid === "people_registration" || item.primaryModuleId === "registrations") {
      if (item.id === "categories-rights") {
        setModule("registrations", "categories");
      } else if (item.id === "approval-center") {
        setModule("registrations", "approval");
      } else if (item.id === "import-export") {
        setModule("registrations", "import");
      } else if (item.id === "participants") {
        setModule("registrations", "list");
      } else {
        setModule(item.primaryModuleId, null);
      }
    } else if (group.id === "sponsor_exhibition" || gid === "sponsor_exhibition" || item.primaryModuleId === "sponsorship") {
      if (item.id === "sponsors") {
        setModule("sponsorship", "sponsors");
      } else if (item.id === "packages-agreements") {
        setModule("sponsorship", "packages");
      } else if (item.id === "deliverables-entitlements") {
        setModule("sponsorship", "deliverables");
      } else if (item.id === "booths-floors") {
        setModule("floors", null);
      } else if (item.id === "b2b") {
        setModule("b2b", null);
      } else {
        setModule(item.primaryModuleId, null);
      }
    } else if (group.id === "venue_onsite" || gid === "venue_onsite" || item.primaryModuleId === "onsite" || item.primaryModuleId === "badges" || item.primaryModuleId === "certificates") {
      if (item.id === "venues-spaces") {
        setModule("floors", null);
      } else if (item.id === "onsite-operations") {
        setModule("onsite", "desk");
      } else if (item.id === "badges-print") {
        setModule("badges", "queue");
      } else if (item.id === "certificates-docs") {
        setModule("certificates", null);
      } else {
        setModule(item.primaryModuleId, null);
      }
    } else if (group.id === "accommodation_services" || gid === "accommodation_services" || item.primaryModuleId === "accommodation") {
      if (item.id === "accommodation") {
        setModule("accommodation", "hotels");
      } else if (item.id === "travel-transfers") {
        setModule("accommodation", "transfers");
      } else if (item.id === "extra-services") {
        setModule("finance", null);
      } else {
        setModule(item.primaryModuleId, null);
      }
    } else if (group.id === "communication_experience" || gid === "communication_experience" || item.primaryModuleId === "communications" || item.primaryModuleId === "portals" || item.primaryModuleId === "media") {
      if (item.id === "work-comms") {
        setModule("communications", null);
      } else if (item.id === "external-experiences") {
        setModule("portals", "pwa");
      } else if (item.id === "media") {
        setModule("media", null);
      } else {
        setModule(item.primaryModuleId, null);
      }
    } else if (group.id === "work_reports" || gid === "work_reports" || (item.id.startsWith("work-") && item.id.endsWith("-reports"))) {
      if (item.id === "work-finance-reports") {
        setModule("accounting", "defter");
      } else if (item.id === "work-reg-reports") {
        setModule("registrations", "reports");
      } else if (item.id === "work-sponsor-reports") {
        setModule("sponsorship", "roi");
      } else {
        setModule(item.primaryModuleId, null);
      }
    } else {
      setModule(item.primaryModuleId, null);
    }
    onNavigate?.();
  };

  return (
    <div className="flex h-full border-r bg-sidebar text-sidebar-foreground">
      {/* ── 1. Sol Dar Global İkon Şeridi (56px) ── */}
      <aside
        aria-label="Global Navigasyon Şeridi"
        className="flex w-14 shrink-0 flex-col items-center justify-between border-r border-sidebar-border/70 bg-sidebar py-3"
      >
        {/* Üst Kısım: Logo */}
        <div className="flex flex-col items-center gap-3">
          <div className="grid size-9 place-items-center rounded-xl bg-primary text-sm font-bold text-primary-foreground shadow-sm">
            {tenant?.name ? tenant.name.slice(0, 1).toLocaleUpperCase("tr-TR") : "M"}
          </div>

          <Separator className="w-8 bg-sidebar-border/60" />

          {/* 5 Global Alan Butonları */}
          <nav className="flex flex-col items-center gap-1.5" aria-label="Global Alanlar">
            {GLOBAL_NAV_AREAS.map((area) => {
              const isActive = activeAreaId === area.id && !isWorkContextActive;
              return (
                <Tooltip key={area.id}>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => handleGlobalAreaClick(area.id)}
                      aria-label={area.title}
                      aria-current={isActive ? "page" : undefined}
                      className={cn(
                        "group relative flex size-10 items-center justify-center rounded-xl transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                        isActive
                          ? "bg-primary text-primary-foreground shadow-sm"
                          : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                      )}
                    >
                      <DynamicIcon name={area.icon} className="size-5 transition-transform duration-150 group-hover:scale-105" />
                      {isActive && (
                        <span className="absolute -left-1 top-1/2 h-4 w-1 -translate-y-1/2 rounded-r-full bg-primary" />
                      )}
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="right" className="font-medium">
                    {area.title}
                  </TooltipContent>
                </Tooltip>
              );
            })}
          </nav>
        </div>

        {/* Alt Kısım: Yardım ve Profil */}
        <div className="flex flex-col items-center gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                aria-label="Yardım ve Belgeler"
                onClick={() => setModule("settings")}
                className="flex size-9 items-center justify-center rounded-xl text-sidebar-foreground/60 transition hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              >
                <Icons.HelpCircle className="size-5" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">Yardım & Kılavuz</TooltipContent>
          </Tooltip>

          <Avatar className="size-8 border border-sidebar-border">
            <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">
              {(me?.name ?? "?")
                .split(" ")
                .map((p) => p.slice(0, 1).toLocaleUpperCase("tr-TR"))
                .slice(0, 2)
                .join("") || "U"}
            </AvatarFallback>
          </Avatar>
        </div>
      </aside>

      {/* ── 2. Bağlamsal İkinci Menü Paneli (220px) ── */}
      <nav
        aria-label={t("shell.srMenu")}
        className="flex w-56 shrink-0 flex-col overflow-y-auto maven-scroll bg-sidebar/50 p-3"
      >
        {isWorkContextActive && currentWork && (contextTab as string) === "work" ? (
          /* İŞ BAĞLAMI MENÜSÜ (Bir İş Açıkken ve İş Menüsü Seçiliyken) */
          <div className="flex flex-col gap-3">
            {/* Üst Başlık: İşe Dönüş ve İş Bilgisi */}
            <div className="rounded-lg border border-sidebar-border/80 bg-background/50 p-2.5">
              <button
                onClick={() => {
                  setContextTab("company");
                  onSelectJobsFilter?.("all");
                  setModule("editions", "all");
                  onNavigate?.();
                }}
                className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition hover:text-foreground"
                aria-label={t("modules.editions")}
              >
                <Icons.ArrowLeft className="size-3.5" />
                {t("dualSidebar.backToJobs")}
              </button>
              <div className="mt-2 min-w-0">
                <p className="truncate text-sm font-semibold">{currentWork.name}</p>
                <div className="mt-1 flex items-center gap-1.5">
                  <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
                    {currentWork.status}
                  </Badge>
                  {currentWork.city && (
                    <span className="truncate text-[11px] text-muted-foreground">{currentWork.city}</span>
                  )}
                </div>
              </div>
            </div>

            {/* Bağlam Seçici: İş Menüsü vs Firma Globali */}
            <div
              role="tablist"
              aria-label={t("dualSidebar.ariaContextToggle")}
              className="flex items-center gap-1 rounded-lg border border-sidebar-border bg-sidebar-accent/30 p-1"
            >
              <button
                role="tab"
                aria-selected={contextTab === "work"}
                onClick={() => setContextTab("work")}
                className={cn(
                  "flex-1 rounded py-1 text-center text-xs font-medium transition-colors",
                  contextTab === "work"
                    ? "bg-primary text-primary-foreground shadow-xs font-semibold"
                    : "text-sidebar-foreground/70 hover:text-sidebar-foreground"
                )}
              >
                {t("dualSidebar.tabWork")}
              </button>
              <button
                role="tab"
                aria-selected={(contextTab as string) === "company"}
                onClick={() => setContextTab("company")}
                className={cn(
                  "flex-1 rounded py-1 text-center text-xs font-medium transition-colors",
                  (contextTab as string) === "company"
                    ? "bg-primary text-primary-foreground shadow-xs font-semibold"
                    : "text-sidebar-foreground/70 hover:text-sidebar-foreground"
                )}
              >
                {t("dualSidebar.tabCompany")}
              </button>
            </div>

            {/* ── 1. İnteraktif Arama Çubuğu ── */}
            <div className="relative mb-2">
              <Icons.Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t("dualSidebar.searchPlaceholder")}
                className="h-7 pl-8 pr-6 text-xs bg-background/50 border-sidebar-border"
              />
              {searchQuery && (
                    <button
                      onClick={() => setSearchQuery("")}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-muted-foreground hover:text-foreground"
                      aria-label={t("dualSidebar.clearSearch")}
                    >
                      <Icons.X className="size-3" />
                    </button>
                  )}
                </div>

                {/* ── 2. Görünüm Modu Seçici (Hub Odaklı vs Tüm Ağaç) ── */}
                {!searchQuery && (
                  <div className="mb-2 flex items-center justify-between px-1">
                    <span className="text-[10px] font-semibold text-sidebar-foreground/60 uppercase tracking-wider">
                      {viewMode === "hub" ? t("dualSidebar.viewModeHub") : t("dualSidebar.viewModeAll")}
                    </span>
                    <button
                      onClick={() => setViewMode((m) => (m === "hub" ? "all" : "hub"))}
                      className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground transition hover:bg-sidebar-accent hover:text-foreground"
                      title={viewMode === "hub" ? t("dualSidebar.viewModeAll") : t("dualSidebar.viewModeHub")}
                    >
                      {viewMode === "hub" ? (
                        <>
                          <Icons.LayoutGrid className="size-3" />
                          <span>{t("dualSidebar.viewModeAll")}</span>
                        </>
                      ) : (
                        <>
                          <Icons.Layers className="size-3" />
                          <span>{t("dualSidebar.viewModeHub")}</span>
                        </>
                      )}
                    </button>
                  </div>
                )}

                {/* ── 3. Canlı Arama Sonuçları Görünümü ── */}
                {searchQuery.trim() ? (
                  <div className="flex flex-col gap-1">
                    {(() => {
                      const q = searchQuery.trim().toLocaleLowerCase("tr-TR");
                      const results: { item: typeof WORK_NAV_GROUPS[number]["items"][number]; groupTitle: string; groupId: string }[] = [];
                      WORK_NAV_GROUPS.forEach((g) => {
                        g.items.forEach((it) => {
                          const title = getItemDisplayTitle(it);
                          if (
                            title.toLocaleLowerCase("tr-TR").includes(q) ||
                            it.title.toLocaleLowerCase("tr-TR").includes(q) ||
                            it.description.toLocaleLowerCase("tr-TR").includes(q) ||
                            (it.primaryModuleId && it.primaryModuleId.toLocaleLowerCase("tr-TR").includes(q))
                          ) {
                            results.push({ item: it, groupTitle: g.title, groupId: g.id });
                          }
                        });
                      });

                      if (results.length === 0) {
                        return (
                          <div className="p-3 text-center text-xs text-muted-foreground">
                            <p>{t("dualSidebar.noResults")}</p>
                            <Button variant="ghost" size="sm" onClick={() => setSearchQuery("")} className="mt-1 h-6 text-xs">
                              {t("dualSidebar.clearSearch")}
                            </Button>
                          </div>
                        );
                      }

                      return results.map(({ item, groupTitle, groupId }) => {
                        const isItemActive = isWorkItemActive(item);
                        const displayTitle = getItemDisplayTitle(item);
                        return (
                          <button
                            key={item.id}
                            onClick={() => handleWorkItemClick(item, groupId)}
                            className={cn(
                              "group flex flex-col items-start rounded-lg px-2.5 py-1.5 text-left text-xs transition-colors",
                              isItemActive
                                ? "bg-sidebar-primary/15 font-medium text-sidebar-primary"
                                : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                            )}
                          >
                            <div className="flex w-full items-center justify-between">
                              <span className="truncate font-medium">{displayTitle}</span>
                              <Badge variant="outline" className="text-[9px] px-1 py-0 text-muted-foreground">
                                {groupTitle}
                              </Badge>
                            </div>
                            <span className="truncate text-[10px] text-muted-foreground">{item.description}</span>
                          </button>
                        );
                      });
                    })()}
                  </div>
                ) : viewMode === "hub" ? (
                  /* ── 4. 6 Operasyonel Hub (Sektörel Sadeleştirilmiş Odak Modu) ── */
                  <div className="flex flex-col gap-2">
                    {WORK_OPERATIONAL_HUBS.map((hub) => {
                      const isExpanded = isHubExpanded(hub.id);
                      const isHubActive = hub.id === activeHubId;
                      return (
                        <div key={hub.id} className="flex flex-col rounded-lg border border-sidebar-border/40 bg-background/20 transition-all">
                          {/* Hub Başlığı (Akordeon Header) */}
                          <button
                            onClick={() => {
                              if (!isHubActive) {
                                if (hub.canonicalGroupId === "people_registration") {
                                  setModule("registrations", "list");
                                } else if (hub.canonicalGroupId === "sponsor_exhibition") {
                                  setModule("sponsorship", "sponsors");
                                } else if (hub.canonicalGroupId === "venue_onsite") {
                                  setModule("onsite", "desk");
                                } else {
                                  setModule(hub.primaryModuleId, hub.primarySubView ?? null);
                                }
                                setExpandedHubs({ [hub.id]: true });
                                onNavigate?.();
                              } else {
                                toggleHub(hub.id);
                              }
                            }}
                            className={cn(
                              "flex w-full items-center justify-between gap-1.5 rounded-lg px-2.5 py-2 text-left text-xs font-semibold transition-colors",
                              isHubActive
                                ? "bg-sidebar-accent text-sidebar-accent-foreground font-bold shadow-2xs"
                                : "text-sidebar-foreground/80 hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground"
                            )}
                          >
                            <div className="flex items-center gap-2 truncate">
                              <DynamicIcon name={hub.icon} className={cn("size-3.5 shrink-0", isHubActive ? "text-primary" : "text-muted-foreground")} />
                              <span className="truncate">{t(hub.titleKey)}</span>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              {/* Akıllı Rozetler */}
                              {hub.badgeType === "setup" && (
                                <Badge variant="outline" className="px-1 py-0 text-[9px] font-normal border-primary/30 text-primary">
                                  {t("dualSidebar.badgeSetup")}
                                </Badge>
                              )}
                              {hub.badgeType === "approval" && (
                                <Badge variant="outline" className="px-1 py-0 text-[9px] font-normal border-amber-500/30 text-amber-600 bg-amber-500/10">
                                  {t("dualSidebar.badgeApproval")}
                                </Badge>
                              )}
                              {hub.badgeType === "onsite" && currentWork.status === "ONSITE" && (
                                <Badge variant="outline" className="px-1 py-0 text-[9px] font-normal border-emerald-500/30 text-emerald-600 bg-emerald-500/10 animate-pulse">
                                  {t("dualSidebar.badgeOnsite")}
                                </Badge>
                              )}
                              <Icons.ChevronDown className={cn("size-3.5 text-muted-foreground transition-transform duration-200", isExpanded ? "rotate-0" : "-rotate-90")} />
                            </div>
                          </button>

                          {/* Hub Alt Öğeleri */}
                          {isExpanded && (
                            <div className="flex flex-col gap-0.5 border-t border-sidebar-border/30 px-1.5 py-1.5">
                              {hub.items.map((item) => {
                                const isItemActive = isWorkItemActive(item);
                                const displayTitle = getItemDisplayTitle(item);
                                return (
                                  <button
                                    key={item.id}
                                    onClick={() => handleWorkItemClick(item, hub.canonicalGroupId)}
                                    className={cn(
                                      "group relative flex items-center justify-between rounded-md px-2 py-1.5 text-left text-xs transition-colors",
                                      isItemActive
                                        ? "bg-primary text-primary-foreground font-medium shadow-2xs"
                                        : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                                    )}
                                  >
                                    <span className="truncate">{displayTitle}</span>
                                    {isItemActive && <span className="size-1.5 rounded-full bg-primary-foreground shrink-0" />}
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}

                    {/* Sabit Alt Yardımcılar (Raporlar ve Ayarlar) */}
                    <div className="mt-2 border-t border-sidebar-border/60 pt-2 flex flex-col gap-1.5">
                      <p className="px-2 text-[10px] font-bold uppercase tracking-wider text-sidebar-foreground/60">
                        {t("dualSidebar.hubReports")} & {t("dualSidebar.hubSettings")}
                      </p>
                      {WORK_UTILITY_HUBS.map((utilHub) => {
                        const isExpanded = isHubExpanded(utilHub.id);
                        const isUtilActive = utilHub.id === activeHubId;
                        return (
                          <div key={utilHub.id} className="flex flex-col rounded-lg border border-sidebar-border/30 bg-background/20">
                            <button
                              onClick={() => {
                                if (!isUtilActive) {
                                  setModule(utilHub.primaryModuleId, utilHub.primarySubView ?? null);
                                  setExpandedHubs({ [utilHub.id]: true });
                                  onNavigate?.();
                                } else {
                                  toggleHub(utilHub.id);
                                }
                              }}
                              className={cn(
                                "flex w-full items-center justify-between gap-1.5 rounded-lg px-2.5 py-1.5 text-left text-xs font-semibold transition-colors",
                                isUtilActive
                                  ? "bg-sidebar-accent text-sidebar-accent-foreground font-bold"
                                  : "text-sidebar-foreground/80 hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground"
                              )}
                            >
                              <div className="flex items-center gap-2 truncate">
                                <DynamicIcon name={utilHub.icon} className="size-3.5 shrink-0 text-muted-foreground" />
                                <span className="truncate">{t(utilHub.titleKey)}</span>
                              </div>
                              <Icons.ChevronDown className={cn("size-3.5 text-muted-foreground transition-transform duration-200", isExpanded ? "rotate-0" : "-rotate-90")} />
                            </button>

                            {isExpanded && (
                              <div className="flex flex-col gap-0.5 border-t border-sidebar-border/30 px-1.5 py-1.5">
                                {utilHub.items.map((item) => {
                                  const isItemActive = isWorkItemActive(item);
                                  const displayTitle = getItemDisplayTitle(item);
                                  return (
                                    <button
                                      key={item.id}
                                      onClick={() => handleWorkItemClick(item, utilHub.canonicalGroupId)}
                                      className={cn(
                                        "group flex items-center justify-between rounded-md px-2 py-1 text-left text-xs transition-colors",
                                        isItemActive
                                          ? "bg-primary text-primary-foreground font-medium"
                                          : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                                      )}
                                    >
                                      <span className="truncate">{displayTitle}</span>
                                      {isItemActive && <span className="size-1.5 rounded-full bg-primary-foreground shrink-0" />}
                                    </button>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  /* ── 5. 9 Sabit İş Grubu (Tümünü Göster Ağaç Modu) ── */
                  <div className="flex flex-col gap-3">
                    {WORK_NAV_GROUPS.map((group) => (
                      <div key={group.id} className="flex flex-col gap-0.5">
                        <p className="flex items-center gap-1.5 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-sidebar-foreground/60">
                          <DynamicIcon name={group.icon} className="size-3" />
                          {group.title}
                        </p>
                        {group.items.map((item) => {
                          const isItemActive = isWorkItemActive(item);
                          const displayTitle = getItemDisplayTitle(item);
                          return (
                            <button
                              key={item.id}
                              onClick={() => handleWorkItemClick(item, group.id)}
                              className={cn(
                                "group flex items-center justify-between rounded-lg px-2.5 py-1.5 text-left text-xs transition-colors",
                                isItemActive
                                  ? "bg-sidebar-primary/15 font-medium text-sidebar-primary"
                                  : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                              )}
                            >
                              <span className="truncate">{displayTitle}</span>
                            </button>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                )}
          </div>
        ) : (
          /* GLOBAL BAĞLAM MENÜSÜ (Firma B Global Alanı) */
          <div className="flex flex-col gap-3">
            {/* Eğer bir iş seçiliyse, Bağlam Değiştirici Toggle */}
            {currentWork && (
              <div
                role="tablist"
                aria-label={t("dualSidebar.ariaContextToggle")}
                className="flex items-center gap-1 rounded-lg border border-sidebar-border bg-sidebar-accent/30 p-1"
              >
                <button
                  role="tab"
                  aria-selected={contextTab === "work"}
                  onClick={() => setContextTab("work")}
                  className={cn(
                    "flex-1 rounded py-1 text-center text-xs font-medium transition-colors",
                    contextTab === "work"
                      ? "bg-primary text-primary-foreground shadow-xs font-semibold"
                      : "text-sidebar-foreground/70 hover:text-sidebar-foreground"
                  )}
                >
                  {t("dualSidebar.tabWork")}
                </button>
                <button
                  role="tab"
                  aria-selected={contextTab === "company"}
                  onClick={() => setContextTab("company")}
                  className={cn(
                    "flex-1 rounded py-1 text-center text-xs font-medium transition-colors",
                    contextTab === "company"
                      ? "bg-primary text-primary-foreground shadow-xs font-semibold"
                      : "text-sidebar-foreground/70 hover:text-sidebar-foreground"
                  )}
                >
                  {t("dualSidebar.tabCompany")}
                </button>
              </div>
            )}

            {/* Eğer önceden seçilmiş bir iş varsa, işe geri dönüş bağlantısı */}
            {currentWork && (
              <button
                onClick={() => {
                  setContextTab("work");
                }}
                className="flex items-center justify-between rounded-lg border border-primary/25 bg-primary/10 px-2.5 py-2 text-xs font-semibold text-primary transition hover:bg-primary/20"
              >
                <div className="flex items-center gap-1.5 truncate">
                  <Icons.ArrowLeft className="size-3.5 shrink-0" />
                  <span className="truncate">{currentWork.name}</span>
                </div>
                <Badge variant="outline" className="text-[9px] px-1 py-0 border-primary/40 text-primary shrink-0">
                  {t("dualSidebar.tabWork")}
                </Badge>
              </button>
            )}

            {/* ── 5 Global Alan — Açılır Akordeon Listesi (İş Modülleri ile Birebir Aynı Tasarım Dili) ── */}
            <div className="flex flex-col gap-2">
              {GLOBAL_NAV_AREAS.map((area) => {
                const isExpanded = isGlobalAreaExpanded(area.id);
                const isAreaActive = area.id === activeAreaId;
                return (
                  <div
                    key={area.id}
                    className="flex flex-col rounded-lg border border-sidebar-border/40 bg-background/20 transition-all"
                  >
                    {/* Alan Başlığı (Akordeon Header) */}
                    <button
                      onClick={() => {
                        if (area.id !== activeAreaId) {
                          handleGlobalAreaClick(area.id);
                          setExpandedGlobalAreas({ [area.id]: true });
                        } else {
                          toggleGlobalArea(area.id);
                        }
                      }}
                      className={cn(
                        "flex w-full items-center justify-between gap-1.5 rounded-lg px-2.5 py-2 text-left text-xs font-semibold transition-colors",
                        isAreaActive
                          ? "bg-sidebar-accent text-sidebar-accent-foreground font-bold shadow-2xs"
                          : "text-sidebar-foreground/80 hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground"
                      )}
                    >
                      <div className="flex items-center gap-2 truncate">
                        <DynamicIcon
                          name={area.icon}
                          className={cn(
                            "size-3.5 shrink-0",
                            isAreaActive ? "text-primary" : "text-sidebar-foreground/60"
                          )}
                        />
                        <span className="truncate">{area.title}</span>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {area.id === "jobs" ? (
                          <Badge variant="secondary" className="h-4 px-1.5 text-[9px]">
                            {editions.length}
                          </Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className="px-1 py-0 text-[9px] font-normal border-sidebar-border/60 text-sidebar-foreground/70"
                          >
                            {area.secondaryMenu.length}
                          </Badge>
                        )}
                        <Icons.ChevronDown
                          className={cn(
                            "size-3.5 text-sidebar-foreground/60 transition-transform duration-200",
                            isExpanded ? "rotate-0" : "-rotate-90"
                          )}
                        />
                      </div>
                    </button>

                    {/* Alan Alt Öğeleri (Akordeon Açıldığında) */}
                    {isExpanded && (
                      <div className="flex flex-col gap-0.5 border-t border-sidebar-border/30 px-1.5 py-1.5">
                        {area.id === "jobs" ? (
                          <>
                            <button
                              onClick={() => {
                                onSelectJobsFilter?.("all");
                                setModule("editions", "all");
                                onNavigate?.();
                              }}
                              className={cn(
                                "group relative flex items-center justify-between rounded-md px-2 py-1.5 text-left text-xs transition-colors",
                                jobsFilter === "all" || (!jobsFilter && (!moduleSubView || moduleSubView === "all"))
                                  ? "bg-primary text-primary-foreground font-medium shadow-2xs"
                                  : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                              )}
                              aria-label={t("modules.editions")}
                            >
                              <span className="truncate">{t("modules.editions")}</span>
                              <Badge
                                variant={jobsFilter === "all" ? "outline" : "secondary"}
                                className="h-4 px-1 text-[9px]"
                              >
                                {editions.length}
                              </Badge>
                            </button>

                            {area.secondaryMenu.map((item) => {
                              const isSelected = isGlobalSubItemActive("jobs", item.id);
                              return (
                                <button
                                  key={item.id}
                                  onClick={() => handleGlobalSubItemClick("jobs", item.id)}
                                  className={cn(
                                    "group relative flex items-center justify-between rounded-md px-2 py-1.5 text-left text-xs transition-colors",
                                    isSelected
                                      ? "bg-primary text-primary-foreground font-medium shadow-2xs"
                                      : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                                  )}
                                >
                                  <span className="truncate">{item.title}</span>
                                  {item.id === "active" && editions.filter((e) => !e.isPublished && e.status !== "ARCHIVED").length > 0 && (
                                    <Badge variant={isSelected ? "outline" : "secondary"} className="h-4 px-1 text-[9px]">
                                      {editions.filter((e) => e.status !== "ARCHIVED").length}
                                    </Badge>
                                  )}
                                  {isSelected && <span className="size-1.5 rounded-full bg-primary-foreground shrink-0" />}
                                </button>
                              );
                            })}
                          </>
                        ) : (
                          area.secondaryMenu.map((item) => {
                            const isSelected = isGlobalSubItemActive(area.id, item.id);
                            return (
                              <button
                                key={item.id}
                                onClick={() => {
                                  if (area.id === "reports") {
                                    setModule("company-reports", item.id);
                                  }
                                  handleGlobalSubItemClick(area.id, item.id);
                                }}
                                title={item.hint}
                                className={cn(
                                  "group relative flex items-center justify-between rounded-md px-2 py-1.5 text-left text-xs transition-colors",
                                  isSelected
                                    ? "bg-primary text-primary-foreground font-medium shadow-2xs"
                                    : "text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                                )}
                              >
                                <span className="truncate">{item.title}</span>
                                {isSelected && <span className="size-1.5 rounded-full bg-primary-foreground shrink-0" />}
                              </button>
                            );
                          })
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </nav>
    </div>
  );
}
