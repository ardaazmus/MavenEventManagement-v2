// ─── TASK-B 22: Kullanım raporu — REPORT-BEFORE-ENFORCE (rapor ÖNCE, engelleme YOK) ──
// İlke: kullanım ActivityLog'dan HESAPLANIR (ayrı sayaç tablosu yok); bu uç YALNIZ RAPOR
// verir — ASLA bloke etmez. Soft-block YALNIZ ileride ayrı kapıda olabilecek bir politika
// adımıdır: softBlocked=false SABİT döner (aşağıda da belirtildi) — bugün hiçbir akış
// bu uca dayanarak durdurulmaz. Kotalar bilgilendirme amaçlıdır.
// Performans: ActivityLog → Prisma groupBy (fetch-all YOK); medya → aggregate _sum.
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { resolveContext, GuardError } from "@/lib/api/tenant-guard";
import { requireAdmin } from "@/lib/auth/request-context";

const WINDOW_DAYS = 30;
const KB = 1024; // sizeKb → bayt

export async function GET(_req: NextRequest) {
  // N-08 rol kapısı — envanter iddiasıyla uyum (auth-off'ta null, davranış korunur).
  const adminGate = await requireAdmin();
  if (adminGate) return adminGate;
  try {
    const tenantId = await resolveContext(null);
    const since = new Date(Date.now() - WINDOW_DAYS * 86_400_000);

    // Kiracı kapsamı: doğrudan tenantId'si bu kiracı olan YA DA edisyonu bu kiracıya ait satırlar
    const scope = { OR: [{ tenantId }, { edition: { tenantId } }] };

    const [byType, total30d, totalAllTime, editionCount, personCount, mediaAgg, subscription] = await Promise.all([
      db.activityLog.groupBy({
        by: ["type"],
        _count: { _all: true },
        where: { ...scope, createdAt: { gte: since } },
        orderBy: { _count: { type: "desc" } },
      }),
      db.activityLog.count({ where: { ...scope, createdAt: { gte: since } } }),
      db.activityLog.count({ where: scope }),
      db.eventEdition.count({ where: { tenantId } }),
      db.person.count({ where: { tenantId } }),
      db.mediaAsset.aggregate({ _sum: { sizeKb: true }, where: { edition: { tenantId } } }),
      db.tenantSubscription.findUnique({
        where: { tenantId },
        select: { plan: true, status: true, trialQuotaBytes: true },
      }),
    ]);

    return NextResponse.json({
      enforcement: "REPORT_ONLY", // sözleşme: bu uç raporlar, engellemez
      softBlocked: false,         // soft-block yalnız-ilke: bugün hiçbir akış buradan durdurulmaz
      windowDays: WINDOW_DAYS,
      activityByType: byType.map((g) => ({ type: g.type, count: g._count._all })),
      activityTotal30d: total30d,
      activityTotalAllTime: totalAllTime,
      editionCount,
      personCount,
      mediaBytesUsed: (mediaAgg._sum.sizeKb ?? 0) * KB,
      subscription, // yoksa null — trialQuotaBytes yalnız bilgilendirme (512 MB varsayılan)
    });
  } catch (err) {
    if (err instanceof GuardError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: "Kullanım raporu alınamadı" }, { status: 500 });
  }
}
