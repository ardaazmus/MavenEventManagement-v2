// /api/dashboard — 08 dosyasındaki KPI sözleşmelerine göre agregasyon
// Her kart: iş tanımı + payda + son güncelleme; drilldown için filtre listesi anahtarı taşır.
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(req: NextRequest) {
  try {
    const tenant = await db.tenant.findFirst();
    if (!tenant) return NextResponse.json({ error: "Tenant yok" }, { status: 404 });

    const editionId = req.nextUrl.searchParams.get("editionId");

    // ── Portföy görünümü ──
    const [editionCount, activeEditions, publishedCount, personCount, orgCount, taskOpen] = await Promise.all([
      db.eventEdition.count({ where: { tenantId: tenant.id } }),
      db.eventEdition.count({ where: { tenantId: tenant.id, status: { in: ["REGISTRATION", "SALES", "LOGISTICS", "PRE_EVENT", "ONSITE"] } } }),
      db.eventEdition.count({ where: { tenantId: tenant.id, isPublished: true } }),
      db.person.count({ where: { tenantId: tenant.id } }),
      db.organization.count({ where: { tenantId: tenant.id } }),
      db.task.count({ where: { status: { notIn: ["DONE"] }, editionId: editionId ?? undefined } }),
    ]);

    if (!editionId) {
      // Portföy seviyesi özet
      const editions = await db.eventEdition.findMany({
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

      const recentActivity = await db.activityLog.findMany({ orderBy: { createdAt: "desc" }, take: 15 });
      const upcomingTasks = await db.task.findMany({
        where: { status: { notIn: ["DONE"] } },
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
    const edition = await db.eventEdition.findUnique({
      where: { id: editionId },
      include: { series: true, capabilities: true },
    });
    if (!edition) return NextResponse.json({ error: "Etkinlik bulunamadı" }, { status: 404 });

    const [registrations, participations, agreements, sessions, tasks, orders, invitations, submissions, scans, reservations] = await Promise.all([
      db.registration.findMany({ where: { editionId }, include: { category: true, participation: { include: { person: true } } } }),
      db.eventParticipation.findMany({ where: { editionId }, include: { person: true, roleAssignments: true } }),
      db.sponsorAgreement.findMany({ where: { editionId }, include: { organization: true, tier: true, deliverables: true } }),
      db.programSession.findMany({ where: { editionId }, include: { room: true } }),
      db.task.findMany({ where: { editionId }, include: { assignee: true } }),
      db.order.findMany({ where: { editionId }, include: { payments: true, refunds: true, lines: true } }),
      db.invitation.findMany({ where: { editionId } }),
      db.submission.findMany({ where: { editionId }, include: { decisions: true } }),
      db.scanEvent.findMany({ where: { participation: { editionId } }, orderBy: { scannedAt: "desc" } }),
      db.reservation.findMany({ where: { editionId } }),
    ]);

    // ── Kayıt ve katılım kartları (08) ──
    const regByStatus: Record<string, number> = {};
    for (const r of registrations) regByStatus[r.status] = (regByStatus[r.status] ?? 0) + 1;
    const submitted = registrations.filter((r) => r.status !== "DRAFT");
    const confirmed = registrations.filter((r) => r.status === "CONFIRMED");
    const pendingPayment = confirmed.length; // onaylı — ödeme bekleyen ayrı etiket
    const uniquePersons = new Set(participations.map((p) => p.personId)).size;
    const decided = registrations.filter((r) => ["CONFIRMED", "REJECTED", "CANCELLED"].includes(r.status)).length;
    const approvalRate = decided > 0 ? Math.round((regByStatus.CONFIRMED ?? 0) / decided * 100) : null;

    // kategori doluluğu: onaylı yer / satılabilir kapasite
    const categories = await db.registrationCategory.findMany({ where: { editionId }, include: { _count: { select: { registrations: true } } } });
    const categoryFill = categories
      .filter((c) => c.capacity && c.capacity > 0)
      .map((c) => ({
        id: c.id, name: c.name,
        fill: c._count.registrations, capacity: c.capacity,
        pct: Math.round((c._count.registrations / (c.capacity ?? 1)) * 100),
      }));

    // sahadaki gelen: geçerli ilk giriş (RESCAN hariç) — benzersiz katılım
    const validEntries = new Set(scans.filter((s) => s.action === "ENTRY" && s.result === "ALLOWED").map((s) => s.participationId)).size;
    const noShow = participations.filter((p) => p.attendance === "NO_SHOW").length;

    // ── Finans kartları (08) ──
    let ordered = 0, collected = 0, refunded = 0, openBalance = 0, partialCount = 0, pendingManual = 0;
    for (const o of orders) {
      const linesTotal = (o.lines ?? []).reduce((s: number, l: { total: number }) => s + l.total, 0) || o.totalAmount;
      const paid = (o.payments ?? []).filter((p: { status: string }) => p.status === "SUCCEEDED").reduce((s: number, p: { amount: number }) => s + p.amount, 0);
      const ref = (o.refunds ?? []).filter((r: { status: string }) => r.status === "PROCESSED").reduce((s: number, r: { amount: number }) => s + r.amount, 0);
      ordered += linesTotal; collected += paid; refunded += ref;
      const balance = linesTotal - paid + ref;
      if (balance > 0.01) { openBalance += balance; }
      if (paid > 0.01 && balance > 0.01) partialCount++;
      pendingManual += (o.payments ?? []).filter((p: { source: string; status: string }) => p.source === "MANUAL_EXTERNAL" && p.status === "PENDING").length;
    }

    // ── Sponsorluk kartları ──
    const sponsorshipValue = agreements.filter((a) => ["CONTRACTED", "ACTIVE", "COMPLETED"].includes(a.status)).reduce((s, a) => s + a.amount, 0);
    const entitlements = await db.entitlement.findMany({ where: { editionId, ownerOrganizationId: { not: null } }, include: { ownerOrganization: true, claims: true } });
    const granted = entitlements.reduce((s, e) => s + e.quantityGranted, 0);
    const consumed = entitlements.reduce((s, e) => s + e.quantityConsumed, 0);
    const reservedR = entitlements.reduce((s, e) => s + e.quantityReserved, 0);
    const deliverablePending = agreements.flatMap((a) => a.deliverables).filter((d) => !["APPROVED", "COMPLETED"].includes(d.status)).length;

    // ── Bilimsel kartları ──
    const sciByStatus: Record<string, number> = {};
    for (const s of submissions) sciByStatus[s.status] = (sciByStatus[s.status] ?? 0) + 1;
    const reviewOverdue = await db.reviewAssignment.count({ where: { submission: { editionId }, status: { in: ["ASSIGNED", "IN_PROGRESS"] }, dueDate: { lt: new Date() } } });
    // kabul edilen ama program bekleyen: submission ACCEPTED_* ve sessions boş
    const acceptedNoSession = submissions.filter((s) => ["ACCEPTED"].includes(s.status) && (sciByStatus.ACCEPTED ?? 0) >= 0).length;

    // ── Program kartları ──
    const publishedSessions = sessions.filter((s) => s.status === "PUBLISHED").length;
    const sessionsByType: Record<string, number> = {};
    for (const s of sessions) sessionsByStatusHelper(sessionsByType, s.type);

    // ── Konaklama ──
    const roomNightsSold = reservations.filter((r) => ["RESERVED", "CONFIRMED", "CHECKED_IN"].includes(r.status)).reduce((s, r) => s + Math.max(1, Math.round((r.checkOut.getTime() - r.checkIn.getTime()) / 86400000)), 0);

    // ── LCV ──
    const invByStatus: Record<string, number> = {};
    for (const i of invitations) invByStatus[i.status] = (invByStatus[i.status] ?? 0) + 1;

    // ── Hazırlık denetimi (dashboard(2) 8/8) — engelleyici/uyarı mantığı ──
    const checks = await readinessCheck(edition, categories, registrations, sessions, agreements);

    // ── Günlük kayıt eğrisi (son 14 gün) ──
    const curve: { date: string; count: number }[] = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - i);
      const next = new Date(d); next.setDate(d.getDate() + 1);
      curve.push({
        date: d.toISOString().slice(5, 10),
        count: registrations.filter((r) => r.submittedAt && r.submittedAt >= d && r.submittedAt < next).length,
      });
    }

    // ── Kaynak dağılımı ──
    const bySource: Record<string, number> = {};
    for (const r of registrations) bySource[r.source] = (bySource[r.source] ?? 0) + 1;

    const recentActivity = await db.activityLog.findMany({ where: { editionId }, orderBy: { createdAt: "desc" }, take: 12 });

    return NextResponse.json({
      scope: "EDITION",
      edition,
      kpi: {
        // kayıt
        applications: submitted.length,
        confirmed: regByStatus.CONFIRMED ?? 0,
        pendingApproval: regByStatus.PENDING_APPROVAL ?? 0,
        cancelled: regByStatus.CANCELLED ?? 0,
        pendingPayment,
        uniquePersons,
        approvalRate,
        categoryFill,
        arrived: validEntries,
        noShow,
        attendanceRate: confirmed.length > 0 ? Math.round((validEntries / confirmed.length) * 100) : null,
        // finans
        ordered, collected, refunded, openBalance, partialCount, pendingManual,
        // sponsor
        sponsorshipValue, granted, consumed, reserved: reservedR, deliverablePending,
        // bilimsel
        sciByStatus, reviewOverdue, acceptedNoSession,
        // program
        sessionCount: sessions.length, publishedSessions, sessionsByType,
        // konaklama
        reservationCount: reservations.length, roomNightsSold,
        // LCV
        invByStatus,
        // saha
        scanCount: scans.length, rescanCount: scans.filter((s) => s.result === "RESCAN_WARNING").length, deniedCount: scans.filter((s) => s.result === "DENIED").length,
        // görev
        taskOpen: tasks.filter((t) => t.status !== "DONE").length,
      },
      curve,
      bySource,
      checks,
      recentActivity,
      lastUpdated: new Date().toISOString(),
    });
  } catch (e) {
    console.error("GET /api/dashboard", e);
    return NextResponse.json({ error: "Dashboard verisi alınamadı" }, { status: 500 });
  }
}

function sessionsByStatusHelper(target: Record<string, number>, key: string) {
  target[key] = (target[key] ?? 0) + 1;
}

// ── Yayın öncesi denetim (05 dosyası: engelleyici/uyarı) ──
async function readinessCheck(edition: { id: string; startDate: Date | null; endDate: Date | null; isPublished: boolean }, categories: { id: string; name: string; basePrice: number; paymentInstruction: string | null; capacity: number | null }[], registrations: unknown[], sessions: { id: string; roomId: string | null; startTime: Date; endTime: Date; status: string; title: string }[], agreements: unknown[]) {
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
  if (agreements.length > 0) warnings.push({ key: "sponsor-ok", message: `${agreements.length} sponsor sözleşmesi bağlı`, severity: "WARNING" });

  const total = blockers.length + warnings.length;
  const done = Math.max(0, 8 - total);
  return { blockers, warnings, score: done, total: 8, pct: Math.round((done / 8) * 100) };
}
