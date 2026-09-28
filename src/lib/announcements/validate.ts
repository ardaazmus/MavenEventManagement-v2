// ─── H-11: duyuru doğrulama (saf, test edilebilir) ─────────────────────────────
export interface AnnouncementInput {
  title: unknown;
  body: unknown;
  imageUrl?: unknown;
  linkUrl?: unknown;
  startsAt?: unknown;
  endsAt?: unknown;
  isActive?: unknown;
  sortOrder?: unknown;
}

export interface AnnouncementDraft {
  title: string;
  body: string;
  imageUrl: string | null;
  linkUrl: string | null;
  startsAt: Date | null;
  endsAt: Date | null;
  isActive: boolean;
  sortOrder: number;
}

export class AnnouncementValidationError extends Error {
  status = 400;
  constructor(message: string) {
    super(message);
    this.name = "AnnouncementValidationError";
  }
}

const MAX_TITLE = 120;
const MAX_BODY = 2000;
const MAX_URL = 2048;

function str(v: unknown, name: string, max: number, required: boolean): string | null {
  if (v === undefined || v === null || v === "") {
    if (required) throw new AnnouncementValidationError(`${name} zorunlu`);
    return null;
  }
  if (typeof v !== "string") throw new AnnouncementValidationError(`${name} metin olmalı`);
  const s = v.trim();
  if (required && s.length === 0) throw new AnnouncementValidationError(`${name} zorunlu`);
  if (s.length > max) throw new AnnouncementValidationError(`${name} en fazla ${max} karakter`);
  return s.length === 0 ? null : s;
}

function url(v: unknown, name: string): string | null {
  const s = str(v, name, MAX_URL, false);
  if (!s) return null;
  if (!/^https?:\/\/[^\s]+$/i.test(s) && !s.startsWith("/")) {
    throw new AnnouncementValidationError(`${name} geçerli bir URL olmalı`);
  }
  return s;
}

function date(v: unknown, name: string): Date | null {
  if (v === undefined || v === null || v === "") return null;
  const d = v instanceof Date ? v : new Date(String(v));
  if (Number.isNaN(d.getTime())) throw new AnnouncementValidationError(`${name} geçerli bir tarih olmalı`);
  return d;
}

export function parseAnnouncementInput(raw: unknown): AnnouncementDraft {
  if (!raw || typeof raw !== "object") throw new AnnouncementValidationError("Geçersiz gövde");
  const input = raw as AnnouncementInput;
  const startsAt = date(input.startsAt, "Başlangıç");
  const endsAt = date(input.endsAt, "Bitiş");
  if (startsAt && endsAt && endsAt < startsAt) {
    throw new AnnouncementValidationError("Bitiş başlangıçtan önce olamaz");
  }
  const sortOrder = input.sortOrder === undefined || input.sortOrder === null || input.sortOrder === ""
    ? 0
    : Number(input.sortOrder);
  if (!Number.isInteger(sortOrder) || sortOrder < 0 || sortOrder > 9999) {
    throw new AnnouncementValidationError("Sıra 0-9999 arası tam sayı olmalı");
  }
  return {
    title: str(input.title, "Başlık", MAX_TITLE, true)!,
    body: str(input.body, "Metin", MAX_BODY, true)!,
    imageUrl: url(input.imageUrl, "Görsel"),
    linkUrl: url(input.linkUrl, "Bağlantı"),
    startsAt,
    endsAt,
    isActive: input.isActive === undefined ? true : Boolean(input.isActive),
    sortOrder,
  };
}

// Vitrin/sunucu ortak kuralı: yayında + pencere içinde.
export function isAnnouncementLive(a: { isActive: boolean; startsAt: Date | string | null; endsAt: Date | string | null }, now: Date = new Date()): boolean {
  if (!a.isActive) return false;
  const start = a.startsAt ? new Date(a.startsAt) : null;
  const end = a.endsAt ? new Date(a.endsAt) : null;
  if (start && Number.isNaN(start.getTime())) return false;
  if (end && Number.isNaN(end.getTime())) return false;
  if (start && start > now) return false;
  if (end && end < now) return false;
  return true;
}
