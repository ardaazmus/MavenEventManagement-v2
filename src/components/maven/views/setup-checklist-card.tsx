"use client";
import React, { useState } from "react";
import { SetupChecklistResult, ChecklistStep } from "@/lib/events/setup-checklist";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import * as Icons from "lucide-react";
import { cn } from "@/lib/utils";

interface SetupChecklistCardProps {
  checklist: SetupChecklistResult | null;
  loading?: boolean;
  onNavigateModule: (moduleKey: string) => void;
  onRefresh?: () => void;
}

export function SetupChecklistCard({
  checklist,
  loading = false,
  onNavigateModule,
  onRefresh,
}: SetupChecklistCardProps) {
  const [expanded, setExpanded] = useState(false);

  if (!checklist) {
    if (loading) {
      return (
        <div className="rounded-xl border bg-card p-6 shadow-sm animate-pulse">
          <div className="h-6 w-1/3 bg-muted rounded mb-4" />
          <div className="h-4 w-2/3 bg-muted rounded" />
        </div>
      );
    }
    return null;
  }

  const {
    completionPct,
    completedStepsCount,
    totalRequiredStepsCount,
    isPublished,
    nextStep,
    steps,
  } = checklist;

  return (
    <div className="rounded-xl border border-teal-200 bg-gradient-to-br from-teal-50/50 via-background to-background p-6 shadow-sm mb-6 dark:border-teal-900/50 dark:from-teal-950/20">
      {/* Üst Başlık & İlerleme */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
        <div>
          <div className="flex items-center gap-2">
            <Icons.CheckCircle2 className="h-5 w-5 text-teal-600 dark:text-teal-400" />
            <h3 className="text-lg font-semibold text-foreground">
              Etkinlik Kurulum Rehberi
            </h3>
            {isPublished && (
              <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-300">
                Yayında
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Etkinliği katılımcılara ve iş ortaklarına hazır hale getirmek için adımları tamamlayın.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {onRefresh && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onRefresh}
              disabled={loading}
              className="text-muted-foreground hover:text-foreground"
            >
              <Icons.RefreshCw className={cn("h-4 w-4 mr-1", loading && "animate-spin")} />
              Yenile
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? "Özeti Daralt" : "Tüm Adımları Gör"}
            {expanded ? (
              <Icons.ChevronUp className="h-4 w-4 ml-1" />
            ) : (
              <Icons.ChevronDown className="h-4 w-4 ml-1" />
            )}
          </Button>
        </div>
      </div>

      {/* İlerleme Çubuğu */}
      <div className="space-y-2 mb-6">
        <div className="flex justify-between text-sm font-medium">
          <span className="text-foreground">
            Kurulum İlerlemesi: %{completionPct}
          </span>
          <span className="text-muted-foreground">
            {completedStepsCount} / {totalRequiredStepsCount} Zorunlu Adım
          </span>
        </div>
        <Progress value={completionPct} className="h-2 bg-muted" />
      </div>

      {/* Sıradaki Önerilen Adım Banner'ı */}
      {nextStep && !isPublished && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-lg bg-teal-100/70 p-4 border border-teal-300 dark:bg-teal-900/30 dark:border-teal-800 mb-4">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 rounded-full bg-teal-600 p-1 text-white">
              <Icons.ArrowRight className="h-4 w-4" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-teal-800 dark:text-teal-300">
                Sıradaki Önerilen Adım
              </p>
              <p className="text-sm font-medium text-foreground">
                {nextStep.title}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {nextStep.description}
              </p>
            </div>
          </div>
          <Button
            size="sm"
            className="bg-teal-700 hover:bg-teal-800 text-white shrink-0"
            onClick={() => onNavigateModule(nextStep.targetModule)}
          >
            {nextStep.actionLabel}
            <Icons.ExternalLink className="h-3.5 w-3.5 ml-1.5" />
          </Button>
        </div>
      )}

      {/* Ayrıntılı Adım Listesi (Genişletildiğinde) */}
      {expanded && (
        <div className="grid gap-3 pt-2 border-t">
          {steps.map((step: ChecklistStep) => {
            const isCompleted = step.status === "COMPLETED";
            const isOptional = step.status === "OPTIONAL";

            return (
              <div
                key={step.key}
                className={cn(
                  "flex items-center justify-between p-3 rounded-lg border text-sm transition-colors",
                  isCompleted
                    ? "bg-muted/30 border-muted text-muted-foreground"
                    : "bg-card border-border hover:border-teal-300"
                )}
              >
                <div className="flex items-center gap-3 min-w-0">
                  {isCompleted ? (
                    <Icons.CheckCircle className="h-5 w-5 text-emerald-600 shrink-0" />
                  ) : isOptional ? (
                    <Icons.HelpCircle className="h-5 w-5 text-muted-foreground shrink-0" />
                  ) : (
                    <Icons.Circle className="h-5 w-5 text-amber-500 shrink-0" />
                  )}
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={cn("font-medium", isCompleted && "line-through text-muted-foreground")}>
                        {step.title}
                      </span>
                      {isOptional && (
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                          İsteğe Bağlı
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground truncate">
                      {step.detail || step.description}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0 ml-4">
                  <Button
                    variant={isCompleted ? "ghost" : "outline"}
                    size="sm"
                    className="h-8 text-xs"
                    onClick={() => onNavigateModule(step.targetModule)}
                  >
                    {step.actionLabel}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
