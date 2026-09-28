"use client";

import React, { useState, useMemo } from "react";
import * as Icons from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SectionCard, EmptyState, Loading, ErrorState, useApi, Chip, StatusBadge } from "../bits";
import { calculateSessionCme, CmeEarnedResult } from "@/lib/onsite/cme-tracker";
import { apiSend, listEntity } from "@/lib/client";
import { useLang } from "@/lib/i18n";
import { useToast } from "@/hooks/use-toast";
import { useApp } from "@/lib/store";
import { fmtDateTime } from "@/lib/constants";
import { cn } from "@/lib/utils";

interface ProgramSessionRow {
  id: string;
  title: string;
  type: string;
  startTime: string;
  endTime: string;
  cmeCredits?: number | null;
  room?: { name: string } | null;
}

interface SessionScanRow {
  id: string;
  sessionId?: string | null;
  action: string;
  result: string;
  scannedAt: string;
  participation?: {
    id: string;
    person: { id: string; firstName: string; lastName: string; company?: string | null; title?: string | null };
  } | null;
}

export function SessionCmeConsole() {
  const { currentEditionId, refreshKey } = useApp();
  const { toast } = useToast();
  const { t } = useLang();

  const [selectedSessionId, setSelectedSessionId] = useState<string>("");
  const [scanAction, setScanAction] = useState<"SESSION_ENTRY" | "SESSION_EXIT">("SESSION_ENTRY");
  const [scanCode, setScanCode] = useState("");
  const [isScanning, setIsScanning] = useState(false);

  // Fetch sessions
  const { data: sessions, loading: loadingSessions } = useApi<ProgramSessionRow[]>(() => {
    if (!currentEditionId) return Promise.resolve([]);
    return listEntity<ProgramSessionRow>("program-sessions", { limit: 100 });
  }, [currentEditionId, refreshKey]);

  // Fetch session scan events
  const { data: scans, reload: reloadScans, loading: loadingScans } = useApi<SessionScanRow[]>(() => {
    return listEntity<SessionScanRow>("scan-events", { limit: 200 });
  }, [currentEditionId, refreshKey]);

  const activeSession = useMemo(() => {
    return (sessions ?? []).find((s) => s.id === selectedSessionId) ?? sessions?.[0];
  }, [sessions, selectedSessionId]);

  // Set default session if none selected
  React.useEffect(() => {
    if (!selectedSessionId && sessions && sessions.length > 0) {
      setSelectedSessionId(sessions[0].id);
    }
  }, [sessions, selectedSessionId]);

  // Calculate CME results for the active session
  const attendeeCmeResults = useMemo(() => {
    if (!activeSession) return [];

    const sessionScans = (scans ?? []).filter((s) => s.sessionId === activeSession.id);
    const byParticipation = new Map<string, { person: any; entries: Date[]; exits: Date[] }>();

    for (const scan of sessionScans) {
      if (!scan.participation) continue;
      const pId = scan.participation.id;
      if (!byParticipation.has(pId)) {
        byParticipation.set(pId, {
          person: scan.participation.person,
          entries: [],
          exits: [],
        });
      }
      const record = byParticipation.get(pId)!;
      if (scan.action === "SESSION_ENTRY" || scan.action === "ENTRY") {
        record.entries.push(new Date(scan.scannedAt));
      } else if (scan.action === "SESSION_EXIT" || scan.action === "EXIT") {
        record.exits.push(new Date(scan.scannedAt));
      }
    }

    const results: { person: any; cme: CmeEarnedResult }[] = [];

    byParticipation.forEach((val) => {
      // Pair intervals
      const intervals = val.entries.map((entryTime, idx) => ({
        entryTime,
        exitTime: val.exits[idx] ?? null,
      }));

      const cme = calculateSessionCme(
        {
          sessionId: activeSession.id,
          sessionTitle: activeSession.title,
          roomName: activeSession.room?.name,
          startTime: activeSession.startTime,
          endTime: activeSession.endTime,
          maxCredits: activeSession.cmeCredits || 1.5,
          qualifyingThresholdPct: 70,
        },
        intervals.length > 0 ? intervals : [{ entryTime: new Date(activeSession.startTime) }]
      );

      results.push({ person: val.person, cme });
    });

    return results;
  }, [activeSession, scans]);

  const handleScanSession = async () => {
    if (!scanCode.trim() || !activeSession) return;
    setIsScanning(true);
    try {
      const res = await apiSend<any>("/api/scan", "POST", {
        code: scanCode.trim(),
        sessionId: activeSession.id,
        door: activeSession.room?.name || "Oturum Salonu",
        action: scanAction,
      });

      toast({
        title: scanAction === "SESSION_ENTRY" ? t("cme.scanEntrySaved") : t("cme.scanExitSaved"),
        description: res.person ? `${res.person.name} (${activeSession.title.slice(0, 30)}...)` : "Tarama başarılı",
      });
      setScanCode("");
      reloadScans();
    } catch (err) {
      toast({
        title: "Tarama Hatası",
        description: err instanceof Error ? err.message : "İşlem başarısız",
        variant: "destructive",
      });
    } finally {
      setIsScanning(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Session Selection & Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-card p-4 shadow-sm">
        <div className="flex flex-1 items-center gap-3 min-w-[280px]">
          <div className="grid size-10 place-items-center rounded-xl bg-violet-500/10 text-violet-600">
            <Icons.GraduationCap className="size-5" />
          </div>
          <div className="flex-1">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Aktif Akredite Oturum
            </span>
            <Select value={selectedSessionId} onValueChange={setSelectedSessionId}>
              <SelectTrigger className="mt-1 h-9 font-medium">
                <SelectValue placeholder={t("cme.selectSessionPh")} />
              </SelectTrigger>
              <SelectContent>
                {(sessions ?? []).map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.title} ({s.room?.name ?? "Salon belirtilmedi"} · {s.cmeCredits ?? 1.5} CME)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {activeSession && (
          <div className="flex items-center gap-2">
            <Chip tone="violet">
              {activeSession.cmeCredits ?? 1.5} CME / CPD Kredisi
            </Chip>
            <Chip tone="teal">
              Baraj: %70 Katılım Süresi
            </Chip>
          </div>
        )}
      </div>

      {/* Session Scanner Bar */}
      <div className="grid gap-4 lg:grid-cols-5">
        <SectionCard
          title={t("cme.doorScanner")}
          desc="Salona giren ve çıkan katılımcıların yaka kartı / QR taraması"
          className="lg:col-span-2"
        >
          <div className="flex gap-2 mb-3">
            <button
              type="button"
              onClick={() => setScanAction("SESSION_ENTRY")}
              className={cn(
                "flex-1 rounded-lg border py-2 text-xs font-semibold transition flex items-center justify-center gap-1.5",
                scanAction === "SESSION_ENTRY"
                  ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                  : "text-muted-foreground hover:bg-muted/40"
              )}
            >
              <Icons.LogIn className="size-3.5" /> Giriş Taraması
            </button>
            <button
              type="button"
              onClick={() => setScanAction("SESSION_EXIT")}
              className={cn(
                "flex-1 rounded-lg border py-2 text-xs font-semibold transition flex items-center justify-center gap-1.5",
                scanAction === "SESSION_EXIT"
                  ? "border-amber-500 bg-amber-50 text-amber-700"
                  : "text-muted-foreground hover:bg-muted/40"
              )}
            >
              <Icons.LogOut className="size-3.5" /> Çıkış Taraması
            </button>
          </div>

          <div className="flex gap-2">
            <Input
              placeholder="Yaka kartı no / QR kodu okutunuz..."
              value={scanCode}
              onChange={(e) => setScanCode(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleScanSession()}
              className="font-mono text-sm"
            />
            <Button
              onClick={handleScanSession}
              disabled={isScanning || !scanCode.trim()}
              className={cn(
                "text-white",
                scanAction === "SESSION_ENTRY" ? "bg-emerald-600 hover:bg-emerald-700" : "bg-amber-600 hover:bg-amber-700"
              )}
            >
              {isScanning ? <Icons.Loader2 className="size-4 animate-spin" /> : <Icons.ScanLine className="size-4" />}
              {scanAction === "SESSION_ENTRY" ? "Giriş" : "Çıkış"}
            </Button>
          </div>

          <div className="mt-4 rounded-xl border bg-muted/20 p-3 text-xs text-muted-foreground space-y-1">
            <p className="font-semibold text-foreground">CME Kredi Akreditasyon Mantığı:</p>
            <p>• Oturum süresinin <strong>%70 ve üzeri</strong> dinlenmesi halinde tam CME kredisi atanır.</p>
            <p>• <strong>%50 - %70</strong> arası kalışlarda orantılı kredi hesaplanır.</p>
            <p>• Katılım raporu sertifika modülüne otomatik CME puanı olarak yansıtılır.</p>
          </div>
        </SectionCard>

        {/* Live CME Qualified Attendees List */}
        <SectionCard
          title="Katılım Süresi & CME Hak Ediş Listesi"
          desc="Oturumda bulunan dinleyicilerin anlık dakika ve hak ediş hesabı"
          className="lg:col-span-3"
        >
          {attendeeCmeResults.length === 0 ? (
            <EmptyState
              title="Bu oturumda henüz tarama kaydı yok"
              desc="Kapıda QR kod okutulduğunda katılımcıların süre ve CME kredi hak edişleri burada listelenir."
            />
          ) : (
            <div className="maven-scroll max-h-96 overflow-y-auto rounded-lg border">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-card text-left text-muted-foreground border-b">
                  <tr>
                    <th className="px-3 py-2 font-medium">Katılımcı</th>
                    <th className="px-3 py-2 font-medium">Kalış Süresi</th>
                    <th className="px-3 py-2 font-medium">Oran</th>
                    <th className="px-3 py-2 font-medium">Kazanılan CME</th>
                    <th className="px-3 py-2 text-right font-medium">Durum</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {attendeeCmeResults.map(({ person, cme }) => (
                    <tr key={person.id} className="hover:bg-muted/30 transition">
                      <td className="px-3 py-2.5">
                        <div className="font-medium text-foreground">
                          {person.firstName} {person.lastName}
                        </div>
                        {person.company && (
                          <div className="text-[11px] text-muted-foreground">{person.company}</div>
                        )}
                      </td>
                      <td className="px-3 py-2.5 font-mono text-[11px]">
                        {cme.attendedMinutes} dk / {cme.scheduledMinutes} dk
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-1.5">
                          <div className="w-16 h-2 rounded-full bg-muted overflow-hidden">
                            <div
                              className={cn(
                                "h-full rounded-full",
                                cme.attendancePercentage >= 70
                                  ? "bg-emerald-500"
                                  : cme.attendancePercentage >= 50
                                    ? "bg-amber-500"
                                    : "bg-rose-500"
                              )}
                              style={{ width: `${cme.attendancePercentage}%` }}
                            />
                          </div>
                          <span className="text-[11px] font-semibold">%{cme.attendancePercentage}</span>
                        </div>
                      </td>
                      <td className="px-3 py-2.5 font-bold text-teal-600 font-mono">
                        {cme.earnedCredits} / {cme.maxCredits} CME
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <Chip
                          tone={
                            cme.status === "QUALIFIED"
                              ? "emerald"
                              : cme.status === "PARTIAL"
                                ? "amber"
                                : cme.status === "IN_PROGRESS"
                                  ? "teal"
                                  : "rose"
                          }
                        >
                          {cme.status === "QUALIFIED"
                            ? "Hak Kazandı"
                            : cme.status === "PARTIAL"
                              ? "Kısmi Kredi"
                              : cme.status === "IN_PROGRESS"
                                ? "Devam Ediyor"
                                : "Yetersiz"}
                        </Chip>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </SectionCard>
      </div>
    </div>
  );
}
