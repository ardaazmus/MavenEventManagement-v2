/**
 * RainFocus-standard Multi-Constraint Conflict Detector for Scientific Timetable
 * 
 * Evaluates:
 * 1. Room Overlap (Hard Constraint): Two sessions in the same room at overlapping times
 * 2. Speaker Double-Booking (Hard Constraint): Same speaker assigned to overlapping sessions
 * 3. Turnover Buffer (Soft Constraint): < 15 min buffer between consecutive sessions in the same room
 * 4. Capacity vs Demand (Soft Constraint): Expected or registered attendees exceed room capacity
 */

export interface SessionCandidate {
  id: string;
  title: string;
  roomId?: string | null;
  startTime: string | Date;
  endTime: string | Date;
  capacity?: number | null;
  speakerIds?: string[];
  trackId?: string | null;
}

export interface RoomCandidate {
  id: string;
  name: string;
  capacity: number;
}

export interface ConflictCheckResult {
  hasConflict: boolean;
  hardConflicts: string[];
  softWarnings: string[];
}

export function checkSessionConflicts(
  target: SessionCandidate,
  allSessions: SessionCandidate[],
  rooms: RoomCandidate[] = []
): ConflictCheckResult {
  const hardConflicts: string[] = [];
  const softWarnings: string[] = [];

  const targetStart = new Date(target.startTime).getTime();
  const targetEnd = new Date(target.endTime).getTime();

  if (targetEnd <= targetStart) {
    hardConflicts.push(`Geçersiz zaman aralığı: Bitiş saati (${new Date(targetEnd).toLocaleTimeString()}) başlangıçtan önce olamaz.`);
  }

  // Find target room
  const targetRoom = rooms.find((r) => r.id === target.roomId);
  if (target.capacity && targetRoom && targetRoom.capacity && target.capacity > targetRoom.capacity) {
    softWarnings.push(
      `Kapasite Uyarısı: Oturum kapasitesi (${target.capacity}), salon kapasitesini (${targetRoom.capacity}) aşıyor.`
    );
  }

  for (const other of allSessions) {
    if (other.id === target.id) continue;

    const otherStart = new Date(other.startTime).getTime();
    const otherEnd = new Date(other.endTime).getTime();

    // Zaman örtüşmesi kontrolü: (StartA < EndB) && (EndA > StartB)
    const isOverlapping = targetStart < otherEnd && targetEnd > otherStart;

    // 1. Salon Çakışması (Sert Kısıt)
    if (isOverlapping && target.roomId && other.roomId && target.roomId === other.roomId) {
      const roomName = targetRoom?.name ?? "Seçili salon";
      hardConflicts.push(
        `Salon Çakışması: "${other.title}" oturumu ile ${roomName} salonunda aynı saatte örtüşüyor.`
      );
    }

    // 2. Konuşmacı Çift Rezervasyonu (Sert Kısıt)
    if (isOverlapping && target.speakerIds && other.speakerIds) {
      const commonSpeakers = target.speakerIds.filter((spId) =>
        other.speakerIds?.includes(spId)
      );
      if (commonSpeakers.length > 0) {
        hardConflicts.push(
          `Konuşmacı Çakışması: Ortak konuşmacı "${other.title}" oturumuyla aynı saatte çakışıyor.`
        );
      }
    }

    // 3. Salon Devir Tamponu (15 dakika = 900,000 ms)
    if (target.roomId && other.roomId && target.roomId === other.roomId && !isOverlapping) {
      const gapAfterTarget = otherStart - targetEnd;
      const gapBeforeTarget = targetStart - otherEnd;

      if ((gapAfterTarget >= 0 && gapAfterTarget < 15 * 60 * 1000) ||
          (gapBeforeTarget >= 0 && gapBeforeTarget < 15 * 60 * 1000)) {
        softWarnings.push(
          `Devir Tamponu: "${other.title}" ile arasında 15 dakikadan az sahne devir süresi var.`
        );
      }
    }
  }

  return {
    hasConflict: hardConflicts.length > 0,
    hardConflicts,
    softWarnings,
  };
}
