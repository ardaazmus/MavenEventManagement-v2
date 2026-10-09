"use client";
import React from "react";
import { useApp } from "@/lib/store";
import { WORK_CONTEXT_BRIDGES } from "@/lib/product-taxonomy";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import * as Icons from "lucide-react";
import { cn } from "@/lib/utils";
import { t } from "@/lib/i18n";

function DynamicIcon({ name, className }: { name: string; className?: string }) {
  const IconComponent = (Icons as unknown as Record<string, Icons.LucideIcon>)[name] ?? Icons.Circle;
  return <IconComponent className={className} />;
}

interface ModuleContextBridgeProps {
  className?: string;
  compact?: boolean;
}

export function ModuleContextBridge({ className, compact = false }: ModuleContextBridgeProps) {
  const { module, setModule, currentEditionId, editions } = useApp();
  const currentWork = editions.find((e) => e.id === currentEditionId);

  // Bir iş seçili değilse köprüyü gösterme
  if (!currentWork) {
    return null;
  }

  return (
    <div
      role="navigation"
      aria-label={t("contextBridge.ariaLabel")}
      className={cn(
        "flex max-w-full overflow-hidden flex-wrap items-center justify-between gap-2 rounded-xl border border-border/70 bg-card/60 px-3 py-2 text-xs backdrop-blur-sm",
        className
      )}
    >
      <div className="flex items-center gap-2">
        <span className="flex size-2 rounded-full bg-primary" aria-hidden />
        <span className="font-semibold text-foreground/80">{t("contextBridge.title")}:</span>
        {!compact && (
          <span className="hidden text-muted-foreground sm:inline">
            {currentWork.name}
          </span>
        )}
      </div>

      <div className="flex items-center gap-1">
        {WORK_CONTEXT_BRIDGES.map((bridge) => {
          const isActive = module === bridge.targetModuleId;
          const labelText = t(bridge.labelKey);

          return (
            <Tooltip key={bridge.id}>
              <TooltipTrigger asChild>
                <Button
                  variant={isActive ? "secondary" : "ghost"}
                  size="sm"
                  onClick={() => {
                    if (bridge.subView) {
                      setModule(bridge.targetModuleId, bridge.subView);
                    } else {
                      setModule(bridge.targetModuleId);
                    }
                  }}
                  className={cn(
                    "h-7 gap-1.5 px-2 text-xs font-medium transition-colors",
                    isActive
                      ? "bg-primary/10 text-primary hover:bg-primary/15"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                  aria-current={isActive ? "page" : undefined}
                >
                  <DynamicIcon name={bridge.icon} className="size-3.5" />
                  <span className={cn(compact && "hidden md:inline")}>{labelText}</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="text-xs">
                <span>{labelText}</span>
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </div>
  );
}
