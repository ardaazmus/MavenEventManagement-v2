"use client";
import React, { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { checkSessionConflicts, ConflictCheckResult } from "@/lib/scientific/conflict-detector";
import { AlertTriangle, Clock, MapPin, Users, Plus, MoveRight, CheckCircle2, ShieldAlert } from "lucide-react";
import { useLang } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export interface TimetableRoom {
  id: string;
  name: string;
  capacity: number;
}

export interface TimetableSession {
  id: string;
  title: string;
  roomId?: string | null;
  trackId?: string | null;
  track?: { name: string } | null;
  type: string;
  status: string;
  startTime: string;
  endTime: string;
  capacity?: number | null;
  assignments?: { id: string; role: string; person?: { firstName: string; lastName: string } | null }[];
}

export interface TimetableGridProps {
  sessions: TimetableSession[];
  rooms: TimetableRoom[];
  onSessionMove?: (sessionId: string, newRoomId: string, newStartTime: string, newEndTime: string) => Promise<void>;
  onSessionClick?: (session: TimetableSession) => void;
}

const TIME_SLOTS = [
  "08:00", "08:30", "09:00", "09:30", "10:00", "10:30",
  "11:00", "11:30", "12:00", "12:30", "13:00", "13:30",
  "14:00", "14:30", "15:00", "15:30", "16:00", "16:30",
  "17:00", "17:30", "18:00"
];

export function TimetableGrid({ sessions, rooms, onSessionMove, onSessionClick }: TimetableGridProps) {
  const { t } = useLang();
  const [selectedSession, setSelectedSession] = useState<TimetableSession | null>(null);
  const [moveDialogOpen, setMoveDialogOpen] = useState(false);
  const [targetRoomId, setTargetRoomId] = useState<string>("");
  const [targetStart, setTargetStart] = useState<string>("");
  const [targetEnd, setTargetEnd] = useState<string>("");
  const [previewConflict, setPreviewConflict] = useState<ConflictCheckResult | null>(null);
  const [saving, setSaving] = useState(false);

  // Atanmamış oturumlar havuzu (Dock)
  const unassignedSessions = useMemo(() => {
    return sessions.filter((s) => !s.roomId || !s.startTime || s.startTime.includes("1970"));
  }, [sessions]);

  // Atanmış oturumlar
  const assignedSessions = useMemo(() => {
    return sessions.filter((s) => s.roomId && s.startTime && !s.startTime.includes("1970"));
  }, [sessions]);

  // Tüm oturumlar için anlık çakışma haritası
  const conflictMap = useMemo(() => {
    const map = new Map<string, ConflictCheckResult>();
    const sessionCandidates = sessions.map((s) => ({
      id: s.id,
      title: s.title,
      roomId: s.roomId,
      startTime: s.startTime,
      endTime: s.endTime,
      capacity: s.capacity,
      speakerIds: s.assignments?.map((a) => a.person ? `${a.person.firstName} ${a.person.lastName}` : a.id),
      trackId: s.trackId,
    }));

    for (const sc of sessionCandidates) {
      if (!sc.roomId) continue;
      const res = checkSessionConflicts(sc, sessionCandidates, rooms);
      if (res.hasConflict || res.softWarnings.length > 0) {
        map.set(sc.id, res);
      }
    }
    return map;
  }, [sessions, rooms]);

  const openMoveModal = (session: TimetableSession) => {
    setSelectedSession(session);
    setTargetRoomId(session.roomId ?? (rooms[0]?.id || ""));
    const dStart = new Date(session.startTime);
    const dEnd = new Date(session.endTime);
    const pad = (n: number) => String(n).padStart(2, "0");
    const sStr = isNaN(dStart.getTime()) ? "09:00" : `${pad(dStart.getHours())}:${pad(dStart.getMinutes())}`;
    const eStr = isNaN(dEnd.getTime()) ? "10:00" : `${pad(dEnd.getHours())}:${pad(dEnd.getMinutes())}`;
    setTargetStart(sStr);
    setTargetEnd(eStr);

    // Initial conflict preview
    recheck(session.id, session.roomId ?? (rooms[0]?.id || ""), sStr, eStr);
    setMoveDialogOpen(true);
  };

  const recheck = (sessionId: string, roomId: string, startStr: string, endStr: string) => {
    const today = new Date().toISOString().split("T")[0];
    const sDate = new Date(`${today}T${startStr}:00`);
    const eDate = new Date(`${today}T${endStr}:00`);

    const candidate = {
      id: sessionId,
      title: selectedSession?.title ?? "Oturum",
      roomId,
      startTime: sDate,
      endTime: eDate,
      capacity: selectedSession?.capacity,
      speakerIds: selectedSession?.assignments?.map((a) => a.person ? `${a.person.firstName} ${a.person.lastName}` : a.id),
    };

    const sessionCandidates = sessions.map((s) => ({
      id: s.id,
      title: s.title,
      roomId: s.id === sessionId ? roomId : s.roomId,
      startTime: s.id === sessionId ? sDate : new Date(s.startTime),
      endTime: s.id === sessionId ? eDate : new Date(s.endTime),
      capacity: s.capacity,
      speakerIds: s.assignments?.map((a) => a.person ? `${a.person.firstName} ${a.person.lastName}` : a.id),
    }));

    const result = checkSessionConflicts(candidate, sessionCandidates, rooms);
    setPreviewConflict(result);
  };

  const handleConfirmMove = async () => {
    if (!selectedSession || !onSessionMove) return;
    setSaving(true);
    try {
      const today = new Date().toISOString().split("T")[0];
      const startIso = new Date(`${today}T${targetStart}:00`).toISOString();
      const endIso = new Date(`${today}T${targetEnd}:00`).toISOString();
      await onSessionMove(selectedSession.id, targetRoomId, startIso, endIso);
      setMoveDialogOpen(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Üst Bar: İstatistik ve Çakışma Özeti */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-muted/30 p-3">
        <div className="flex items-center gap-4 text-xs">
          <span className="font-semibold text-foreground">RainFocus Timetable Matrix</span>
          <span className="text-muted-foreground">{rooms.length} Salon · {sessions.length} Toplam Oturum</span>
          {conflictMap.size > 0 ? (
            <Badge variant="destructive" className="gap-1 animate-pulse">
              <ShieldAlert className="size-3" />
              {conflictMap.size} Çakışma / Uyarı Tespit Edildi
            </Badge>
          ) : (
            <Badge variant="outline" className="border-emerald-500/50 text-emerald-600 gap-1">
              <CheckCircle2 className="size-3" />
              Çakışma Yok (Temiz)
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <span className="size-2.5 rounded-full bg-rose-500" /> Sert Çakışma (Salon/Konuşmacı)
          </span>
          <span className="flex items-center gap-1">
            <span className="size-2.5 rounded-full bg-amber-500" /> Devir &lt;15dk / Kapasite
          </span>
        </div>
      </div>

      {/* Ana Izgara Alanı */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        {/* Sol 3 Kolon: Zaman x Salon Matrisi */}
        <div className="lg:col-span-3 overflow-x-auto rounded-xl border bg-background">
          <table className="w-full border-collapse text-left text-xs min-w-[700px]">
            <thead>
              <tr className="border-b bg-muted/60 text-muted-foreground">
                <th className="w-24 p-3 font-medium border-r text-center">Saat</th>
                {rooms.map((room) => (
                  <th key={room.id} className="p-3 font-semibold text-foreground border-r last:border-r-0">
                    <div className="flex items-center justify-between">
                      <span>{room.name}</span>
                      <span className="text-[11px] font-normal text-muted-foreground flex items-center gap-1">
                        <Users className="size-3" /> {room.capacity}
                      </span>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {TIME_SLOTS.map((slot) => {
                return (
                  <tr key={slot} className="hover:bg-muted/10 transition-colors h-16">
                    <td className="p-2 border-r font-mono text-center text-muted-foreground bg-muted/20 align-top">
                      {slot}
                    </td>
                    {rooms.map((room) => {
                      // Bu salon ve saat diliminde başlayan oturumlar
                      const matchingSessions = assignedSessions.filter((s) => {
                        if (s.roomId !== room.id) return false;
                        const d = new Date(s.startTime);
                        const pad = (n: number) => String(n).padStart(2, "0");
                        const sessTime = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
                        return sessTime === slot;
                      });

                      return (
                        <td key={`${slot}-${room.id}`} className="p-1.5 border-r last:border-r-0 align-top relative group">
                          {matchingSessions.map((session) => {
                            const conflict = conflictMap.get(session.id);
                            return (
                              <div
                                key={session.id}
                                onClick={() => onSessionClick ? onSessionClick(session) : openMoveModal(session)}
                                className={cn(
                                  "rounded-lg border p-2 shadow-xs cursor-pointer transition-all hover:scale-[1.02]",
                                  conflict?.hasConflict
                                    ? "border-rose-400 bg-rose-50 text-rose-950 dark:bg-rose-950/40 dark:text-rose-200"
                                    : conflict?.softWarnings.length
                                    ? "border-amber-400 bg-amber-50 text-amber-950 dark:bg-amber-950/40 dark:text-amber-200"
                                    : "border-primary/20 bg-primary/5 hover:border-primary/40 text-foreground"
                                )}
                              >
                                <div className="flex items-start justify-between gap-1">
                                  <span className="font-semibold text-xs line-clamp-1">{session.title}</span>
                                  {conflict && (
                                    <AlertTriangle className={cn("size-3.5 shrink-0", conflict.hasConflict ? "text-rose-600 animate-bounce" : "text-amber-600")} />
                                  )}
                                </div>
                                <div className="mt-1 flex items-center justify-between text-[10px] text-muted-foreground">
                                  <span className="flex items-center gap-1 font-mono">
                                    <Clock className="size-3" />
                                    {new Date(session.startTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} - {new Date(session.endTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                                  </span>
                                  <Badge variant="outline" className="text-[9px] px-1 py-0 h-4">
                                    {session.type}
                                  </Badge>
                                </div>
                                {session.assignments && session.assignments.length > 0 && (
                                  <div className="mt-1 text-[10px] text-muted-foreground truncate">
                                    {session.assignments.map((a) => a.person ? `${a.person.firstName} ${a.person.lastName}` : "").filter(Boolean).join(", ")}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Sağ Kolon: Atanmamış Oturum Dock'u (Unassigned Session Pool) */}
        <div className="rounded-xl border bg-muted/20 p-3 space-y-3">
          <div className="flex items-center justify-between border-b pb-2">
            <div>
              <h4 className="text-xs font-semibold text-foreground">Atanmamış Oturum Dock&apos;u</h4>
              <p className="text-[11px] text-muted-foreground">Izgaraya taşınmayı bekleyenler ({unassignedSessions.length})</p>
            </div>
            <Badge variant="secondary" className="font-mono text-xs">{unassignedSessions.length}</Badge>
          </div>

          <div className="space-y-2 max-h-[600px] overflow-y-auto pr-1">
            {unassignedSessions.length === 0 ? (
              <div className="p-4 text-center text-xs text-muted-foreground">
                Tüm oturumlar salona ve zamana yerleştirildi.
              </div>
            ) : (
              unassignedSessions.map((session) => (
                <div
                  key={session.id}
                  className="rounded-lg border bg-background p-2.5 shadow-xs transition hover:border-primary/40 space-y-1.5"
                >
                  <div className="flex items-start justify-between gap-1">
                    <p className="text-xs font-medium text-foreground line-clamp-2">{session.title}</p>
                    <Badge variant="outline" className="text-[10px] shrink-0">{session.type}</Badge>
                  </div>
                  {session.track && (
                    <span className="text-[10px] text-primary/80 font-medium">#{session.track.name}</span>
                  )}
                  <div className="flex items-center justify-between pt-1">
                    <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                      <Users className="size-3" /> Kapasite: {session.capacity ?? "—"}
                    </span>
                    <Button size="sm" variant="outline" className="h-6 text-[10px] px-2" onClick={() => openMoveModal(session)}>
                      <Plus className="size-3 mr-1" /> Izgaraya Yerleştir
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Oturum Taşıma / Yerleştirme ve Çakışma Önizleme Modalı */}
      <Dialog open={moveDialogOpen} onOpenChange={setMoveDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-sm font-semibold flex items-center gap-2">
              <MoveRight className="size-4 text-primary" />
              Oturumu Salona ve Saate Yerleştir
            </DialogTitle>
          </DialogHeader>

          {selectedSession && (
            <div className="space-y-4 text-xs py-2">
              <div className="rounded-lg border bg-muted/40 p-3">
                <p className="font-semibold text-foreground">{selectedSession.title}</p>
                <p className="text-muted-foreground mt-0.5">Tür: {selectedSession.type}</p>
              </div>

              <div className="space-y-1.5">
                <Label>Hedef Salon</Label>
                <Select
                  value={targetRoomId}
                  onValueChange={(val) => {
                    setTargetRoomId(val);
                    recheck(selectedSession.id, val, targetStart, targetEnd);
                  }}
                >
                  <SelectTrigger><SelectValue placeholder="Salon seçin" /></SelectTrigger>
                  <SelectContent>
                    {rooms.map((r) => (
                      <SelectItem key={r.id} value={r.id}>
                        {r.name} (Kapasite: {r.capacity})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Başlangıç Saati</Label>
                  <Input
                    type="time"
                    value={targetStart}
                    onChange={(e) => {
                      setTargetStart(e.target.value);
                      recheck(selectedSession.id, targetRoomId, e.target.value, targetEnd);
                    }}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Bitiş Saati</Label>
                  <Input
                    type="time"
                    value={targetEnd}
                    onChange={(e) => {
                      setTargetEnd(e.target.value);
                      recheck(selectedSession.id, targetRoomId, targetStart, e.target.value);
                    }}
                  />
                </div>
              </div>

              {/* Çakışma Önizleme Raporu */}
              {previewConflict && (
                <div className="space-y-2">
                  {previewConflict.hardConflicts.length > 0 && (
                    <div className="rounded-lg border border-rose-300 bg-rose-50 p-2.5 text-rose-800 space-y-1">
                      <p className="font-semibold flex items-center gap-1.5">
                        <AlertTriangle className="size-4 shrink-0 text-rose-600" />
                        Sert Çakışma ({previewConflict.hardConflicts.length})
                      </p>
                      <ul className="list-disc pl-4 space-y-0.5 text-[11px]">
                        {previewConflict.hardConflicts.map((c, i) => <li key={i}>{c}</li>)}
                      </ul>
                    </div>
                  )}

                  {previewConflict.softWarnings.length > 0 && (
                    <div className="rounded-lg border border-amber-300 bg-amber-50 p-2.5 text-amber-800 space-y-1">
                      <p className="font-semibold flex items-center gap-1.5">
                        <AlertTriangle className="size-4 shrink-0 text-amber-600" />
                        Lojistik Uyarısı ({previewConflict.softWarnings.length})
                      </p>
                      <ul className="list-disc pl-4 space-y-0.5 text-[11px]">
                        {previewConflict.softWarnings.map((w, i) => <li key={i}>{w}</li>)}
                      </ul>
                    </div>
                  )}

                  {!previewConflict.hasConflict && previewConflict.softWarnings.length === 0 && (
                    <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-2 text-emerald-800 flex items-center gap-1.5">
                      <CheckCircle2 className="size-4 text-emerald-600" />
                      Slot uygun — herhangi bir çakışma veya kısıt ihlali yok.
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setMoveDialogOpen(false)} disabled={saving}>
              Vazgeç
            </Button>
            <Button
              onClick={handleConfirmMove}
              disabled={saving || (previewConflict?.hasConflict ?? false)}
              className={cn(previewConflict?.hasConflict ? "opacity-50" : "")}
            >
              {saving ? t("common.saving") : t("timetable.confirmAndPlace")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
