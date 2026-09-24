// /api/dashboard — 08 dosyasındaki KPI sözleşmelerine göre agregasyon
// Her kart: iş tanımı + payda + son güncelleme; drilldown için filtre listesi anahtarı taşır.
// G0-b: aggregate uç bağlamı ÇÖZER — editionId verilmişse edisyon kiracıya doğrulanır
// (bogus/yabancı edisyon → 404; önceden 200-empty döndürürdü), portföy görünümü sunucu bağlamıyla sınırlı.
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { resolveEditionContext, GuardError } from "@/lib/api/tenant-guard";

export async function GET(req: NextRequest) {
  try {
    const editionId = req.nextUrl.searchParams.get("editionId");

    // G0-b: edisyon verildiyse bağlam edisyondan doğrulanır; verilmediyse sunucu bağlamı
    const { tenantId: ctx } = await resolveEditionContext(editionId);
    const tenant = { id: ctx };

    // ── Portföy görünümü ──
    const [editionCount, activeEditions, publishedCount, personCount, orgCount, taskOpen] = await Promise.all([
      db.eventEdition.count({ where: { tenantId: tenant.id } }),
      db.eventEdition.count({ where: { tenantId: tenant.id, status: { in: ["REGISTRATION", "SALES", "LOGISTICS", "PRE_EVENT", "ONSITE"] } } }),
      db.eventEdition.count({ where: { tenantId: tenant.id, isPublished: true } }),
      db.person.count({ where: { tenantId: tenant.id } }),
      db.organization.count({ where: { tenantId: tenant.id } }),
      db.task.count({ where: { status: { notIn: ["DONE"] }, OR: [{ edition: { tenantId: tenant.id } }, { editionId: null }] } }),
    ]);

    if (!editionId) {
      // Portföy seviyesi özet — yalnız bağlam kiracısının edisyonları
      const editions = await db.eventEdition.findMany({
        where: { tenantId: tenant.id },
        include: {
          series: true,
          _count: { select: { participations: true, registrations: true, sponsorAgreements: true, sessions: true, tasks: true } },
        },
        orderBy: { startDate: "desc" },
        take: 12,
      });

      // portföy finansal toplamları
      const tenantEditionIds = (await db.eventEdition.findMany({ where: { tenantId: tenant.id }, select: { id: true } })).map((e) => e.id);
      const orders = await db.order.findMany({ where: { editionId: { in: tenantEditionIds } }, include: { payments: true, refunds: true } });
      let portfolioNet = 0;
      for (const o of orders) {
        const paid = (o.payments ?? []).filter((p: { status: string }) => p.status === "SUCCEEDED").reduce((s: number, p: { amount: number }) => s + p.amount, 0);
        const refunded = (o.refunds ?? []).filter((r: { status: string }) => r.status === "PROCESSED").reduce((s: number, r: { amount: number }) => s + r.amount, 0);
        portfolioNet += paid - refunded;
      }

      const recentActivity = await db.activityLog.findMany({
        where: { OR: [{ tenantId: tenant.id }, { edition: { tenantId: tenant.id } }, { AND: [{ tenantId: null }, { editionId: null }] }] },
        orderBy: { createdAt: "desc" },
        take: 15,
      });
      const upcomingTasks = await db.task.findMany({
        where: { status: { notIn: ["DONE"] }, OR: [{ edition: { tenantId: tenant.id } }, { editionId: null }] },
        include: { edition: { select: { name: true } }, assignee: true },
        orderBy: { dueDate: "asc" },
        take: 8,
      });

      return NextResponse.json({
        scope: "PORTFOLIO",
        portfolio: { editionCount, activeEditions, publishedCount, personCount, orgCount, taskOpen, portfolioNet },
        editions,
        recentActivity,
        upcomingTasks,
      });
    }

    // ── Edisyon görünümü (dashboard(2) + dashboard(1)(2)) ──
    // P2: fetch-all-sum-in-JS yerine aggregate/groupBy/_count — KPI'lar bayt-birebir aynı
    // (kanıt: /tmp/dash-before.json diff, yalnız lastUpdated atlandı). Ağır include'lar
    // (payments/refunds/lines/person dizileri) skaler select + groupBy haritalarıyla değiştirildi.
    const edition = await db.eventEdition.findUnique({
      where: { id: editionId },
      include: { series: true, capabilities: true },
    });
    if (!edition) return NextResponse.json({ error: "Etkinlik bulunamadı" }, { status: 404 });

    const [regByStatusRows, regBySourceRows, applications, confirmed, decided, uniquePersonRows, noShow, categories, scanCount, rescanCount, deniedCount, validEntryRows, orderRows, paidByOrder, refundByOrder, linesByOrder, pendingManualByOrder, sponsorshipAgg, deliverablePending, entitlementSums, sciByStatusRows, acceptedNoSession, reviewOverdue, sessionRows, publishedSessions, sessionsByTypeRows, editionTaskOpen, invByStatusRows, curveRows, activeSessions, reservationRows, agreementCountAll] = await Promise.all([
      db.registration.groupBy({ by: ["status"], where: { editionId }, _count: { _all: true } }),
      db.registration.groupBy({ by: ["source"], where: { editionId }, _count: { _all: true } }),
      db.registration.count({ where: { editionId, status: { not: "DRAFT" } } }),
      db.registration.count({ where: { editionId, status: "CONFIRMED" } }),
      db.registration.count({ where: { editionId, status: { in: ["CONFIRMED", "REJECTED", "CANCELLED"] } } }),
      db.eventParticipation.groupBy({ by: ["personId"], where: { editionId } }),
      db.eventParticipation.count({ where: { editionId, attendance: "NO_SHOW" } }),
      db.registrationCategory.findMany({ where: { editionId }, include: { _count: { select: { registrations: true } } } }),
      db.scanEvent.count({ where: { participation: { editionId } } }),
      db.scanEvent.count({ where: { participation: { editionId }, result: "RESCAN_WARNING" } }),
      db.scanEvent.count({ where: { participation: { editionId }, result: "DENIED" } }),
      db.scanEvent.groupBy({ by: ["participationId"], where: { participation: { editionId }, action: "ENTRY", result: "ALLOWED" } }),
      db.order.findMany({ where: { editionId }, select: { id: true, totalAmount: true }, orderBy: { createdAt: "asc" } }),
      db.payment.groupBy({ by: ["orderId"], where: { order: { editionId }, status: "SUCCEEDED" }, _sum: { amount: true } }),
      db.refund.groupBy({ by: ["orderId"], where: { order: { editionId }, status: "PROCESSED" }, _sum: { amount: true } }),
      db.orderLine.groupBy({ by: ["orderId"], where: { order: { editionId } }, _sum: { total: true } }),
      db.payment.groupBy({ by: ["orderId"], where: { order: { editionId }, source: "MANUAL_EXTERNAL", status: "PENDING" }, _count: { _all: true } }),
      db.sponsorAgreement.aggregate({ where: { editionId, status: { in: ["CONTRACTED", "ACTIVE", "COMPLETED"] } }, _sum: { amount: true }, _count: { _all: true } }),
      db.deliverable.count({ where: { agreement: { editionId }, status: { notIn: ["APPROVED", "COMPLETED"] } } }),
      db.entitlement.aggregate({ where: { editionId, ownerOrganizationId: { not: null } }, _sum: { quantityGranted: true, quantityConsumed: true, quantityReserved: true } }),
      db.submission.groupBy({ by: ["status"], where: { editionId }, _count: { _all: true } }),
      db.submission.count({ where: { editionId, status: "ACCEPTED" } }),
      db.reviewAssignment.count({ where: { submission: { editionId }, status: { in: ["ASSIGNED", "IN_PROGRESS"] }, dueDate: { lt: new Date() } } }),
      db.programSession.findMany({ where: { editionId }, select: { id: true, roomId: true, startTime: true, endTime: true, status: true, title: true, type: true } }),
      db.programSession.count({ where: { editionId, status: "PUBLISHED" } }),
      db.programSession.groupBy({ by: ["type"], where: { editionId }, _count: { _all: true } }),
      db.task.count({ where: { editionId, status: { not: "DONE" } } }),
      db.invitation.groupBy({ by: ["status"], where: { editionId }, _count: { _all: true } }),
      db.registration.findMany({ where: { editionId, submittedAt: { not: null } }, select: { submittedAt: true } }),
      db.programSession.findMany({ where: { editionId, roomId: { not: null }, status: { not: "CANCELLED" } }, select: { startTime: true, endTime: true, title: true, roomId: true, status: true } }),
      db.reservation.findMany({ where: { editionId }, select: { checkIn: true, checkOut: true, status: true } }),
      db.sponsorAgreement.count({ where: { editionId } }), // readinessCheck TÜM sözleşmeleri sayar (durum filtresi yok — orijinal anlamsal)
    ]);

    const toCountMap = <T extends { _count: { _all: number } }>(rows: T[], key: keyof T): Record<string, number> => {
      const m: Record<string, number> = {};
      for (const r of rows) m[String(r[key])] = r._count._all;
      return m;
    };
    const regByStatus: Record<string, number> = toCountMap(regByStatusRows, "status");
    const bySource: Record<string, number> = toCountMap(regBySourceRows, "source");
    const sciByStatus: Record<string, number> = toCountMap(sciByStatusRows, "status");
    const invByStatus: Record<string, number> = toCountMap(invByStatusRows, "status");
    const sessionsByType: Record<string, number> = toCountMap(sessionsByTypeRows, "type");

    // ── Kayıt ve katılım kartları (08) ──
    const submitted = applications; // onay dışı taslaklar hariç gönderim
    const pendingPayment = confirmed; // onaylı — ödeme bekleyen ayrı etiket
    const uniquePersons = uniquePersonRows.length;
    const approvalRate = decided > 0 ? Math.round((regByStatus.CONFIRMED ?? 0) / decided * 100) : null;

    // kategori doluluğu: onaylı yer / satılabilir kapasite (kategori listesi Promise.all'dan)
    const categoryFill = categories
      .filter((c) => c.capacity && c.capacity > 0)
      .map((c) => ({
        id: c.id, name: c.name,
        fill: c._count.registrations, capacity: c.capacity,
        pct: Math.round((c._count.registrations / (c.capacity ?? 1)) * 100),
      }));

    // sahadaki gelen: geçerli ilk giriş (RESCAN hariç) — benzersiz katılım
    const validEntries = validEntryRows.length;

    // ── Finans kartları (08) — orijinal anlamsal korunur:
    //    linesTotal = Σlines || totalAmount (boş/0 kalem toplamı sipariş tutarına düşer)
    const paidByOrderMap = new Map(paidByOrder.map((r) => [r.orderId, r._sum.amount ?? 0]));
    const refundByOrderMap = new Map(refundByOrder.map((r) => [r.orderId, r._sum.amount ?? 0]));
    const linesByOrderMap = new Map(linesByOrder.map((r) => [r.orderId, r._sum.total ?? 0]));
    const pendingManualMap = new Map(pendingManualByOrder.map((r) => [r.orderId, r._count._all]));
    let ordered = 0, collected = 0, refunded = 0, openBalance = 0, partialCount = 0, pendingManual = 0;
    for (const o of orderRows) {
      const linesTotal = linesByOrderMap.get(o.id) || o.totalAmount;
      const paid = paidByOrderMap.get(o.id) ?? 0;
      const ref = refundByOrderMap.get(o.id) ?? 0;
      ordered += linesTotal; collected += paid; refunded += ref;
      const balance = linesTotal - paid + ref;
      // F6: minor unit — kuruş tamlığı; epsilon yerine tam sayı karşılaştırması
      if (balance > 0) { openBalance += balance; }
      if (paid > 0 && balance > 0) partialCount++;
      pendingManual += pendingManualMap.get(o.id) ?? 0;
    }

    // ── Sponsorluk kartları ──
    const sponsorshipValue = sponsorshipAgg._sum.amount ?? 0;
    const granted = entitlementSums._sum.quantityGranted ?? 0;
    const consumed = entitlementSums._sum.quantityConsumed ?? 0;
    const reservedR = entitlementSums._sum.quantityReserved ?? 0;

    // ── Bilimsel kartları ──
    // kabul edilen ama program bekleyen: orijinal anlamsal = ACCEPTED bildiri sayısı
    const acceptedNoSessionCount = acceptedNoSession;

    // ── Program kartları ──
    // (publishedSessions + sessionsByType yukarıda aggregate olarak alındı)

    // ── Konaklama — rezervasyon skaler listesi (yalnız checkIn/checkOut/status) ──
    const roomNightsSold = reservationRows.filter((r) => ["RESERVED", "CONFIRMED", "CHECKED_IN"].includes(r.status)).reduce((s, r) => s + Math.max(1, Math.round((r.checkOut.getTime() - r.checkIn.getTime()) / 86400000)), 0);

    // ── LCV ── (invByStatus groupBy ile alındı)

    // ── Hazırlık denetimi (dashboard(2) 8/8) — engelleyici/uyarı mantığı ──
    const checks = await readinessCheck(edition, categories, activeSessions, agreementCountAll);

    // ── Günlük kayıt eğrisi (son 14 gün) — submittedAt skaler listesi (select disiplini)
    const curve: { date: string; count: number }[] = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - i);
      const next = new Date(d); next.setDate(d.getDate() + 1);
      curve.push({
        date: d.toISOString().slice(5, 10),
        count: curveRows.filter((r) => r.submittedAt && r.submittedAt >= d && r.submittedAt < next).length,
      });
    }

    // ── Kaynak dağılımı ──
    const bySourceFinal = bySource;

    const recentActivity = await db.activityLog.findMany({ where: { editionId }, orderBy: { createdAt: "desc" }, take: 12 });

    return NextResponse.json({
      scope: "EDITION",
      edition,
      kpi: {
        // kayıt
        applications: submitted,
        confirmed: regByStatus.CONFIRMED ?? 0,
        pendingApproval: regByStatus.PENDING_APPROVAL ?? 0,
        cancelled: regByStatus.CANCELLED ?? 0,
        pendingPayment,
        uniquePersons,
        approvalRate,
        categoryFill,
        arrived: validEntries,
        noShow,
        attendanceRate: confirmed > 0 ? Math.round((validEntries / confirmed) * 100) : null,
        // finans
        ordered, collected, refunded, openBalance, partialCount, pendingManual,
        // sponsor
        sponsorshipValue, granted, consumed, reserved: reservedR, deliverablePending,
        // bilimsel
        sciByStatus, reviewOverdue, acceptedNoSession: acceptedNoSessionCount,
        // program
        sessionCount: sessionRows.length, publishedSessions, sessionsByType,
        // konaklama
        reservationCount: reservationRows.length, roomNightsSold,
        // LCV
        invByStatus,
        // saha
        scanCount: scanCount, rescanCount: rescanCount, deniedCount: deniedCount,
        // görev
        taskOpen: editionTaskOpen,
      },
      curve,
      bySource: bySourceFinal,
      checks,
      recentActivity,
      lastUpdated: new Date().toISOString(),
    });
  } catch (e) {
    if (e instanceof GuardError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("GET /api/dashboard", e);
    return NextResponse.json({ error: "Dashboard verisi alınamadı" }, { status: 500 });
  }
}

