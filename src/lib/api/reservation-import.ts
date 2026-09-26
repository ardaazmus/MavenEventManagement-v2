// ─── REZERVASYON DOSYA İÇE AKTARMA ÇEKİRDEĞİ (xlsx/csv → Reservation) ──
// Kullanıcı ilkesi: "tek bir veri girişi kaynağı olmamalı" — Konaklama'ya dosya
// yükleme yüzeyi (otel rooming listeleri, e-postayla gelen rezervasyon talepleri).
// REG-IO / CC-IMPORT iki-fazlı sözleşme:
//   1) commit !== true → PREVIEW: satırlar normalize+doğrulanır, oluşturma/stok planı
//      ve sorunlar raporlanır — HİÇBİR YAZIM YAPILMAZ.
//   2) commit === true → COMMIT: geçerli satırlar createManualReservation ile işlenir
//      (stok tüketimi, mükerrer çakışma, activity log AYNI invariant'lar). Kısmi
//      başarı meşrudur — hatalı satır diğerlerini engellemez.
// Satırlar createManualReservation'a (lib/api/manual-reservation) akıtılır: STOK
// tüketimi CONFIRMED+blok'ta gecelik doğrulanır, DUPLICATE 409 mantığı, Ana Konuk
// slotu — hepsi TEK çekirdekte. Bu dosya yalnız: başlık normalizasyonu, esnek tarih/
// metin çözümlemesi, otel/blok adı eşleme, katılım e-posta bağlama ve satır
// sınıflandırması yapar.
// Kilit: withLock(`resman:<editionId>`) — manuel tekil giriş ile AYNI kilit anahtarı
// (import + manuel yazımlar serileşir, stok yarışı imkânsız).
import { db } from "@/lib/db";
import { withLock } from "@/lib/tx-lock";
import {
  createManualReservation,
  ManualReservationError,
  type ManualReservationResult,
} from "@/lib/api/manual-reservation";

export const MAX_RES_IMPORT_ROWS = 1000;

// başlık normalizasyonu — TR/EN yaygın kolon adları (küçük harfe indirilir)
const HEADER_ALIASES: Record<string, string[]> = {
  guestName: ["misafir", "misafir adı", "misafir adi", "konuk", "konuk adı", "konuk adi", "ad soyad", "adı soyadı", "adi soyadi", "guest", "guest name", "name", "isim"],
  email: ["e-posta", "eposta", "e posta", "email", "e-mail", "mail"],
  hotel: ["otel", "otel adı", "otel adi", "hotel", "hotel name"],
  block: ["blok", "blok adı", "blok adi", "oda bloğu", "oda blogu", "block", "block name"],
  checkIn: ["giriş", "giriş tarihi", "giris", "giris tarihi", "check-in", "checkin", "check in", "arrival", "varış", "varis"],
  checkOut: ["çıkış", "çıkış tarihi", "cikis", "cikis tarihi", "check-out", "checkout", "check out", "departure", "ayrılış", "ayrilis"],
  occupancy: ["doluluk", "doluluk tipi", "doluluk türü", "doluluk turu", "occupancy", "occupancy type", "oda tipi seçimi"],
  payerType: ["ödeyen tipi", "odeyen tipi", "ödeyen türü", "odeyen turu", "ödeyen", "odeyen", "payer", "payer type"],
  payerName: ["ödeyen adı", "odeyen adi", "ödeyen kurum", "kurum adı", "payer name"],
  rate: ["gecelik fiyat", "gecelik", "fiyat", "rate", "rate per night", "price per night", "oda fiyatı", "gecelik fiyat (₺)", "gecelik fiyat (tl)", "gecelik fiyat (try)", "fiyat (₺)", "nightly rate (₺)", "nightly rate (try)", "nightly rate"],
  status: ["durum", "status", "rezervasyon durumu"],
  notes: ["not", "notlar", "notes", "açıklama", "aciklama"],
};

