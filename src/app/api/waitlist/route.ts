// /api/waitlist — Bekleme listesi yönetimi + otomatik teklif motoru (§12 kayıt politikası)
// GET  ?editionId= → özet + kategori doluluk anlık görüntüsü + girişler
// POST aksiyonları: add | offer | auto-offer | respond | cancel
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ActivityType } from "@/lib/api/activity";
import { autoOfferForCategory, expireStaleOffers, seatStatsForCategory, convertOfferToRegistration } from "@/lib/api/waitlist-engine";

export async function GET(req: NextRequest) {
  try {
    const editionId = req.nextUrl.searchParams.get("editionId");
    if (!editionId) return NextResponse.json({ error: "editionId zorunlu" }, { status: 400 });

    await expireStaleOffers(editionId);

    const [entries, categories] = await Promise.all([
      db.waitlistEntry.findMany({
        where: { editionId },
        orderBy: [{ priority: "asc" }, { createdAt: "asc" }],
        include: {
          person: { select: { id: true, firstName: true, lastName: true, email: true, company: true, title: true, status: true } },
          category: { select: { id: true, name: true, code: true, capacity: true } },
          participation: { select: { id: true, attendance: true } },
          convertedRegistration: { select: { id: true, confirmationNo: true, status: true } },
        },
      }),
      db.registrationCategory.findMany({
        where: { editionId },
        orderBy: { order: "asc" },
        include: { _count: { select: { registrations: true, waitlistEntries: true } } },
      }),
    ]);

    const categoryStats = await Promise.all(
      categories.map(async (c) => {
        const taken = await db.registration.count({ where: { categoryId: c.id, status: { in: ["SUBMITTED", "PENDING_APPROVAL", "CONFIRMED"] } } });
        const waiting = entries.filter((e) => e.categoryId === c.id && e.status === "WAITING").length;
        const offered = entries.filter((e) => e.categoryId === c.id && e.status === "OFFERED").length;
        const seatsLeft = c.capacity == null ? null : Math.max(0, c.capacity - taken);
        return {
          id: c.id, name: c.name, code: c.code, capacity: c.capacity, taken, seatsLeft,
          waitingCount: waiting, offeredCount: offered,
          fillPercent: c.capacity == null ? null : Math.min(100, Math.round((taken / c.capacity) * 100)),
        };
      }),
    );

    const summary = {
      waiting: entries.filter((e) => e.status === "WAITING").length,
      offered: entries.filter((e) => e.status === "OFFERED").length,
      converted: entries.filter((e) => e.status === "CONVERTED").length,
      declinedExpired: entries.filter((e) => ["DECLINED", "EXPIRED", "CANCELLED"].includes(e.status)).length,
      fullCategories: categoryStats.filter((c) => c.capacity != null && (c.seatsLeft ?? 0) <= 0).length,
      categoriesWithQueue: categoryStats.filter((c) => c.waitingCount > 0).length,
    };

    return NextResponse.json({ summary, categories: categoryStats, entries });
  } catch (e) {
    console.error("GET /api/waitlist", e);
    return NextResponse.json({ error: "Bekleme listesi okunamadı" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Record<string, unknown> & { action?: string };
    const action = body.action;

    switch (action) {
      // ── Listeye ekle (kişi seçerek; öncelik boşsa sıranın sonuna) ──
      case "add": {
        const { editionId, personId, categoryId, priority, notes } = body as { editionId: string; personId: string; categoryId?: string | null; priority?: number; notes?: string };
        if (!editionId || !personId) return NextResponse.json({ error: "editionId ve personId zorunlu" }, { status: 400 });

        const person = await db.person.findUnique({ where: { id: personId } });
        if (!person) return NextResponse.json({ error: "Kişi bulunamadı" }, { status: 404 });

        if (categoryId) {
          const existing = await db.waitlistEntry.findFirst({ where: { editionId, personId, categoryId, status: { in: ["WAITING", "OFFERED"] } } });
          if (existing) return NextResponse.json({ error: "Bu kişi bu kategori için beklemede" }, { status: 409 });
          // zaten onaylı kaydı varsa beklemeye anlamsız
          const confirmed = await db.registration.findFirst({ where: { editionId, participation: { personId }, categoryId, status: { in: ["SUBMITTED", "PENDING_APPROVAL", "CONFIRMED"] } } });
          if (confirmed) return NextResponse.json({ error: "Kişinin bu kategoride zaten aktif kaydı var" }, { status: 409 });
        } else {
          const anyActive = await db.waitlistEntry.findFirst({ where: { editionId, personId, categoryId: null, status: { in: ["WAITING", "OFFERED"] } } });
          if (anyActive) return NextResponse.json({ error: "Bu kişi genel listede zaten bekliyor" }, { status: 409 });
        }

        const participation = await db.eventParticipation.upsert({
          where: { editionId_personId: { editionId, personId } },
          create: { editionId, personId, source: "ADMIN_ENTRY" },
          update: {},
        });
        let finalPriority = typeof priority === "number" && priority > 0 ? Math.floor(priority) : null;
        if (finalPriority == null) {
          const maxP = await db.waitlistEntry.aggregate({ where: { editionId }, _max: { priority: true } });
          finalPriority = Math.max(100, (maxP._max.priority ?? 0) + 1);
        }

        const entry = await db.waitlistEntry.create({
          data: { editionId, personId, participationId: participation.id, categoryId: categoryId ?? null, priority: finalPriority, notes: notes ?? null },
          include: { person: { select: { firstName: true, lastName: true } }, category: { select: { name: true } } },
        });
        await db.activityLog.create({
          data: { type: ActivityType.PARTICIPATION_SAVED, editionId, message: `Bekleme listesine eklendi: ${entry.person.firstName} ${entry.person.lastName}${entry.category ? ` — ${entry.category.name}` : " (genel)"} · öncelik #${finalPriority}`, entityType: "WaitlistEntry", entityId: entry.id, actorName: "Kayıt Sorumlusu" },
        });
        return NextResponse.json(entry, { status: 201 });
      }

      // ── Manuel tek teklif (sıra dışına çıkma; kapasite şart) ──
      case "offer": {
        const { entryId } = body as { entryId: string };
        const entry = await db.waitlistEntry.findUnique({ where: { id: entryId } });
        if (!entry) return NextResponse.json({ error: "Giriş bulunamadı" }, { status: 404 });
        if (entry.status !== "WAITING") return NextResponse.json({ error: `Giriş ${entry.status} durumunda — teklif verilemez` }, { status: 409 });
        if (entry.categoryId) {
          const stats = await seatStatsForCategory(entry.categoryId);
          const openOffers = await db.waitlistEntry.count({ where: { categoryId: entry.categoryId, status: "OFFERED" } });
          if (stats.capacity != null && (stats.seatsLeft ?? 0) - openOffers <= 0) {
            return NextResponse.json({ error: "Koltuk başına tek teklif — açık teklif yanıtlanmadan yenisi verilemez" }, { status: 409 });
          }
        }
        const expires = new Date();
        expires.setHours(expires.getHours() + 48);
        const updated = await db.waitlistEntry.update({ where: { id: entryId }, data: { status: "OFFERED", offeredAt: new Date(), offerExpiresAt: expires } });
        const person = await db.person.findUnique({ where: { id: entry.personId } });
        await db.activityLog.create({
          data: { type: ActivityType.REGISTRATION_SAVED, editionId: entry.editionId, message: `Manuel bekleme teklifi: ${person ? `${person.firstName} ${person.lastName}` : entry.personId} — 48 saat geçerli`, entityType: "WaitlistEntry", entityId: entry.id, actorName: "Kayıt Sorumlusu" },
        });
        return NextResponse.json(updated);
      }

      // ── Otomatik teklif: kategori (veya tüm kategoriler) için boş koltukları sıraya dağıt ──
      case "auto-offer": {
        const { editionId, categoryId } = body as { editionId: string; categoryId?: string };
        if (!editionId) return NextResponse.json({ error: "editionId zorunlu" }, { status: 400 });
        const results: { categoryId: string; offered: { entryId: string; personName: string; priority: number }[] }[] = [];
        if (categoryId) {
          results.push({ categoryId, offered: await autoOfferForCategory(editionId, categoryId) });
        } else {
          const cats = await db.registrationCategory.findMany({ where: { editionId, capacity: { not: null } }, select: { id: true } });
          for (const c of cats) {
            const offered = await autoOfferForCategory(editionId, c.id);
            if (offered.length > 0) results.push({ categoryId: c.id, offered });
          }
          // kategorisiz bekleyenler otomatik dağıtıma girmez — el ile teklif gerekir
        }
        const total = results.reduce((s, r) => s + r.offered.length, 0);
        return NextResponse.json({ ok: true, total, results });
      }

      // ── Teklife yanıt (portaldan yanıt gelene kadar simülasyon) ──
      case "respond": {
        const { entryId, response, actor } = body as { entryId: string; response: "ACCEPT" | "DECLINE"; actor?: string };
        const entry = await db.waitlistEntry.findUnique({ where: { id: entryId } });
        if (!entry) return NextResponse.json({ error: "Giriş bulunamadı" }, { status: 404 });
        if (entry.status !== "OFFERED") return NextResponse.json({ error: `Giriş ${entry.status} durumunda — yanıtlama uygun değil` }, { status: 409 });

        if (response === "ACCEPT") {
          const conv = await convertOfferToRegistration(entryId, actor ?? "Kayıt Sorumlusu");
          if ("error" in conv) return NextResponse.json({ error: conv.error }, { status: conv.status });
          // kabul → koltuk yeniden doldu; sıradaki bekleyene şu an teklif çıkmaz
          return NextResponse.json({ ok: true, registration: conv.registration, entry: await db.waitlistEntry.findUnique({ where: { id: entryId } }) });
        }

        // ret → sıradaki kişiye zincirleme teklif
        await db.waitlistEntry.update({ where: { id: entryId }, data: { status: "DECLINED", respondedAt: new Date() } });
        const person = await db.person.findUnique({ where: { id: entry.personId } });
        await db.activityLog.create({
          data: { type: ActivityType.REGISTRATION_SAVED, editionId: entry.editionId, message: `Bekleme teklifi reddedildi: ${person ? `${person.firstName} ${person.lastName}` : entry.personId} — sıradakine geçiliyor`, entityType: "WaitlistEntry", entityId: entry.id, actorName: actor ?? "Bekleme Motoru" },
        });
        const chained = entry.categoryId ? await autoOfferForCategory(entry.editionId, entry.categoryId) : [];
        return NextResponse.json({ ok: true, chained });
      }

      // ── Listeden çıkar ──
      case "cancel": {
        const { entryId, reason } = body as { entryId: string; reason?: string };
        const entry = await db.waitlistEntry.findUnique({ where: { id: entryId } });
        if (!entry) return NextResponse.json({ error: "Giriş bulunamadı" }, { status: 404 });
        if (!["WAITING", "OFFERED"].includes(entry.status)) return NextResponse.json({ error: `Giriş ${entry.status} durumunda — çıkarılamaz` }, { status: 409 });
        const updated = await db.waitlistEntry.update({ where: { id: entryId }, data: { status: "CANCELLED", notes: reason ?? entry.notes } });
        // teklifli giriş çıkarıldıysa koltuk serbest — sıradakine geç
        const chained = entry.status === "OFFERED" && entry.categoryId ? await autoOfferForCategory(entry.editionId, entry.categoryId) : [];
        return NextResponse.json({ ok: true, entry: updated, chained });
      }

      default:
        return NextResponse.json({ error: `Bilinmeyen aksiyon: ${action}` }, { status: 400 });
    }
  } catch (e) {
    console.error("POST /api/waitlist", e);
    const msg = e instanceof Error ? e.message : "Bekleme listesi işlemi başarısız";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
