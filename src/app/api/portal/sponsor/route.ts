// Sponsor dış portalı — kurumun sözleşme, hak, stant, teslim ve sipariş görünümü.
// Mimari (§20, §60): dış portallar ayrı uygulama, ortak kimlik — Maven veri sahibi,
// portal tüketici. SPONSOR_PORTAL / EXHIBITOR_PORTAL kaynaklı katılımlar buraya bağlanır.
// TASK-A F1 (OWASP API1:2023 — BOLA): bu uç YETENEK BELİRTECİYLE kapılanır —
//   belirteç yok → 410; sahte/bilinmeyen/yanlış kapsam/yabancı kurum-edisyon → 404;
//   süresi geçmiş/iptal → 410. Kurum sözleşme/teslim/sipariş verisi YALNIZ geçerli
//   belirteçle döner. Belirteç yanıtta ASLA yer almaz.
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { resolvePublicEdition } from "@/lib/api/public-guard";
import { extractToken, validatePortalToken, touchToken } from "@/lib/api/portal-tokens";

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const editionId = sp.get("editionId");
    const organizationId = sp.get("organizationId");
    if (!editionId || !organizationId) {
      return NextResponse.json({ error: "editionId ve organizationId zorunlu" }, { status: 400 });
    }

    // TASK-A F1: belirteç kapısı — belirsizlik varlık ifşa etmez
    const raw = extractToken(req);
    if (!raw) {
      return NextResponse.json({ error: "Portal erişim anahtarı gerekli — bağlantınızı onay e-postasından kullanın" }, { status: 410 });
    }
    const check = await validatePortalToken(raw);
    if (!check.ok) {
      return NextResponse.json(
        { error: check.reason === "UNKNOWN" ? "Etkinlik bulunamadı" : "Erişim anahtarınız geçersiz veya süresi dolmuş" },
        { status: check.reason === "UNKNOWN" ? 404 : 410 },
      );
    }
    const token = check.token;
    // kapsam + sahiplik: SPONSOR belirteci yalnız kendi kurumu + kendi edisyonu için geçerli
    if (token.scope !== "SPONSOR" || token.organizationId !== organizationId || token.editionId !== editionId) {
      return NextResponse.json({ error: "Etkinlik bulunamadı" }, { status: 404 });
    }
    touchToken(token.id);

    // Faz A public allowlist: editionId → kiracı çözümlenemiyorsa 404
    const publicEdition = await resolvePublicEdition(editionId);
    if (!publicEdition) return NextResponse.json({ error: "Etkinlik bulunamadı" }, { status: 404 });

    const organization = await db.organization.findFirst({
      where: { id: organizationId, tenantId: publicEdition.tenantId }, // kiracı izolasyonu: başka kiracının kurumu ifşa edilmez
    });
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
      // TASK-A F1: portalToken alanı KALDIRILDI — belirteç yanıt gövdelerinde ASLA dolaşmaz
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
