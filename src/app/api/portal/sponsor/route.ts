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
import { checkSponsorScope, agreementFilter } from "@/lib/portal/sponsor-scope";
import { sanitizeProfilePatch } from "@/lib/portal/sponsor-profile";
import { STAFF_ROLE } from "@/lib/portal/sponsor-staff";
import { ActivityType } from "@/lib/api/activity";

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
    // P20.1: kapsam + sahiplik — anlaşma-kapsamlı jeton yalnız o anlaşmaya işler
    // (liste yoksa daraltma filtrede; RED yalnız kapsam ihlalinde, varlık ifşa etmez)
    if (!checkSponsorScope(token, { editionId, organizationId }).ok) {
      return NextResponse.json({ error: "Etkinlik bulunamadı" }, { status: 404 });
    }
    touchToken(token.id);
    const scopeFilter = agreementFilter(token);

    // Faz A public allowlist: editionId → kiracı çözümlenemiyorsa 404
    const publicEdition = await resolvePublicEdition(editionId);
    if (!publicEdition) return NextResponse.json({ error: "Etkinlik bulunamadı" }, { status: 404 });

    const organization = await db.organization.findFirst({
      where: { id: organizationId, tenantId: publicEdition.tenantId }, // kiracı izolasyonu: başka kiracının kurumu ifşa edilmez
    });
    if (!organization) return NextResponse.json({ error: "Kurum bulunamadı" }, { status: 404 });

    const agreements = await db.sponsorAgreement.findMany({
      where: { editionId, organizationId, ...scopeFilter },
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

    // portalda görünecek katılımcılar — bu kurumdan gelenler (firma eşleşmesi +
    // P20.1: EXHIBITOR_STAFF rolü şart — rolü silinen personel listeden düşer)
    const staffParticipations = await db.eventParticipation.findMany({
      where: { editionId, person: { company: organization.name }, roleAssignments: { some: { role: STAFF_ROLE } } },
      include: {
        person: true,
        registrations: { include: { category: true } },
        badgeInstances: true,
        roleAssignments: { where: { role: STAFF_ROLE }, select: { status: true } },
      },
      orderBy: { createdAt: "asc" },
      take: 50,
    });

    const edition = await db.eventEdition.findUnique({
      where: { id: editionId },
      include: { series: true },
    });

    // TASK-B 25: görünür portal blokları — sponsor yüzeyi (yalnız düzenleyici içeriği)
    const blocks = await db.portalBlock.findMany({
      where: { editionId, isVisible: true, audience: { in: ["SPONSOR", "BOTH"] } },
      orderBy: [{ order: "asc" }, { createdAt: "asc" }],
      select: { id: true, type: true, title: true, payloadJson: true, order: true },
    });

    // TASK-B 26: stant (booth) özeti — kurumun sözleşmelerine bağlı tahsislerin düz listesi
    // (aynı veri agreements[].booths altında da yaşar; burada net anahtarla tekrar sunulur)
    const booths = agreements.flatMap((a) =>
      a.boothAllocations.map((b) => ({
        id: b.id, agreementId: a.id, agreementStatus: a.status,
        status: b.status, allocatedAt: b.allocatedAt, releasedAt: b.releasedAt,
        code: b.boothUnit?.code ?? null, sizeSqm: b.boothUnit?.sizeSqm ?? null,
        boothStatus: b.boothUnit?.status ?? null, price: b.boothUnit?.price ?? null,
        currency: b.boothUnit?.currency ?? "TRY",
      })),
    );

    return NextResponse.json({
      // TASK-B 25: düzenleyici kontrollü içerik blokları — üst-seviye anahtar
      blocks,
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
      // TASK-B 26: stant tahsislerinin düz listesi (sözleşme bağımsız hızlı görünüm)
      booths,
      entitlements: entitlements.map((e) => ({
        id: e.id, label: e.label, type: e.type, source: e.source,
        granted: e.quantityGranted, consumed: e.quantityConsumed, reserved: e.quantityReserved,
        // TASK-B 26: havuz özeti — total (kota) ve claimed (kullanılan + ayrılmış);
        // sponsor için kalan = total - claimed
        total: e.quantityGranted, claimed: e.quantityConsumed + e.quantityReserved,
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
        staffRoleStatus: p.roleAssignments[0]?.status ?? null,
        registrationStatus: p.registrations[0]?.status ?? null,
        categoryCode: p.registrations[0]?.category?.code ?? null,
        badgeStatus: p.badgeInstances[0]?.status ?? null,
      })),
      // P20.1: jetonun erişim kapsamı (anlaşma-kapsamlı ise id; kurum geneli ise null)
      grant: { agreementId: token.agreementId ?? null },
    });
  } catch (err) {
    console.error("portal/sponsor error:", err);
    return NextResponse.json({ error: "Sponsor portal verisi alınamadı" }, { status: 500 });
  }
}

