// Bekleme listesi motoru — /api/waitlist ve /api/flows ortak kullanır
// Kural (§12 kayıt politikası): kategori kapasitesi dolunca sıraya alınır;
// bir koltuk boşalınca en yüksek öncelikli bekleyene 48 saatlik teklif gider.
import { db } from "@/lib/db";
import { ActivityType } from "@/lib/api/activity";

// Koltuk tutan kayıt durumları: onaylı + onay sürecindekiler (SUBMITTED/PENDING_APPROVAL)
export const SEAT_HOLDING_STATUSES = ["SUBMITTED", "PENDING_APPROVAL", "CONFIRMED"];

export async function expireStaleOffers(editionId?: string) {
  const stale = await db.waitlistEntry.findMany({
    where: { status: "OFFERED", offerExpiresAt: { lt: new Date() }, ...(editionId ? { editionId } : {}) },
  });
  for (const e of stale) {
    await db.waitlistEntry.update({ where: { id: e.id }, data: { status: "EXPIRED", respondedAt: new Date() } });
    await db.activityLog.create({
      data: { type: ActivityType.REGISTRATION_SAVED, editionId: e.editionId, message: `Bekleme teklifi süresi doldu — kişi sıradan düştü (#${e.priority})`, entityType: "WaitlistEntry", entityId: e.id, actorName: "Bekleme Motoru" },
    });
  }
  return stale.length;
}

// Kategori doluluk anlık görüntüsü (capacity null → sınırsız)
export async function seatStatsForCategory(categoryId: string) {
  const cat = await db.registrationCategory.findUnique({ where: { id: categoryId } });
  if (!cat) return { capacity: null as number | null, taken: 0, seatsLeft: null as number | null };
  const taken = await db.registration.count({ where: { categoryId, status: { in: SEAT_HOLDING_STATUSES } } });
  return { capacity: cat.capacity, taken, seatsLeft: cat.capacity == null ? null : Math.max(0, cat.capacity - taken) };
}

// Bir kategoride boş koltuk kadar, öncelik sırasına göre teklif üretir.
// Dönen değer: teklif verilen girişler (kişi bilgisiyle).
export async function autoOfferForCategory(editionId: string, categoryId: string) {
  await expireStaleOffers(editionId);
  const offered: { entryId: string; personName: string; priority: number }[] = [];
  const initial = await seatStatsForCategory(categoryId);
  if (initial.capacity == null) return offered; // sınırsız kategoride bekleme teklifi üretilmez

  const waitingCount = await db.waitlistEntry.count({ where: { categoryId, status: "WAITING" } });
  for (let i = 0; i < waitingCount; i++) {
    const stats = await seatStatsForCategory(categoryId);
    // açık teklifler de koltuk tutar — boş koltuk başına tek teklif kuralı
    const openOffers = await db.waitlistEntry.count({ where: { categoryId, status: "OFFERED" } });
    if (stats.capacity == null || (stats.seatsLeft ?? 0) - openOffers <= 0) break;
    const next = await db.waitlistEntry.findFirst({
      where: { categoryId, status: "WAITING" },
      orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
    });
    if (!next) break;
    const expires = new Date();
    expires.setHours(expires.getHours() + 48);
    await db.waitlistEntry.update({
      where: { id: next.id },
      data: { status: "OFFERED", offeredAt: new Date(), offerExpiresAt: expires },
    });
    const person = await db.person.findUnique({ where: { id: next.personId } });
    const personName = person ? `${person.firstName} ${person.lastName}` : next.personId;
    offered.push({ entryId: next.id, personName, priority: next.priority });
    await db.activityLog.create({
      data: { type: ActivityType.REGISTRATION_SAVED, editionId, message: `Bekleme teklifi gönderildi: ${personName} — 48 saat içinde yanıt bekleniyor`, entityType: "WaitlistEntry", entityId: next.id, actorName: "Bekleme Motoru" },
    });
  }
  return offered;
}

// Kabul yanıtı: teklif → onaylı kayıt (WAITLIST_PROMOTION kaynağı)
export async function convertOfferToRegistration(entryId: string, actor = "Kayıt Sorumlusu") {
  const entry = await db.waitlistEntry.findUnique({ where: { id: entryId }, include: { person: true, category: true, edition: true } });
  if (!entry || entry.status !== "OFFERED") return { error: "Teklif bulunamadı veya yanıta uygun değil" as const, status: 409 as const };

  // son kapasite kontrolü — bu arada başka kanaldan dolmuş olabilir
  if (entry.categoryId) {
    const stats = await seatStatsForCategory(entry.categoryId);
    if (stats.capacity != null && (stats.seatsLeft ?? 0) <= 0) {
      return { error: "Kategori bu arada doldu — teklif geçersiz" as const, status: 409 as const };
    }
  }

  let participationId = entry.participationId;
  if (!participationId) {
    const p = await db.eventParticipation.upsert({
      where: { editionId_personId: { editionId: entry.editionId, personId: entry.personId } },
      create: { editionId: entry.editionId, personId: entry.personId, source: "WAITLIST_PROMOTION" },
      update: {},
    });
    participationId = p.id;
  }

  // okunaklı teyit numarası üret (seed formatı: REG-YYYY-####)
  const edition = entry.editionId ? await db.eventEdition.findUnique({ where: { id: entry.editionId }, select: { startDate: true } }) : null;
  const year = (edition?.startDate ?? new Date()).getFullYear();
  const existing = await db.registration.count({ where: { editionId: entry.editionId } });
  let seq = existing + 1;
  let confirmationNo = `REG-${year}-${String(seq).padStart(4, "0")}`;
  while (await db.registration.findUnique({ where: { confirmationNo } })) {
    seq += 1;
    confirmationNo = `REG-${year}-${String(seq).padStart(4, "0")}`;
  }

  const registration = await db.registration.create({
    data: {
      editionId: entry.editionId,
      participationId,
      categoryId: entry.categoryId,
      confirmationNo,
      source: "WAITLIST_PROMOTION",
      fundingSource: "SELF_PAID",
      status: "CONFIRMED",
      submittedAt: new Date(),
      decidedAt: new Date(),
      decidedBy: "Bekleme Listesi",
      notes: `Bekleme listesi teklifi kabul edildi (#${entry.priority} öncelik)`,
    },
  });
  await db.waitlistEntry.update({ where: { id: entryId }, data: { status: "CONVERTED", respondedAt: new Date(), convertedRegistrationId: registration.id } });
  await db.badgeInstance.updateMany({ where: { participationId, status: "NOT_ELIGIBLE" }, data: { status: "READY" } });
  await db.activityLog.create({
    data: { type: ActivityType.REGISTRATION_CONFIRMED, editionId: entry.editionId, message: `Bekleme teklifi kabul edildi → kayıt açıldı: ${entry.person.firstName} ${entry.person.lastName}${entry.category ? ` (${entry.category.name})` : ""}`, entityType: "Registration", entityId: registration.id, actorName: actor },
  });
  return { registration, entry };
}
