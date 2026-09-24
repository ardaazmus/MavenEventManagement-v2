// /api/public/tenant?slug= — Firma Vitrini public verisi (Faz C / R11)
// Kural: KİŞİSEL VERI ÇIKMAZ — yalnız firma kimliği, toplam sayılar (agregat) ve
// arşivdeki edisyonların kamuya açık meta bilgileri döner. İsim/e-posta/telefon
// gibi kişi verileri tenant-içi modüllerde kalır.
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { resolvePublicTenant } from "@/lib/api/public-guard";

// arşiv sayılan durumlar: tamamlanmış/mutabakat/arşiv
const ARCHIVE_STATUSES = ["POST_EVENT", "RECONCILIATION", "ARCHIVED"];

export async function GET(req: NextRequest) {
  try {
    const slug = req.nextUrl.searchParams.get("slug");
    const tenant = await resolvePublicTenant(slug);
    if (!tenant) return NextResponse.json({ error: "Sayfa bulunamadı" }, { status: 404 });

    const [editionTotal, archiveCount, upcoming, archiveEditions, participantTotal, mediaCount] = await Promise.all([
      db.eventEdition.count({ where: { tenantId: tenant.id } }),
      db.eventEdition.count({ where: { tenantId: tenant.id, status: { in: ARCHIVE_STATUSES } } }),
      db.eventEdition.findFirst({
        where: { tenantId: tenant.id, isPublished: true, status: { notIn: ARCHIVE_STATUSES } },
        orderBy: { startDate: "asc" },
        select: { id: true, name: true, startDate: true, endDate: true, city: true, venueName: true, editionLabel: true },
      }),
      db.eventEdition.findMany({
        where: { tenantId: tenant.id, status: { in: ARCHIVE_STATUSES } },
        orderBy: { startDate: "desc" },
        select: {
          id: true, name: true, slug: true, startDate: true, endDate: true, city: true,
          venueName: true, editionLabel: true, status: true,
          _count: { select: { participations: true } },
        },
        take: 12,
      }),
      db.eventParticipation.count({ where: { edition: { tenantId: tenant.id } } }),
      db.mediaAsset.count({ where: { edition: { tenantId: tenant.id } } }),
    ]);

    // yalnız kamuya açık alanlar — plan/status detayı, iç kimlikler döndürülmez
    return NextResponse.json({
      company: {
        name: tenant.name,
        slug: tenant.slug,
        tagline: tenant.tagline,
        aboutText: tenant.aboutText,
        logoUrl: tenant.logoUrl,
        website: tenant.website,
        contact: {
          name: tenant.contactName,
          phone: tenant.contactPhone,
          email: tenant.contactEmail,
        },
        country: tenant.country,
      },
      stats: {
        editionTotal,
        archiveCount,
        participantTotal, // yalnız adet — isim tenant-içi
        mediaCount,
      },
      nextEdition: upcoming,
      archive: archiveEditions.map((e) => ({
        id: e.id,
        name: e.name,
        slug: e.slug,
        editionLabel: e.editionLabel,
        startDate: e.startDate,
        endDate: e.endDate,
        city: e.city,
        venueName: e.venueName,
        participantCount: e._count.participations, // yalnız sayı
      })),
      note: "Bu sayfa kamu yüzeyidir; katılımcı kişisel verileri içermez (KVKK md.5/6).",
    });
  } catch (e) {
    console.error("GET /api/public/tenant", e);
    return NextResponse.json({ error: "Vitrin verisi alınamadı" }, { status: 500 });
  }
}
