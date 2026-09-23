// /api/bootstrap — SPA ilk yüklemesi: tenant, edisyonlar, sayaçlar
import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET() {
  try {
    const tenant = await db.tenant.findFirst({
      include: {
        series: { include: { _count: { select: { editions: true } } } },
        organizations: { include: { _count: { select: { eventAssignments: true, sponsorAgreements: true, contacts: true } } } },
      },
    });

    if (!tenant) return NextResponse.json({ tenant: null }, { status: 200 });

    const [editions, peopleCount, recentActivity] = await Promise.all([
      db.eventEdition.findMany({
        include: {
          series: true,
          capabilities: true,
          _count: { select: { participations: true, registrations: true, sponsorAgreements: true, sessions: true, tasks: true } },
        },
        orderBy: { startDate: "desc" },
      }),
      db.person.count({ where: { tenantId: tenant.id } }),
      db.activityLog.findMany({ where: { tenantId: tenant.id }, orderBy: { createdAt: "desc" }, take: 12 }),
    ]);

    return NextResponse.json({ tenant, editions, peopleCount, recentActivity });
  } catch (e) {
    console.error("GET /api/bootstrap", e);
    return NextResponse.json({ error: "Başlangıç verisi alınamadı" }, { status: 500 });
  }
}