// P20.1: Sponsor kurum kartı düzenlemesi — jeton sahibi yalnız KENDİ kurumunun
// izinli alanlarını yamar (ad/vergi-no/kiracı dokunulmaz).
export async function PATCH(req: NextRequest) {
  try {
    const body = (await req.json()) as Record<string, unknown>;
    const editionId = body.editionId;
    const organizationId = body.organizationId;
    if (typeof editionId !== "string" || typeof organizationId !== "string" || !editionId || !organizationId) {
      return NextResponse.json({ error: "editionId ve organizationId zorunlu" }, { status: 400 });
    }
    const raw = extractToken(req) ?? (typeof body.token === "string" ? body.token : null);
    if (!raw) {
      return NextResponse.json({ error: "Portal erişim anahtarı gerekli" }, { status: 410 });
    }
    const check = await validatePortalToken(raw);
    if (!check.ok) {
      return NextResponse.json(
        { error: check.reason === "UNKNOWN" ? "Etkinlik bulunamadı" : "Erişim anahtarınız geçersiz veya süresi dolmuş" },
        { status: check.reason === "UNKNOWN" ? 404 : 410 },
      );
    }
    const token = check.token;
    if (!checkSponsorScope(token, { editionId, organizationId }).ok) {
      return NextResponse.json({ error: "Etkinlik bulunamadı" }, { status: 404 });
    }
    touchToken(token.id);

    const publicEdition = await resolvePublicEdition(editionId);
    if (!publicEdition) return NextResponse.json({ error: "Etkinlik bulunamadı" }, { status: 404 });
    const organization = await db.organization.findFirst({
      where: { id: organizationId, tenantId: publicEdition.tenantId },
      select: { id: true, name: true },
    });
    if (!organization) return NextResponse.json({ error: "Kurum bulunamadı" }, { status: 404 });

    const patch = sanitizeProfilePatch(body.profile ?? body);
    if (!patch.ok) return NextResponse.json({ error: patch.error }, { status: 400 });
    const updated = await db.organization.update({ where: { id: organization.id }, data: patch.data });
    await db.activityLog.create({
      data: {
        type: ActivityType.ORG_SAVED,
        editionId,
        message: `Portal: kurum kartı güncellendi — ${organization.name} (${Object.keys(patch.data).join(", ")})`,
        entityType: "Organization",
        entityId: organization.id,
        actorName: `Sponsor Portalı — ${organization.name}`,
      },
    });
    return NextResponse.json({
      ok: true,
      organization: {
        id: updated.id, name: updated.name, website: updated.website, city: updated.city,
        country: updated.country, logoUrl: updated.logoUrl, generalEmail: updated.generalEmail,
        description: updated.description, address: updated.address,
      },
    });
  } catch (err) {
    console.error("portal/sponsor PATCH error:", err);
    return NextResponse.json({ error: "Kurum kartı güncellenemedi" }, { status: 500 });
  }
}
