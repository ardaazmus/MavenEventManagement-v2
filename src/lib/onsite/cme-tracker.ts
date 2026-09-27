/**
 * Session-Level CME (Continuing Medical Education) / CPD Credit Engine
 * Master Roadmap Phase 12 - Onsite Kiosk & CME Tracking
 */

export interface SessionCmeRule {
  sessionId: string;
  sessionTitle: string;
  roomName?: string | null;
  startTime: Date | string;
  endTime: Date | string;
  maxCredits: number;
  qualifyingThresholdPct?: number; // Default 70%
}

export interface AttendanceInterval {
  entryTime: Date | string;
  exitTime?: Date | string | null;
}

export interface CmeEarnedResult {
  sessionId: string;
  sessionTitle: string;
  scheduledMinutes: number;
  attendedMinutes: number;
  attendancePercentage: number;
  maxCredits: number;
  earnedCredits: number;
  isEligible: boolean;
  status: "QUALIFIED" | "PARTIAL" | "NOT_QUALIFIED" | "IN_PROGRESS";
  reason: string;
}

/**
 * Calculate CME credits earned for a single session based on entry/exit scans
 */
export function calculateSessionCme(
  session: SessionCmeRule,
  intervals: AttendanceInterval[]
): CmeEarnedResult {
  const startMs = new Date(session.startTime).getTime();
  const endMs = new Date(session.endTime).getTime();
  const scheduledMinutes = Math.max(1, Math.round((endMs - startMs) / 60000));
  const threshold = session.qualifyingThresholdPct ?? 70;

  let totalAttendedMinutes = 0;
  let inProgress = false;

  for (const interval of intervals) {
    const entryMs = new Date(interval.entryTime).getTime();
    let exitMs: number;

    if (interval.exitTime) {
      exitMs = new Date(interval.exitTime).getTime();
    } else {
      // If still inside and session ongoing, cap at now or session end
      const now = Date.now();
      if (now < endMs) {
        inProgress = true;
        exitMs = now;
      } else {
        exitMs = endMs;
      }
    }

    // Clamp within session window
    const clampedEntry = Math.max(startMs, entryMs);
    const clampedExit = Math.min(endMs, exitMs);

    if (clampedExit > clampedEntry) {
      totalAttendedMinutes += Math.round((clampedExit - clampedEntry) / 60000);
    }
  }

  const attendancePct = Math.min(100, Math.round((totalAttendedMinutes / scheduledMinutes) * 100));

  let earnedCredits = 0;
  let status: CmeEarnedResult["status"] = "NOT_QUALIFIED";
  let isEligible = false;
  let reason = "";

  if (inProgress) {
    status = "IN_PROGRESS";
    reason = `Oturum devam ediyor (Şu anki katılım: ${totalAttendedMinutes} dk)`;
  } else if (attendancePct >= threshold) {
    status = "QUALIFIED";
    earnedCredits = session.maxCredits;
    isEligible = true;
    reason = `%${attendancePct} katılım ile tam kredi kazanıldı`;
  } else if (attendancePct >= 50) {
    status = "PARTIAL";
    earnedCredits = Math.round((session.maxCredits * (attendancePct / 100)) * 10) / 10;
    isEligible = true;
    reason = `%${attendancePct} katılım ile orantılı kredi kazanıldı`;
  } else {
    status = "NOT_QUALIFIED";
    earnedCredits = 0;
    isEligible = false;
    reason = `%${attendancePct} katılım (Minimum baraj: %${threshold})`;
  }

  return {
    sessionId: session.sessionId,
    sessionTitle: session.sessionTitle,
    scheduledMinutes,
    attendedMinutes: totalAttendedMinutes,
    attendancePercentage: attendancePct,
    maxCredits: session.maxCredits,
    earnedCredits,
    isEligible,
    status,
    reason,
  };
}

/**
 * Aggregate CME summary for a participant across all attended sessions
 */
export function aggregateCmeSummary(results: CmeEarnedResult[]): {
  totalScheduledMinutes: number;
  totalAttendedMinutes: number;
  totalEarnedCredits: number;
  totalPossibleCredits: number;
  qualifiedSessionsCount: number;
  results: CmeEarnedResult[];
} {
  let totalScheduledMinutes = 0;
  let totalAttendedMinutes = 0;
  let totalEarnedCredits = 0;
  let totalPossibleCredits = 0;
  let qualifiedSessionsCount = 0;

  for (const r of results) {
    totalScheduledMinutes += r.scheduledMinutes;
    totalAttendedMinutes += r.attendedMinutes;
    totalEarnedCredits += r.earnedCredits;
    totalPossibleCredits += r.maxCredits;
    if (r.isEligible) qualifiedSessionsCount++;
  }

  return {
    totalScheduledMinutes,
    totalAttendedMinutes,
    totalEarnedCredits: Math.round(totalEarnedCredits * 10) / 10,
    totalPossibleCredits: Math.round(totalPossibleCredits * 10) / 10,
    qualifiedSessionsCount,
    results,
  };
}
