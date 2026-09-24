// Katılımcı dış portalı — kişinin kendi verilerinin dış kullanıcıdan görünen hali.
// Mimari (§12 kayıt kaynakları): PUBLIC_FORM/SPONSOR_PORTAL gibi kaynaklarla gelen
// katılımcı; kendi kayıt, ödeme, program, konaklama ve bekleme teklifini görür.
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { expireStaleOffers } from "@/lib/api/waitlist-engine";
import { resolvePublicEdition } from "@/lib/api/public-guard";

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const editionId = sp.get("editionId");
    const personId = sp.get("personId");
    if (!editionId || !personId) {
      return NextResponse.json({ error: "editionId ve personId zorunlu" }, { status: 400 });
    }

    // Faz A public allowlist: editionId → kiracı çözümlenemiyorsa 404
    const publicEdition = await resolvePublicEdition(editionId);
    if (!publicEdition) return NextResponse.json({ error: "Etkinlik bulunamadı" }, { status: 404 });

    // süresi geçen teklifleri kapat — portal görünümü hep güncel
    await expireStaleOffers(editionId);

    const person = await db.person.findUnique({
      where: { id: personId },
    });
    if (!person) return NextResponse.json({ error: "Kişi bulunamadı" }, { status: 404 });

    const participation = await db.eventParticipation.findUnique({
      where: { editionId_personId: { editionId, personId } },
      include: {
        roleAssignments: true,
        badgeInstances: { include: { profile: true } },
        certIssues: { include: { definition: true } },
        snapshots: { orderBy: { createdAt: "desc" } },
        reservations: { include: { roomType: { include: { hotel: true } }, block: true } },
        programAssignments: { include: { session: { include: { room: true } } }, orderBy: { id: "asc" } },
        entitlementClaims: { include: { entitlement: true } },
      },
    });

    const registrations = await db.registration.findMany({
      where: { editionId, participationId: participation?.id },
      include: { category: true },
      orderBy: { createdAt: "desc" },
    });

    const registrationIds = registrations.map((r) => r.id);
    const orders = await db.order.findMany({
      where: {
        editionId,
        OR: [
          { buyerPersonId: personId },
          { lines: { some: { OR: [{ participationId: participation?.id ?? "__none__" }, { registrationId: { in: registrationIds } }] } } },
        ],
      },
      include: { lines: true, payments: { orderBy: { createdAt: "desc" } }, refunds: true },
      orderBy: { createdAt: "desc" },
    });

    const waitlist = await db.waitlistEntry.findMany({
      where: { editionId, personId },
      include: { category: true, convertedRegistration: true },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    });

    // edisyon özeti — portal başlığında gösterilir
    const edition = await db.eventEdition.findUnique({
      where: { id: editionId },
      include: { series: true },
    });

    return NextResponse.json({
      edition: edition
        ? { id: edition.id, name: edition.name, startDate: edition.startDate, endDate: edition.endDate, venueName: edition.venueName, city: edition.city, isPublished: edition.isPublished, seriesName: edition.series?.name ?? null }
        : null,
      person: {
        id: person.id, firstName: person.firstName, lastName: person.lastName,
        email: person.email, title: person.title, organizationName: person.company,
        // G0-c: portal simülasyonu aksiyonlarda bu belirteci gönderir (TODO-auth: gerçek portal oturumunda sunucu oturumundan türetilir)
        portalToken: person.portalToken,
      },
      participation: participation
        ? {
            id: participation.id, source: participation.source, attendance: participation.attendance,
            notes: participation.notes,
            roleAssignments: participation.roleAssignments.map((r) => ({ id: r.id, role: r.role })),
            badges: participation.badgeInstances.map((b) => ({ id: b.id, status: b.status, badgeNo: b.badgeNo, profileName: b.profile?.name ?? null })),
            certificates: participation.certIssues.map((c) => ({ id: c.id, status: c.status, note: c.eligibilityNote, definitionName: c.definition?.name ?? null, generatedAt: c.generatedAt, deliveredAt: c.deliveredAt })),
            snapshot: participation.snapshots[0] ? { badgeName: participation.snapshots[0].badgeName, company: participation.snapshots[0].company, title: participation.snapshots[0].title } : null,
            reservations: participation.reservations.map((r) => ({
              id: r.id, guestName: r.guestName, checkIn: r.checkIn, checkOut: r.checkOut,
              status: r.status, payerType: r.payerType, payerName: r.payerName,
              roomType: r.roomType?.name ?? null, hotel: r.roomType?.hotel?.name ?? null,
            })),
            program: participation.programAssignments.map((pa) => ({
              id: pa.id, role: pa.role,
              sessionTitle: pa.session?.title ?? null, sessionType: pa.session?.type ?? null,
              startTime: pa.session?.startTime ?? null, endTime: pa.session?.endTime ?? null,
              room: pa.session?.room?.name ?? null, cmeCredits: pa.session?.cmeCredits ?? 0,
            })),
            claims: participation.entitlementClaims.map((c) => ({
              id: c.id, status: c.status, guestName: c.guestName,
              entitlementLabel: c.entitlement?.label ?? null,
            })),
          }
        : null,
      registrations: registrations.map((r) => ({
        id: r.id, confirmationNo: r.confirmationNo, status: r.status, source: r.source,
        fundingSource: r.fundingSource, submittedAt: r.submittedAt, decidedAt: r.decidedAt,
        cancelReason: r.cancelReason, notes: r.notes,
        categoryName: r.category?.name ?? null, categoryCode: r.category?.code ?? null,
        basePrice: r.category?.basePrice ?? 0, currency: r.category?.currency ?? "TRY",
      })),
      orders: orders.map((o) => {
        const paid = o.payments.filter((p) => p.status === "SUCCEEDED").reduce((s, p) => s + p.amount, 0);
        const pending = o.payments.filter((p) => p.status === "PENDING").reduce((s, p) => s + p.amount, 0);
        return {
          id: o.id, orderNo: o.orderNo, status: o.status, totalAmount: o.totalAmount,
          currency: o.currency, createdAt: o.createdAt, payerName: o.payerName,
          lines: o.lines.map((l) => ({ id: l.id, description: l.description, quantity: l.quantity, total: l.total })),
          payments: o.payments.map((p) => ({ id: p.id, amount: p.amount, source: p.source, status: p.status, reference: p.reference, paidAt: p.paidAt })),
          paid, pending, remaining: Math.max(0, o.totalAmount - paid),
        };
      }),
      waitlist: waitlist.map((w) => ({
        id: w.id, status: w.status, priority: w.priority, notes: w.notes,
        offeredAt: w.offeredAt, offerExpiresAt: w.offerExpiresAt, respondedAt: w.respondedAt,
        categoryName: w.category?.name ?? "Genel", categoryCode: w.category?.code ?? null,
        convertedRegistrationNo: w.convertedRegistration?.confirmationNo ?? null,
      })),
    });
  } catch (err) {
    console.error("portal/participant error:", err);
    return NextResponse.json({ error: "Portal verisi alınamadı" }, { status: 500 });
  }
}
