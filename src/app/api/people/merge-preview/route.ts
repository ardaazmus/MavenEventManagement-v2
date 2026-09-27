// /api/people/merge-preview — birleştirme öncesi çakışma analizi (Kimlik kuralı 1-2)
// Kaynak kişi hedefe taşınırken:
//   • aynı edisyonda İKİ katılım olamaz (@@unique editionId+personId) → edisyon bazlı kazanana karar verilir
//   • CertificateIssue (@@unique definition+participation) ve DelegationMember (@@unique delegation+participation) çakışmaları
//   • profil alanları: boş olanlar kaynaktan doldurulur, çakışanlar vurgulanır
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { resolveContext, GuardError } from "@/lib/api/tenant-guard";

const PROFILE_FIELDS = ["email", "phone", "title", "company", "city", "country", "bio"] as const;

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const sourceId = sp.get("sourceId");
    const targetId = sp.get("targetId");
    if (!sourceId || !targetId || sourceId === targetId) {
      return NextResponse.json({ error: "sourceId ve targetId farklı olmalı" }, { status: 400 });
    }

    // G0-b: birleştirme önizlemesi iki kişinin gerçeklerini karşılaştırır —
    // her iki taraf da bağlam kiracısına ait olmalı (yabancı id → 404, varlık ifşa edilmez)
    const ctx = await resolveContext(null);
    const [source, target] = await Promise.all([
      db.person.findUnique({ where: { id: sourceId } }),
      db.person.findUnique({ where: { id: targetId } }),
    ]);
    if (!source || !target) return NextResponse.json({ error: "Kişi bulunamadı" }, { status: 404 });
    if (source.tenantId !== ctx || target.tenantId !== ctx) {
      return NextResponse.json({ error: "Kişi bulunamadı" }, { status: 404 });
    }
    if (source.status === "MERGED" || target.status === "MERGED") {
      return NextResponse.json({ error: "Birleştirilmiş kayıt tekrar birleştirilemez" }, { status: 409 });
    }

    const srcParts = await db.eventParticipation.findMany({
      where: { personId: sourceId },
      include: {
        edition: { select: { id: true, name: true, startDate: true } },
        registrations: { include: { category: true }, orderBy: { createdAt: "desc" } },
        badgeInstances: { select: { status: true, badgeNo: true } },
      },
      orderBy: { editionId: "asc" },
    });
    const tgtParts = await db.eventParticipation.findMany({
      where: { personId: targetId },
      include: {
        edition: { select: { id: true, name: true, startDate: true } },
        registrations: { include: { category: true }, orderBy: { createdAt: "desc" } },
        badgeInstances: { select: { status: true, badgeNo: true } },
      },
      orderBy: { editionId: "asc" },
    });

    // aynı edisyonda iki katılım → çakışma (birleştime seçimi zorunlu)
    const tgtByEdition = new Map(tgtParts.map((p) => [p.editionId, p]));
    const conflictingEditions = srcParts
      .filter((sp2) => tgtByEdition.has(sp2.editionId))
      .map((sp2) => {
        const tp = tgtByEdition.get(sp2.editionId)!;
        const side = (p: typeof sp2) => ({
          participationId: p.id,
          regStatus: p.registrations[0]?.status ?? null,
          regNo: p.registrations[0]?.confirmationNo ?? null,
          categoryName: p.registrations[0]?.category?.name ?? null,
          attendance: p.attendance,
          badgeCount: p.badgeInstances.length,
        });
        // varsayılan kazanan: onaylı kaydı olan taraf; ikisi de onaylıysa/ikisi de değilse hedef
        const srcConfirmed = sp2.registrations.some((r) => r.status === "CONFIRMED");
        const tgtConfirmed = tp.registrations.some((r) => r.status === "CONFIRMED");
        const defaultWinner = srcConfirmed && !tgtConfirmed ? "source" : "target";
        return { editionId: sp2.editionId, editionName: sp2.edition.name, startDate: sp2.edition.startDate, source: side(sp2), target: side(tp), defaultWinner };
      });

    // edisyon-bazlı çakışmasız katılımlar sorunsuz taşınır
    const movableParticipations = srcParts.filter((p) => !tgtByEdition.has(p.editionId)).length;

    // kişi-düzeyi taşınacaklar sayıları
    const [submissions, authorships, reviewAssignments, scanEvents, tasks, contacts, delegationsLed, waitlistEntries] = await Promise.all([
      db.submission.count({ where: { submitterId: sourceId } }),
      db.authorship.count({ where: { personId: sourceId } }),
      db.reviewAssignment.count({ where: { reviewerId: sourceId } }),
      db.scanEvent.count({ where: { personId: sourceId } }),
      db.task.count({ where: { assigneeId: sourceId } }),
      db.organizationContact.count({ where: { personId: sourceId } }),
      db.delegation.count({ where: { leaderId: sourceId } }),
      db.waitlistEntry.count({ where: { personId: sourceId, status: { in: ["WAITING", "OFFERED"] } } }),
    ]);

    // profil alan farkları — boş hedef alanları kaynaktan doldurulur (fill-from-source)
    const fieldDiffs = PROFILE_FIELDS.map((f) => {
      const sv = source[f] ?? null;
      const tv = target[f] ?? null;
      return {
        field: f,
        source: sv,
        target: tv,
        kind: !tv && sv ? "fill" : (sv && tv && sv !== tv ? "conflict" : "same"),
      };
    }).filter((f) => f.kind !== "same");

    // çakışan edisyonda kaybeden tarafta kalacak rozet sayısı — uyarı için
    const loserBadges = conflictingEditions.reduce((s, c) => s + (c.defaultWinner === "target" ? c.source.badgeCount : c.target.badgeCount), 0);

    return NextResponse.json({
      source: { id: source.id, firstName: source.firstName, lastName: source.lastName, createdAt: source.createdAt },
      target: { id: target.id, firstName: target.firstName, lastName: target.lastName, createdAt: target.createdAt },
      conflictingEditions,
      movableParticipations,
      moves: { submissions, authorships, reviewAssignments, scanEvents, tasks, contacts, delegationsLed, waitlistEntries },
      fieldDiffs,
      loserBadges,
    });
  } catch (e) {
    if (e instanceof GuardError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("GET /api/people/merge-preview", e);
    return NextResponse.json({ error: "Birleştirme önizlemesi alınamadı" }, { status: 500 });
  }
}
