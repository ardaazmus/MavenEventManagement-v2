// PWA Katılımcı Dış Portalı — PROFİL VERİSİ (yalnız AUTH oturumu)
// §2 Profil Sayfası Mantığı (doğrulanmış): bilet/kayıt bilgileri, erişim hakları
// (roller/yaka), bağlı sponsorluk, sipariş özeti ve bakiye.
// Güvenlik: oturum kapısı (PortalSession AUTH) — kişi verisi YALNIZ oturum sahibine
// döner; çapraz kişi/edisyon erişimi (BOLA) imkânsız (personId oturumdan gelir).
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { enforceRateLimit } from "@/lib/rate-limit";
import { extractSession, validatePortalSession, touchSession } from "@/lib/api/portal-access";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const denied = enforceRateLimit(req, { key: "portal-me", limit: 60, windowMs: 60_000 });
  if (denied) return denied;
  try {
    const raw = extractSession(req);
    if (!raw) return NextResponse.json({ error: "Oturum gerekli" }, { status: 401 });
    const check = await validatePortalSession(raw);
    if (!check.ok) {
      return NextResponse.json(
        { error: "Oturum geçersiz veya süresi dolmuş" },
        { status: check.reason === "UNKNOWN" ? 404 : 410 },
      );
    }
    const session = check.session;
    if (session.kind !== "AUTH" || !session.personId) {
      return NextResponse.json({ error: "Bu bölüm yalnız kayıtlı katılımcılara açıktır" }, { status: 403 });
    }
    touchSession(session.id);
    const editionId = session.editionId;

    const person = await db.person.findUnique({
      where: { id: session.personId },
      select: {
        id: true, firstName: true, lastName: true, email: true, title: true,
        company: true, photoUrl: true, linkedin: true,
      },
    });
    if (!person) return NextResponse.json({ error: "Kişi bulunamadı" }, { status: 404 });

    const participation = await db.eventParticipation.findUnique({
      where: { editionId_personId: { editionId, personId: person.id } },
      include: {
        roleAssignments: { select: { id: true, role: true } },
        badgeInstances: { select: { id: true, badgeNo: true, status: true, profile: { select: { name: true } } } },
      },
    });

    // E2E bulgusu (CRON-E2E): participation?.id undefined olduğunda Prisma filtresi
    // KALKAR ve edisyondaki TÜM kayıtlar bir participation-siz AUTH profiline sızar.
    // Participation yoksa kayıt listesi boş olmalı (veri ifşası kapatıldı).
    const registrations = participation
      ? await db.registration.findMany({
          where: { editionId, participationId: participation.id },
          include: { category: { select: { name: true, code: true, basePrice: true, currency: true } } },
          orderBy: { createdAt: "desc" },
        })
      : [];

    const registrationIds = registrations.map((r) => r.id);
    const orders = await db.order.findMany({
      where: {
        editionId,
        OR: [
          { buyerPersonId: person.id },
          { lines: { some: { OR: [{ participationId: participation?.id ?? "__none__" }, { registrationId: { in: registrationIds } }] } } },
        ],
      },
      include: { payments: { select: { status: true, amount: true } } },
      orderBy: { createdAt: "desc" },
    });

    // bağlı sponsorluk (varsa) — kişi kurum kontakiyse veya kurum aktif sponsorluğa sahipse
    const orgAssignment = await db.eventOrganizationAssignment.findFirst({
      where: { editionId, organization: { contacts: { some: { personId: person.id } } } },
      include: { organization: { select: { id: true, name: true, logoUrl: true } } },
    });
    let sponsorship: { organizationId: string; name: string; logoUrl: string | null; tierName: string | null } | null = null;
    if (orgAssignment) {
      const agreement = await db.sponsorAgreement.findFirst({
        where: { editionId, organizationId: orgAssignment.organizationId, status: { in: ["ACTIVE", "CONTRACTED"] } },
        include: { tier: { select: { name: true } } },
      });
      if (agreement) {
        sponsorship = {
          organizationId: orgAssignment.organization.id,
          name: orgAssignment.organization.name,
          logoUrl: orgAssignment.organization.logoUrl,
          tierName: agreement.tier?.name ?? null,
        };
      }
    }

    const balanceTotal = orders.reduce((sum, o) => {
      const paid = o.payments.filter((p) => p.status === "SUCCEEDED").reduce((s, p) => s + p.amount, 0);
      return sum + Math.max(0, o.totalAmount - paid);
    }, 0);

    return NextResponse.json({
      person,
      participation: participation
        ? {
            id: participation.id,
            attendance: participation.attendance,
            roles: participation.roleAssignments.map((r) => r.role),
            badges: participation.badgeInstances.map((b) => ({ badgeNo: b.badgeNo, status: b.status, profileName: b.profile?.name ?? null })),
          }
        : null,
      registrations: registrations.map((r) => ({
        id: r.id,
        confirmationNo: r.confirmationNo,
        status: r.status,
        submittedAt: r.submittedAt,
        decidedAt: r.decidedAt,
        categoryName: r.category?.name ?? null,
        categoryCode: r.category?.code ?? null,
        basePrice: r.category?.basePrice ?? 0,
        currency: r.category?.currency ?? "TRY",
      })),
      orders: orders.map((o) => {
        const paid = o.payments.filter((p) => p.status === "SUCCEEDED").reduce((s, p) => s + p.amount, 0);
        return { id: o.id, orderNo: o.orderNo, status: o.status, totalAmount: o.totalAmount, currency: o.currency, createdAt: o.createdAt, remaining: Math.max(0, o.totalAmount - paid), paid };
      }),
      balanceTotal,
      sponsorship,
    });
  } catch (err) {
    console.error("portal/me error:", err);
    return NextResponse.json({ error: "Profil verisi alınamadı" }, { status: 500 });
  }
}
