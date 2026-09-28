// ─── P20.3: Görüşme talebi kararları ─────────────────────────────────────────
// Katılımcı→sponsor görüşme isteği: REQUESTED → CONFIRMED / DECLINED /
// CANCELLED; CONFIRMED → COMPLETED / CANCELLED. ONAYLI görüşmeler aynı
// anlaşmada ÇAKIŞAMAZ (sponsor ekibi tek masada); bekleyen talepler çakışabilir
// (sponsor seçer). Slot: bitiş>başlangıç, en fazla 8 saat, geçmişe talep yok.
export const MEETING_STATUSES = ["REQUESTED", "CONFIRMED", "DECLINED", "CANCELLED", "COMPLETED"] as const;
const MAX_SLOT_MS = 8 * 3_600_000;

const NEXT: Record<string, readonly string[]> = {
  REQUESTED: ["CONFIRMED", "DECLINED", "CANCELLED"],
  CONFIRMED: ["COMPLETED", "CANCELLED"],
  DECLINED: [],
  CANCELLED: [],
  COMPLETED: [],
};

export type MeetingDecision = { ok: true } | { ok: false; error: string; status: number };

export function decideMeetingTransition(from: string, to: string): MeetingDecision {
  if (!(MEETING_STATUSES as readonly string[]).includes(to)) {
    return { ok: false, error: `Geçersiz görüşme durumu: ${to}`, status: 400 };
  }
  if (from === to) return { ok: true };
  const allowed = NEXT[from];
  if (!allowed) return { ok: false, error: `Bilinmeyen mevcut durum: ${from}`, status: 400 };
  if (!(allowed as readonly string[]).includes(to)) {
    return { ok: false, error: `Geçişe izin yok: ${from} → ${to}`, status: 400 };
  }
  return { ok: true };
}

export interface SlotInput {
  slotStart: string;
  slotEnd: string;
}

export type SlotCheck =
  | { ok: true; start: Date; end: Date }
  | { ok: false; error: string; status: number };

export function validateSlot(input: SlotInput, nowMs = Date.now()): SlotCheck {
  const start = new Date(input.slotStart);
  const end = new Date(input.slotEnd);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return { ok: false, error: "slotStart/slotEnd geçerli tarih olmalı", status: 400 };
  }
  if (end.getTime() <= start.getTime()) {
    return { ok: false, error: "slotEnd, slotStart'tan sonra olmalı", status: 400 };
  }
  if (end.getTime() - start.getTime() > MAX_SLOT_MS) {
    return { ok: false, error: "Görüşme en fazla 8 saat olabilir", status: 400 };
  }
  if (start.getTime() < nowMs - 60_000) {
    return { ok: false, error: "Geçmişe görüşme talep edilemez", status: 400 };
  }
  return { ok: true, start, end };
}

// yarı-açık aralık çakışması: [aStart,aEnd) ∩ [bStart,bEnd) ≠ ∅
export function slotsOverlap(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart.getTime() < bEnd.getTime() && bStart.getTime() < aEnd.getTime();
}

export const DEFAULT_MEETING_TIMEZONE = "Europe/Istanbul";

// IANA dilimi doğrulaması — Intl bilmediği dilimi reddeder
export function validateTimezone(tz: unknown): { ok: true; timezone: string } | { ok: false; error: string } {
  if (tz === undefined || tz === null || tz === "") {
    return { ok: true, timezone: DEFAULT_MEETING_TIMEZONE };
  }
  if (typeof tz !== "string") return { ok: false, error: "timezone metin olmalı" };
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
  } catch {
    return { ok: false, error: `Geçersiz timezone: ${tz}` };
  }
  return { ok: true, timezone: tz };
}

export interface AvailabilityWindow {
  slotStart: Date;
  slotEnd: Date;
}

// talep slotu pencerelerden BİRİNİN içinde tam kapsanmalı (sınırlar dahil)
export function slotWithinWindows(start: Date, end: Date, windows: AvailabilityWindow[]): boolean {
  if (windows.length === 0) return true; // pencere yok = açık talep
  return windows.some((w) => w.slotStart.getTime() <= start.getTime() && end.getTime() <= w.slotEnd.getTime());
}

// pencere girdisi: bitiş>başlangıç, en fazla 24 saat, geçmişe pencere yok
// (talep slotunun 8 saat tavanından ayrı — pencere gün-bazlı olabilir)
export function validateWindow(slotStart: string, slotEnd: string, nowMs = Date.now()): SlotCheck {
  const start = new Date(slotStart);
  const end = new Date(slotEnd);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return { ok: false, error: "slotStart/slotEnd geçerli tarih olmalı", status: 400 };
  }
  if (end.getTime() <= start.getTime()) {
    return { ok: false, error: "slotEnd, slotStart'tan sonra olmalı", status: 400 };
  }
  if (end.getTime() - start.getTime() > 24 * 3_600_000) {
    return { ok: false, error: "Uygunluk penceresi en fazla 24 saat olabilir", status: 400 };
  }
  if (start.getTime() < nowMs - 60_000) {
    return { ok: false, error: "Geçmişe uygunluk penceresi açılamaz", status: 400 };
  }
  return { ok: true, start, end };
}
