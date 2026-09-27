// P3 (yeni-fazlar 13): hazırlık denetimi — TEK yetkili kaynak.
// Dashboard ve edition.publish AYNI fonksiyonu kullanır; publish artık dahili HTTP
// self-request yapmaz (oturum bağlamı kaybı → fail-open kapanır).
// Düzeltmeler:
//  * çakışma kontrolü yalnız ONAYLI oturumlara bakar (APPROVED|PUBLISHED) — DRAFT taslak
//    onaylı-çakışma sayılmaz; CANCELLED zaten dışarıda.
//  * pozitif sponsor sözleşme sayısı UYARI OLARAK SKORU DÜŞÜRMEZ (kaldırıldı).
import { db } from "@/lib/db";

export interface ReadinessItem {
  key: string;
  message: string;
  severity: "BLOCKER" | "WARNING";
}
export interface ReadinessResult {
  blockers: ReadinessItem[];
  warnings: ReadinessItem[];
  score: number;
  total: number;
  pct: number;
}

const CONFLICT_STATUSES = new Set(["APPROVED", "PUBLISHED"]);

export function readinessCheck(
  edition: { id: string; startDate: Date | null; endDate: Date | null; isPublished: boolean },
  categories: { id: string; name: string; basePrice: number; paymentInstruction: string | null; capacity: number | null }[],
  sessions: { roomId: string | null; startTime: Date; endTime: Date; status: string; title: string }[],
  agreementCount: number,
): ReadinessResult {
  void agreementCount; // hazırkılık skoru için nötr — pozitif sayı uyarı/skor etkilemez (P3)
  const blockers: ReadinessItem[] = [];
  const warnings: ReadinessItem[] = [];

  if (edition.startDate && edition.endDate && edition.endDate <= edition.startDate) {
    blockers.push({ key: "dates", message: "Bitiş tarihi başlangıçtan sonra olmalı", severity: "BLOCKER" });
  }
  for (const c of categories) {
    if (c.basePrice > 0 && !c.paymentInstruction) {
      blockers.push({ key: `pay-${c.id}`, message: `Ücretli kategori "${c.name}" için ödeme talimatı eksik`, severity: "BLOCKER" });
    }
  }
  // aynı salonda çakışan ONAYLI oturum (P3: yalnız APPROVED|PUBLISHED; DRAFT taslak çakışma sayılmaz)
  const byRoom = new Map<string, { title: string; startTime: Date; endTime: Date }[]>();
  for (const s of sessions) {
    if (!s.roomId || s.status === "CANCELLED") continue;
    if (!CONFLICT_STATUSES.has(s.status)) continue;
    const arr = byRoom.get(s.roomId) ?? [];
    arr.push({ title: s.title, startTime: s.startTime, endTime: s.endTime });
    byRoom.set(s.roomId, arr);
  }
  for (const [roomId, list] of byRoom) {
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i], b = list[j];
        if (a.startTime < b.endTime && b.startTime < a.endTime) {
          blockers.push({ key: `clash-${roomId}-${i}-${j}`, message: `Aynı salonda çakışan onaylı oturum: "${a.title}" ↔ "${b.title}"`, severity: "BLOCKER" });
        }
      }
    }
  }
  if (categories.length === 0) warnings.push({ key: "no-cat", message: "Kayıt kategorisi tanımlanmadı", severity: "WARNING" });
  if (sessions.length === 0) warnings.push({ key: "no-session", message: "Programda oturum yok", severity: "WARNING" });

  const total = blockers.length + warnings.length;
  const done = Math.max(0, 8 - total);
  return { blockers, warnings, score: done, total: 8, pct: Math.round((done / 8) * 100) };
}

/** Publish + dashboard'un ortak girişi: edisyon + kategoriler + onaylı oturumlar + sözleşmeler. */
export async function editionReadiness(editionId: string): Promise<{
  edition: { id: string; name: string; status: string | null; startDate: Date | null; endDate: Date | null; isPublished: boolean; tenantId: string };
  checks: ReadinessResult;
}> {
  const edition = await db.eventEdition.findUnique({
    where: { id: editionId },
    select: { id: true, name: true, status: true, startDate: true, endDate: true, isPublished: true, tenantId: true },
  });
  if (!edition) throw new Error("Etkinlik bulunamadı");
  const [categories, sessions, agreementCount] = await Promise.all([
    db.registrationCategory.findMany({
      where: { editionId },
      select: { id: true, name: true, basePrice: true, paymentInstruction: true, capacity: true },
    }),
    db.programSession.findMany({
      where: { editionId, roomId: { not: null } },
      select: { roomId: true, startTime: true, endTime: true, status: true, title: true },
    }),
    db.sponsorAgreement.count({ where: { editionId } }),
  ]);
  return { edition, checks: readinessCheck(edition, categories, sessions, agreementCount) };
}
