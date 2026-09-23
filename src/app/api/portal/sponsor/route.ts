// Sponsor dış portalı — kurumun sözleşme, hak, stant, teslim ve sipariş görünümü.
// Mimari (§20, §60): dış portallar ayrı uygulama, ortak kimlik — Maven veri sahibi,
// portal tüketici. SPONSOR_PORTAL / EXHIBITOR_PORTAL kaynaklı katılımlar buraya bağlanır.
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const editionId = sp.get("editionId");
    const organizationId = sp.get("organizationId");
    if (!editionId || !organizationId) {
      return NextResponse.json({ error: "editionId ve organizationId zorunlu" }, { status: 400 });
    }

    const organization = await db.organization.findUnique({ where: { id: organizationId } });
    if (!organization) return NextResponse.json({ error: "Kurum bulunamadı" }, { status: 404 });

    const agreements = await db.sponsorAgreement.findMany({
      where: { editionId, organizationId },
      include: {
        tier: true,
        package: { include: { tier: true } },
        deliverables: { orderBy: { dueDate: "asc" } },
        boothAllocations: { include: { boothUnit: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    const entitlements = await db.entitlement.findMany({
      where: { editionId, ownerOrganizationId: organizationId },
      include: { claims: { orderBy: { reservedAt: "desc" } } },
      orderBy: { id: "asc" },
    });

    const orders = await db.order.findMany({
      where: { editionId, buyerOrganizationId: organizationId },
      include: {
        lines: { include: { participation: { include: { person: true } } } },
        payments: { orderBy: { createdAt: "desc" } },
      },
      orderBy: { createdAt: "desc" },
    });

    // portalda görünecek katılımcılar — bu kurumdan gelenler (firma eşleşmesiyle)
    const staffParticipations = await db.eventParticipation.findMany({
      where: { editionId, person: { company: organization.name } },
      include: {
        person: true,
        registrations: { include: { category: true } },
        badgeInstances: true,
      },
      orderBy: { createdAt: "asc" },
      take: 50,
    });

    const edition = await db.eventEdition.findUnique({
      where: { id: editionId },
      include: { series: true },
    });

    return NextResponse.json({
      edition: edition
        ? { id: edition.id, name: edition.name, startDate: edition.startDate, endDate: edition.endDate, venueName: edition.venueName, city: edition.city, seriesName: edition.series?.name ?? null }
        : null,
      organization: {
        id: organization.id, name: organization.name, type: organization.type,
        city: organization.city, country: organization.country, website: organization.website,
      },
      agreements: agreements.map((a) => ({
        id: a.id, status: a.status, amount: a.amount, currency: a.currency,
        signedAt: a.signedAt, notes: a.notes,
        tierName: a.tier?.name ?? a.package?.tier?.name ?? null,
        packageName: a.package?.name ?? null, rightsSpec: a.package?.rightsSpec ?? null,
        deliverables: a.deliverables.map((d) => ({
          id: d.id, name: d.name, type: d.type, status: d.status,
          dueDate: d.dueDate, responsible: d.responsible, notes: d.notes,
        })),
        booths: a.boothAllocations.map((b) => ({
          id: b.id, status: b.status, allocatedAt: b.allocatedAt, releasedAt: b.releasedAt,
          code: b.boothUnit?.code ?? null, sizeSqm: b.boothUnit?.sizeSqm ?? null,
          boothStatus: b.boothUnit?.status ?? null, price: b.boothUnit?.price ?? null, currency: b.boothUnit?.currency ?? "TRY",
        })),
      })),
      entitlements: entitlements.map((e) => ({
        id: e.id, label: e.label, type: e.type, source: e.source,
        granted: e.quantityGranted, consumed: e.quantityConsumed, reserved: e.quantityReserved,
        restrictions: e.restrictions, validUntil: e.validUntil,
        claims: e.claims.map((c) => ({ id: c.id, status: c.status, guestName: c.guestName, reservedAt: c.reservedAt, consumedAt: c.consumedAt })),
      })),
      orders: orders.map((o) => {
        const paid = o.payments.filter((p) => p.status === "SUCCEEDED").reduce((s, p) => s + p.amount, 0);
        const pending = o.payments.filter((p) => p.status === "PENDING").reduce((s, p) => s + p.amount, 0);
        return {
          id: o.id, orderNo: o.orderNo, status: o.status, totalAmount: o.totalAmount,
          currency: o.currency, createdAt: o.createdAt, payerName: o.payerName,
          lines: o.lines.map((l) => ({
            id: l.id, description: l.description, quantity: l.quantity, total: l.total,
            personName: l.participation?.person ? `${l.participation.person.firstName} ${l.participation.person.lastName}` : null,
          })),
          payments: o.payments.map((p) => ({ id: p.id, amount: p.amount, source: p.source, status: p.status, reference: p.reference, paidAt: p.paidAt })),
          paid, pending, remaining: Math.max(0, o.totalAmount - paid),
        };
      }),
      staff: staffParticipations.map((p) => ({
        participationId: p.id, source: p.source,
        personName: `${p.person.firstName} ${p.person.lastName}`, personTitle: p.person.title,
        registrationStatus: p.registrations[0]?.status ?? null,
        categoryCode: p.registrations[0]?.category?.code ?? null,
        badgeStatus: p.badgeInstances[0]?.status ?? null,
      })),
    });
  } catch (err) {
    console.error("portal/sponsor error:", err);
    return NextResponse.json({ error: "Sponsor portal verisi alınamadı" }, { status: 500 });
  }
}