export function normalizeReservationHeaders(rows: Record<string, unknown>[]): {
  norm: Record<string, unknown>[];
  mapping: Record<string, string>;
} {
  const mapping: Record<string, string> = {};
  const norm = rows.map((row) => {
    const out: Record<string, unknown> = {};
    for (const [header, value] of Object.entries(row)) {
      const key = header.trim().toLowerCase();
      const field = Object.entries(HEADER_ALIASES).find(([, aliases]) => aliases.includes(key))?.[0];
      if (field) {
        mapping[field] = header;
        out[field] = value;
      }
    }
    return out;
  });
  return { norm, mapping };
}

// ── esnek tarih: "YYYY-AA-GG" | "GG.AA.YYYY" | "GG/AA/YYYY" | "GG-AA-YYYY" ──
const ISO_RE = /^(\d{4})-(\d{1,2})-(\d{1,2})$/;
const DMY_RE = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/;

export function parseFlexibleDay(v: unknown): string | null {
  if (v == null) return null;
  let s = String(v).trim();
  if (!s) return null;
  // Excel xlsx raw değerleri "12.05.2026 00:00:00" biçiminde gelebilir — saat kısmı at
  s = s.replace(/\s+\d{1,2}:\d{2}(:\d{2})?$/, "").replace(/T\d{1,2}:\d{2}(:\d{2})?(\.\d+)?$/, "");
  let y: number, m: number, d: number;
  const iso = ISO_RE.exec(s);
  if (iso) { y = +iso[1]; m = +iso[2]; d = +iso[3]; }
  else {
    const dmy = DMY_RE.exec(s);
    if (!dmy) return null;
    d = +dmy[1]; m = +dmy[2]; y = +dmy[3];
  }
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 2000 || y > 2100) return null;
  const dt = new Date(y, m - 1, d, 12, 0, 0, 0);
  if (dt.getMonth() !== m - 1 || dt.getDate() !== d) return null;
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