// ── Yayın öncesi denetim (05 dosyası: engelleyici/uyarı) ──
// P2: sessions = skaler aktif-oturum listesi (roomId dolu, CANCELLED hariç); agreementCount = sayı
// (sessionsByStatusHelper P2 ile kaldırıldı — sessionsByType groupBy'a geçti)
async function readinessCheck(
  edition: { id: string; startDate: Date | null; endDate: Date | null; isPublished: boolean },
  categories: { id: string; name: string; basePrice: number; paymentInstruction: string | null; capacity: number | null }[],
  sessions: { roomId: string | null; startTime: Date; endTime: Date; status: string; title: string }[],
  agreementCount: number,
) {
  const blockers: { key: string; message: string; severity: "BLOCKER" | "WARNING" }[] = [];
  const warnings: { key: string; message: string; severity: "BLOCKER" | "WARNING" }[] = [];

  if (edition.startDate && edition.endDate && edition.endDate <= edition.startDate) {
    blockers.push({ key: "dates", message: "Bitiş tarihi başlangıçtan sonra olmalı", severity: "BLOCKER" });
  }
  for (const c of categories) {
    if (c.basePrice > 0 && !c.paymentInstruction) {
      blockers.push({ key: `pay-${c.id}`, message: `Ücretli kategori "${c.name}" için ödeme talimatı eksik`, severity: "BLOCKER" });
    }
  }
  // aynı salonda çakışan onaylı oturum
  const byRoom = new Map<string, { title: string; startTime: Date; endTime: Date }[]>();
  for (const s of sessions) {
    if (!s.roomId || s.status === "CANCELLED") continue;
    const arr = byRoom.get(s.roomId) ?? [];
    arr.push({ title: s.title, startTime: s.startTime, endTime: s.endTime });
    byRoom.set(s.roomId, arr);
  }
  for (const [roomId, list] of byRoom) {
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i], b = list[j];
        if (a.startTime < b.endTime && b.startTime < a.endTime) {
          blockers.push({ key: `clash-${roomId}-${i}-${j}`, message: `Aynı salonda çakışan onaylı oturum: "${a.title}" ↔ "${b.title}"`, severity: "BLOCKER" });
        }
      }
    }
  }
  if (categories.length === 0) warnings.push({ key: "no-cat", message: "Kayıt kategorisi tanımlanmadı", severity: "WARNING" });
  if (sessions.length === 0) warnings.push({ key: "no-session", message: "Programda oturum yok", severity: "WARNING" });
  if (agreementCount > 0) warnings.push({ key: "sponsor-ok", message: `${agreementCount} sponsor sözleşmesi bağlı`, severity: "WARNING" });

  const total = blockers.length + warnings.length;
  const done = Math.max(0, 8 - total);
  return { blockers, warnings, score: done, total: 8, pct: Math.round((done / 8) * 100) };
}
