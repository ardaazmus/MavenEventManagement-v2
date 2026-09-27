"use client";

import React, { useMemo } from "react";
import * as Icons from "lucide-react";
import { cn } from "@/lib/utils";
import { Chip } from "../bits";

export interface OccupancyStats {
  uniqueArrived: number;
  currentInside: number;
  totalExits: number;
  maxCapacity?: number;
  rescansCount: number;
  deniedCount: number;
  hourlyFlow?: { hour: string; entries: number; exits: number }[];
}

export function InsideOccupancyWidget({
  stats,
  doorFilter,
  onResetDoor,
}: {
  stats: OccupancyStats;
  doorFilter?: string;
  onResetDoor?: () => void;
}) {
  const maxCap = stats.maxCapacity || 2500;
  const occupancyRate = Math.min(100, Math.round((stats.currentInside / maxCap) * 100));

  const statusTone =
    occupancyRate >= 90
      ? "rose"
      : occupancyRate >= 75
        ? "amber"
        : "emerald";

  return (
    <div className="relative overflow-hidden rounded-2xl border bg-gradient-to-br from-card via-card to-muted/20 p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div
            className={cn(
              "grid size-12 place-items-center rounded-xl text-white shadow-md transition-all",
              statusTone === "emerald"
                ? "bg-emerald-500 shadow-emerald-500/20"
                : statusTone === "amber"
                  ? "bg-amber-500 shadow-amber-500/20"
                  : "bg-rose-500 shadow-rose-500/20"
            )}
          >
            <Icons.Users className="size-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold text-foreground">Canlı Alan Doluluk Sayacı</h3>
              <span className="flex size-2 rounded-full bg-emerald-500 animate-pulse" title="Canlı akış aktif" />
            </div>
            <p className="text-xs text-muted-foreground">
              Turnike ve kapı taramalarıyla anlık net içerideki kişi sayısı
              {doorFilter ? ` (${doorFilter})` : ""}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {doorFilter && onResetDoor && (
            <button
              onClick={onResetDoor}
              className="text-xs text-muted-foreground hover:text-foreground underline"
            >
              Tüm Kapılar
            </button>
          )}
          <Chip tone={statusTone}>
            %{occupancyRate} Kapasite
          </Chip>
        </div>
      </div>

      {/* Main big numbers */}
      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border bg-card/60 p-3.5">
          <span className="text-xs font-medium text-muted-foreground">Şu An İçeride</span>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-3xl font-black tracking-tight text-emerald-600">
              {stats.currentInside.toLocaleString("tr-TR")}
            </span>
            <span className="text-xs text-muted-foreground">kişi</span>
          </div>
          <span className="text-[11px] text-muted-foreground">Net mevcudiyet</span>
        </div>

        <div className="rounded-xl border bg-card/60 p-3.5">
          <span className="text-xs font-medium text-muted-foreground">Toplam Giriş Yapan</span>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-3xl font-black tracking-tight text-foreground">
              {stats.uniqueArrived.toLocaleString("tr-TR")}
            </span>
            <span className="text-xs text-muted-foreground">tekil</span>
          </div>
          <span className="text-[11px] text-muted-foreground">Giriş kaydı olan</span>
        </div>

        <div className="rounded-xl border bg-card/60 p-3.5">
          <span className="text-xs font-medium text-muted-foreground">Alandan Çıkan</span>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-3xl font-black tracking-tight text-muted-foreground">
              {stats.totalExits.toLocaleString("tr-TR")}
            </span>
            <span className="text-xs text-muted-foreground">çıkış</span>
          </div>
          <span className="text-[11px] text-muted-foreground">Turnikeden ayrılan</span>
        </div>

        <div className="rounded-xl border bg-card/60 p-3.5">
          <span className="text-xs font-medium text-muted-foreground">Salon Üst Limiti</span>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-3xl font-black tracking-tight text-foreground">
              {maxCap.toLocaleString("tr-TR")}
            </span>
            <span className="text-xs text-muted-foreground">maks</span>
          </div>
          <span className="text-[11px] text-muted-foreground">Güvenlik tavanı</span>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="mt-4 space-y-1.5">
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>Doluluk İlerlemesi ({stats.currentInside} / {maxCap})</span>
          <span className="font-semibold text-foreground">%{occupancyRate}</span>
        </div>
        <div className="h-3 w-full overflow-hidden rounded-full bg-muted/60">
          <div
            className={cn(
              "h-full transition-all duration-500 rounded-full",
              statusTone === "emerald"
                ? "bg-emerald-500"
                : statusTone === "amber"
                  ? "bg-amber-500"
                  : "bg-rose-500"
            )}
            style={{ width: `${occupancyRate}%` }}
          />
        </div>
      </div>

      {occupancyRate >= 90 && (
        <div className="mt-3 flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 p-2.5 text-xs text-rose-800">
          <Icons.AlertTriangle className="size-4 shrink-0 text-rose-600" />
          <span>
            <strong>Uyarı:</strong> Salon doluluğu %90 eşiğini aştı. Giriş kapılarında akış yavaşlatması önerilir.
          </span>
        </div>
      )}
    </div>
  );
}