// ── "1.500,50" | "1500.5" | "1500" → major sayı (₺) ──
export function parseMajorAmount(v: unknown): number | null {
  if (v == null) return null;
  let s = String(v).trim().replace(/[₺\s]/g, "");
  if (!s) return null;
  if (s.includes(",") && s.includes(".")) s = s.replace(/\./g, "").replace(",", ".");
  else if (s.includes(",")) s = s.replace(",", ".");
  else if ((s.match(/\./g) ?? []).length > 1) s = s.replace(/\./g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? n : null;
}

// durum metni → enum (manuel çekirdek beyaz listesi: REQUESTED|WAITLIST|RESERVED|CONFIRMED)
const STATUS_WORDS: Record<string, string[]> = {
  REQUESTED: ["talep", "talep edildi", "istek", "requested", "request"],
  WAITLIST: ["bekleme", "bekleme listesi", "bekliyor", "waitlist", "wait", "waiting"],
  RESERVED: ["ayrıldı", "ayrildi", "rezerve", "reserved", "ayrılmış", "ayrilmis"],
  CONFIRMED: ["teyit", "teyitli", "onay", "onaylandı", "onaylandi", "confirmed", "confirm", "garanti"],
};
const OCC_WORDS: Record<string, string[]> = {
  SINGLE: ["tek", "tek kişi", "tek kisi", "single", "tek kişilik", "tek kisilik"],
  DOUBLE: ["çift", "cift", "çift kişi", "cift kisi", "double", "çift kişilik", "cift kisilik"],
  FAMILY_SHARED: ["aile", "family", "ortak", "shared", "aile (ortak)"],
};
const PAYER_WORDS: Record<string, string[]> = {
  SELF: ["kendi", "self", "kendi ödemesi", "kendi odemesi", "katılımcı", "katilimci"],
  ORGANIZATION: ["kurum", "kuruluş", "kurulus", "şirket", "sirket", "firma", "organization", "organisation"],
  SPONSOR: ["sponsor"],
  ORGANIZER: ["organizatör", "organizator", "organizer", "organizasyon", "organizer ödemesi"],
  SPEAKER_HOSPITALITY: ["konuşmacı", "konusmaci", "speaker", "konuşmacı ağırlama", "konusmaci agirlama"],
};

function wordToEnum(text: string, table: Record<string, string[]>): string | null {
  const k = text.trim().toLowerCase();
  if (!k) return null;
  if (Object.keys(table).includes(k.toUpperCase())) return k.toUpperCase();
  for (const [value, words] of Object.entries(table)) {
    if (words.includes(k)) return value;
  }
  return null;
}

export interface ParsedReservationRow {
  row: number;
  guestName: string;
  email: string | null;
  hotelText: string;
  blockText: string;
  checkIn: string | null; // YYYY-MM-DD
  checkOut: string | null;
  occupancyText: string;
  occupancyType: string | null;
  payerText: string;
  payerType: string | null;
  payerName: string | null;
  rate: number | null; // major ₺
  statusText: string;
  status: string | null;
  notes: string | null;
}

export function parseReservationRow(row: Record<string, unknown>, rowNo: number): ParsedReservationRow {
  const s = (k: string) => String(row[k] ?? "").trim();
  return {
    row: rowNo,
    guestName: s("guestName"),
    email: s("email").toLowerCase() || null,
    hotelText: s("hotel"),
    blockText: s("block"),
    checkIn: parseFlexibleDay(row["checkIn"]),
    checkOut: parseFlexibleDay(row["checkOut"]),
    occupancyText: s("occupancy"),
    occupancyType: wordToEnum(s("occupancy"), OCC_WORDS),
    payerText: s("payerType"),
    payerType: wordToEnum(s("payerType"), PAYER_WORDS),
    payerName: s("payerName") || null,
    rate: parseMajorAmount(row["rate"]),
    statusText: s("status"),
    status: wordToEnum(s("status"), STATUS_WORDS),
    notes: s("notes") || null,
  };
}

export interface ImportIssue {
  row: number;
  guest: string;
  kind: "VALIDATION" | "DUPLICATE_FILE" | "DUPLICATE_DB";
  reason: string;
}

// serbest-misafir DB çakışma tablosu — katılımsız (serbest isim) satırlar için import
// düzeyi yumuşak mükerrer koruması. Çekirdek (manual-reservation) ad-bazlı denetim
// yapmaz (ad güvenilir kimlik değildir); ama içe aktarmada çift kayıt kullanıcı ilkesidir
// ("mükerrerler asla çift kayıt oluşmaz"). Aynı normalize ad + çakışan tarih aralığı
// + aktif durum → satır DUPLICATE_DB olarak atlanır (koşum durmaz).
interface FreeConflict { checkIn: string; checkOut: string; status: string; guestName: string }

async function loadFreeGuestConflicts(editionId: string): Promise<Map<string, FreeConflict[]>> {
  const rows = await db.reservation.findMany({
    where: { editionId, primaryGuestParticipationId: null, status: { not: "CANCELLED" } },
    select: { guestName: true, checkIn: true, checkOut: true, status: true },
    take: 5000,
  });
  const map = new Map<string, FreeConflict[]>();
  for (const r of rows) {
    const key = normKey(r.guestName);
    if (!key) continue;
    const entry: FreeConflict = {
      checkIn: r.checkIn.toISOString().slice(0, 10),
      checkOut: r.checkOut.toISOString().slice(0, 10),
      status: r.status,
      guestName: r.guestName,
    };
    const list = map.get(key);
    if (list) list.push(entry); else map.set(key, [entry]);
  }
  return map;
}

// otel/blok adı eşleme tablosu — preview ve commit ortak (commit KİLİT ALTINDA taze yükler)
interface HotelIndex {
  byName: Map<string, { id: string; name: string }>;
  blocks: Map<string, { id: string; name: string; hotelId: string; hotelName: string; roomTypeId: string; roomTypeName: string; roomTypePrice: number }>; // anahtar: hotelId + "›" + blokAdı(normalize)
}
const normKey = (s: string) => s.trim().toLocaleLowerCase("tr-TR").replace(/\s+/g, " ");

async function loadHotelIndex(editionId: string): Promise<HotelIndex> {
  const hotels = await db.hotelProperty.findMany({
    where: { editionId },
    select: {
      id: true, name: true,
      blocks: { select: { id: true, name: true, roomTypeId: true, roomType: { select: { id: true, name: true, pricePerNight: true } } } },
    },
  });
  const idx: HotelIndex = { byName: new Map(), blocks: new Map() };
  for (const h of hotels) {
    idx.byName.set(normKey(h.name), { id: h.id, name: h.name });
    for (const b of h.blocks) {
      idx.blocks.set(`${h.id}›${normKey(b.name)}`, {
        id: b.id, name: b.name, hotelId: h.id, hotelName: h.name,
        roomTypeId: b.roomTypeId, roomTypeName: b.roomType.name, roomTypePrice: b.roomType.pricePerNight,
      });
    }
  }
  return idx;
}

// e-posta → katılım eşleme (misafir bağlama: mükerrer koruması + Ana Konuk slotu)
async function loadParticipationEmailIndex(editionId: string, emails: string[]) {
  const map = new Map<string, { id: string; name: string }>();
  if (emails.length === 0) return map;
  const parts = await db.eventParticipation.findMany({
    where: { editionId, person: { email: { in: emails } } },
    select: { id: true, person: { select: { email: true, firstName: true, lastName: true } } },
    orderBy: { id: "asc" },
  });
  for (const p of parts) {
    const em = p.person.email?.toLowerCase();
    if (em && !map.has(em)) map.set(em, { id: p.id, name: `${p.person.firstName} ${p.person.lastName}`.trim() });
  }
  return map;
}

// ranges overlap: [aIn,aOut) ∩ [bIn,bOut) — gün bazlı
function overlaps(aIn: string, aOut: string, bIn: string, bOut: string): boolean {
  return aIn < bOut && bIn < aOut;
}

// ortak doğrulama (preview ve commit aynı yol — defense in depth)
function classifyRows(
  parsed: ParsedReservationRow[],
  hotels: HotelIndex,
  participationByEmail: Map<string, { id: string; name: string }>,
  freeConflicts: Map<string, FreeConflict[]>,
): { issues: ImportIssue[]; validIndexes: number[] } {
  const issues: ImportIssue[] = [];
  for (let i = 0; i < parsed.length; i++) {
    const r = parsed[i];
    const guest = r.guestName || `(satır ${r.row})`;
    // misafir: ad ≥2 KARAKTER ya da e-posta katılımla eşleşmeli
    if (!r.guestName) {
      const byEmail = r.email ? participationByEmail.get(r.email) : undefined;
      if (!byEmail) issues.push({ row: r.row, guest, kind: "VALIDATION", reason: "Misafir adı zorunludur (ya da e-posta bir katılımla eşleşmelidir)" });
    } else if (r.guestName.length < 2) {
      issues.push({ row: r.row, guest, kind: "VALIDATION", reason: "Misafir adı en az 2 karakter olmalıdır" });
    }
    if (!r.checkIn || !r.checkOut) {
      issues.push({ row: r.row, guest, kind: "VALIDATION", reason: `Tarih biçimi anlaşılamadı (GG.AA.YYYY veya YYYY-AA-GG): ${!r.checkIn ? "giriş" : "çıkış"}` });
    } else if (r.checkOut <= r.checkIn) {
      issues.push({ row: r.row, guest, kind: "VALIDATION", reason: "Çıkış tarihi girişten sonra olmalıdır" });
    }
    // otel/blok adı eşleme — bilinçli referans: verilen ad çözülmezse satır reddedilir
    let hotelId: string | null = null;
    if (r.hotelText) {
      const h = hotels.byName.get(normKey(r.hotelText));
      if (!h) {
        issues.push({ row: r.row, guest, kind: "VALIDATION", reason: `Otel bulunamadı: ${r.hotelText} (envanter dışı kayıt için otel kolonunu boş bırakın)` });
      } else {
        hotelId = h.id;
        if (r.blockText && !hotels.blocks.has(`${h.id}›${normKey(r.blockText)}`)) {
          issues.push({ row: r.row, guest, kind: "VALIDATION", reason: `Blok bulunamadı: ${r.blockText} (${h.name})` });
        }
      }
    } else if (r.blockText) {
      issues.push({ row: r.row, guest, kind: "VALIDATION", reason: "Blok yazıldı ama otel kolonu boş — otel adı gerekli" });
    }
    if (r.occupancyText && !r.occupancyType) {
      issues.push({ row: r.row, guest, kind: "VALIDATION", reason: `Doluluk anlaşılamadı: ${r.occupancyText} (Tek Kişi / Çift Kişi / Aile)` });
    }
    if (r.payerText && !r.payerType) {
      issues.push({ row: r.row, guest, kind: "VALIDATION", reason: `Ödeyen tipi anlaşılamadı: ${r.payerText} (Kendi / Kurum / Sponsor / Organizatör / Konuşmacı)` });
    }
    if ((r.payerType === "ORGANIZATION" || r.payerType === "SPONSOR") && !r.payerName) {
      issues.push({ row: r.row, guest, kind: "VALIDATION", reason: `${r.payerType === "SPONSOR" ? "Sponsor" : "Kurum"} ödemesinde ödeyen adı zorunludur` });
    }
    if (r.statusText && !r.status) {
      issues.push({ row: r.row, guest, kind: "VALIDATION", reason: `Durum anlaşılamadı: ${r.statusText} (Talep / Bekleme / Ayrıldı / Teyit)` });
    }
    if (String(r.notes ?? "").length > 500) {
      issues.push({ row: r.row, guest, kind: "VALIDATION", reason: "Not 500 karakteri aşıyor" });
    }
  }
  // dosya-içi mükerrer — aynı misafir + çakışan tarih aralığı (ilk satır kazanır)
  const seen = new Map<string, { in: string; out: string; row: number }>();
  for (let i = 0; i < parsed.length; i++) {
    const r = parsed[i];
    if (!r.guestName || !r.checkIn || !r.checkOut) continue;
    const key = normKey(r.guestName);
    const prior = seen.get(key);
    if (prior && overlaps(r.checkIn, r.checkOut, prior.in, prior.out)) {
      issues.push({ row: r.row, guest: r.guestName, kind: "DUPLICATE_FILE", reason: `Dosyada çakışan mükerrer misafir (satır ${prior.row} ile aynı misafir + tarihler kesişiyor)` });
    } else if (!prior) {
      seen.set(key, { in: r.checkIn, out: r.checkOut, row: r.row });
    }
  }
  // DB mükerrer — serbest isim + çakışan aktif rezervasyon (katılımlı satırlar çekirdekte denetlenir)
  for (const r of parsed) {
    if (!r.guestName || !r.checkIn || !r.checkOut) continue;
    if (r.email && participationByEmail.has(r.email)) continue; // katılıma bağlanacak — çekirdek denetler
    const list = freeConflicts.get(normKey(r.guestName));
    const clash = list?.find((c) => overlaps(r.checkIn!, r.checkOut!, c.checkIn, c.checkOut));
    if (clash) {
      const fmt = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString("tr-TR");
      issues.push({
        row: r.row,
        guest: r.guestName,
        kind: "DUPLICATE_DB",
        reason: `Bu misafirin çakışan aktif rezervasyonu var: ${clash.guestName} · ${fmt(clash.checkIn)} → ${fmt(clash.checkOut)} (${clash.status})`,
      });
    }
  }
  const badRows = new Set(issues.map((x) => x.row));
  const validIndexes = parsed.map((_, i) => i).filter((i) => !badRows.has(i + 1));
  return { issues, validIndexes };
}

// ─── FAZ 1: PREVIEW — yazım yok, plan + sorunlar ────────────────────────────
export interface ReservationPreview {
  mode: "preview";
  total: number;
  valid: number;
  toCreate: number;
  offInventory: number;
  stockNights: number;
  issues: ImportIssue[];
  mapping: Record<string, string>;
  sample: { row: number; guest: string; hotel: string; dates: string; status: string; action: "stock" | "noStock" | "free" }[];
}

export async function previewReservationImport(opts: {
  editionId: string;
  rows: Record<string, unknown>[];
  defaultStatus?: string | null;
}): Promise<ReservationPreview> {
  const { norm, mapping } = normalizeReservationHeaders(opts.rows);
  const parsed = norm.map((r, i) => parseReservationRow(r, i + 1));
  const [hotels, participationByEmail, freeConflicts] = await Promise.all([
    loadHotelIndex(opts.editionId),
    loadParticipationEmailIndex(opts.editionId, [...new Set(parsed.map((r) => r.email).filter((e): e is string => Boolean(e)))]),
    loadFreeGuestConflicts(opts.editionId),
  ]);
  const { issues, validIndexes } = classifyRows(parsed, hotels, participationByEmail, freeConflicts);

  let toCreate = 0;
  let offInventory = 0;
  let stockNights = 0;
  const sample: ReservationPreview["sample"] = [];
  for (const i of validIndexes) {
    const r = parsed[i];
    const hasBlock = Boolean(r.hotelText && r.blockText && (() => {
      const h = hotels.byName.get(normKey(r.hotelText));
      return h ? hotels.blocks.has(`${h.id}›${normKey(r.blockText)}`) : false;
    })());
    const status = r.status ?? opts.defaultStatus ?? "REQUESTED";
    const nights = Math.round((new Date(`${r.checkOut!}T12:00:00`).getTime() - new Date(`${r.checkIn!}T12:00:00`).getTime()) / 86400000);
    toCreate += 1;
    if (!hasBlock) offInventory += 1;
    else if (status === "CONFIRMED") stockNights += Math.max(1, nights);
    if (sample.length < 8) {
      const h = r.hotelText ? hotels.byName.get(normKey(r.hotelText)) : undefined;
      sample.push({
        row: r.row,
        guest: r.guestName || (r.email ? participationByEmail.get(r.email)?.name ?? "(e-posta)" : "(misafir)"),
        hotel: h ? (r.blockText ? `${h.name} · ${r.blockText}` : h.name) : "envanter dışı",
        dates: `${r.checkIn ?? "?"} → ${r.checkOut ?? "?"}`,
        status,
        action: !hasBlock ? "free" : status === "CONFIRMED" ? "stock" : "noStock",
      });
    }
  }
  return { mode: "preview", total: parsed.length, valid: validIndexes.length, toCreate, offInventory, stockNights, issues, mapping, sample };
}

// ─── FAZ 2: COMMIT — createManualReservation akışı (kısmi başarı meşru) ─────
export interface ReservationCommitResult {
  mode: "commit";
  created: number;
  waitlisted: number; // stok yetersizliğinden bekleme listesine alınan satırlar
  skipped: number; // sorun satırları (doğrulama/dosya-içi/DB mükerrer) + çekirdek retleri
  stockNights: number;
  total: number;
  failures: { row: number; guest: string; reason: string }[];
}

export async function commitReservationImport(opts: {
  editionId: string;
  rows: Record<string, unknown>[];
  defaultStatus?: string | null;
  onStockShortage?: "reject" | "WAITLIST";
  actorName: string;
}): Promise<ReservationCommitResult> {
  const { norm } = normalizeReservationHeaders(opts.rows);
  const parsed = norm.map((r, i) => parseReservationRow(r, i + 1));

  const result: ReservationCommitResult = { mode: "commit", created: 0, waitlisted: 0, skipped: 0, stockNights: 0, total: parsed.length, failures: [] };
  const edition = await db.eventEdition.findUnique({
    where: { id: opts.editionId },
    select: { tenantId: true },
  });

  // manuel tekil giriş ile AYNI kilit — import + manuel yazım stok yarışı imkânsız
  await withLock(`resman:${opts.editionId}`, async () => {
    // kilit altında TAZE eşleme tabloları (yarış koruması)
    const [hotels, participationByEmail, freeConflicts] = await Promise.all([
      loadHotelIndex(opts.editionId),
      loadParticipationEmailIndex(opts.editionId, [...new Set(parsed.map((r) => r.email).filter((e): e is string => Boolean(e)))]),
      loadFreeGuestConflicts(opts.editionId),
    ]);
    const { issues, validIndexes } = classifyRows(parsed, hotels, participationByEmail, freeConflicts);
    const badRows = new Set(issues.map((x) => x.row));
    // sorunlu satırlar sayılır ve gerekçeleriyle raplanır (koşum durmaz)
    for (const iss of issues) {
      result.failures.push({ row: iss.row, guest: iss.guest, reason: iss.reason });
    }
    result.skipped += issues.length;

    for (const i of validIndexes) {
      if (badRows.has(i + 1)) continue;
      const r = parsed[i];
      const guest = r.guestName || (r.email ? participationByEmail.get(r.email)?.name ?? `(satır ${r.row})` : `(satır ${r.row})`);
      try {
        const hotel = r.hotelText ? hotels.byName.get(normKey(r.hotelText)) ?? null : null;
        const block = hotel && r.blockText ? hotels.blocks.get(`${hotel.id}›${normKey(r.blockText)}`) ?? null : null;
        const byEmail = r.email ? participationByEmail.get(r.email) ?? null : null;
        const wantedStatus = r.status ?? opts.defaultStatus ?? "REQUESTED";
        let made: ManualReservationResult;
        try {
          made = await createManualReservation({
            editionId: opts.editionId,
            participationId: byEmail?.id ?? null,
            guestName: byEmail ? null : r.guestName, // katılım bağlıysa ad çekirdekten türetilir
            blockId: block?.id ?? null,
            checkIn: r.checkIn!,
            checkOut: r.checkOut!,
            occupancyType: r.occupancyType,
            payerType: r.payerType ?? "SELF",
            payerName: r.payerName,
            ratePerNight: r.rate != null ? Math.round(r.rate * 100) : null, // ₺ major → kuruş minor
            status: wantedStatus,
            notes: r.notes,
            actorName: opts.actorName,
          });
        } catch (first) {
          // stok yetersizliği politikası: "WAITLIST" ise kayıt BEKLEME LİSTESİNE alınır
          // (WAITLIST stok tüketmez — çekirdek invariant). Varsayılan: satır reddedilir.
          if (!(first instanceof ManualReservationError) || first.code !== "STOCK" || opts.onStockShortage !== "WAITLIST") throw first;
          made = await createManualReservation({
            editionId: opts.editionId,
            participationId: byEmail?.id ?? null,
            guestName: byEmail ? null : r.guestName,
            blockId: block?.id ?? null,
            checkIn: r.checkIn!,
            checkOut: r.checkOut!,
            occupancyType: r.occupancyType,
            payerType: r.payerType ?? "SELF",
            payerName: r.payerName,
            ratePerNight: r.rate != null ? Math.round(r.rate * 100) : null,
            status: "WAITLIST",
            notes: r.notes ? `${r.notes} (stok yetersizliği — bekleme listesine alındı)` : "stok yetersizliği — bekleme listesine alındı",
            actorName: opts.actorName,
          });
          result.waitlisted += 1;
        }
        result.created += 1;
        if (made.stockConsumed) result.stockNights += made.nights;
      } catch (e) {
        const reason = e instanceof ManualReservationError ? e.message : "Kayıt oluşturulamadı";
        result.failures.push({ row: r.row, guest, reason });
        result.skipped += 1;
        if (!(e instanceof ManualReservationError)) {
          console.error("commitReservationImport [row]", r.row, e instanceof Error ? e.message : e);
        }
      }
    }
  });

  await db.activityLog.create({
    data: {
      tenantId: edition?.tenantId ?? null,
      editionId: opts.editionId,
      type: "RESERVATION_SAVED",
      message: `Rezervasyon dosya içe aktarma: ${result.created} kayıt, ${result.skipped} atlandı, ${result.stockNights} oda-gece stok tüketimi`,
      entityType: "reservation-import",
      actorName: opts.actorName,
    },
  });

  return result;
}
