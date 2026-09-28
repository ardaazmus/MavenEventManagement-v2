// Personel — P21.4 düzenleyici kokpiti: KPI topları, veri kapsama, bayatlayan
// işler ve xlsx dışa aktarımı (KPI + huni + segment + kapsama + bayatlayan).
// Kayıt/gelir/giriş/sponsor/lead/görüşme/görev/kapasite tek çağrıda.
import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { db } from "@/lib/db";
import { resolveEditionContext, GuardError } from "@/lib/api/tenant-guard";
import { requireStaff, requestActor } from "@/lib/auth/request-context";
import { enforceRateLimit } from "@/lib/rate-limit";
import { buildFunnel, buildCoverage, utcDay } from "@/lib/analytics/aggregations";
import { logExport } from "@/lib/privacy/export-guard";

const MAX_PARTS = 20000;
const APPROVAL_STALE_MS = 7 * 86_400_000;
const UNPAID_STALE_MS = 14 * 86_400_000;

function guardJson(e: unknown) {
  if (e instanceof GuardError) return NextResponse.json({ error: e.message }, { status: e.status });
  return null;
}

const trDate = (d: Date | null | undefined) =>
  d ? new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Istanbul" }).format(d) : "—";

export async function GET(req: NextRequest) {
  const staffGate = await requireStaff();
  if (staffGate) return staffGate;
  try {
    const denied = enforceRateLimit(req, { key: "analytics-cockpit", limit: 12, windowMs: 60_000 });
    if (denied) return denied;
    const sp = req.nextUrl.searchParams;
    const ctx = await resolveEditionContext(sp.get("editionId"), { required: true });
    const eid = ctx.editionId as string;
    const format = sp.get("format");
    const nowMs = Date.now();

    const [
      edition, regByStatus, paidAgg, refundAgg, parts, paidLines,
      deliverables, leadCount, meetingsByStatus, tasks, categories, staleApprovals, staleUnpaid,
    ] = await Promise.all([
      db.eventEdition.findUnique({ where: { id: eid }, select: { name: true, startDate: true, endDate: true, status: true } }),
      db.registration.groupBy({ by: ["status"], where: { editionId: eid }, _count: { _all: true } }),
      db.payment.aggregate({ where: { order: { editionId: eid }, status: "SUCCEEDED" }, _sum: { amount: true } }),
      db.refund.aggregate({ where: { order: { editionId: eid }, status: "PROCESSED" }, _sum: { amount: true } }),
      db.eventParticipation.findMany({
        where: { editionId: eid },
        select: {
          id: true,
          attendance: true,
          person: { select: { email: true, phone: true, company: true } },
          registrations: {
            select: { status: true, submittedAt: true, category: { select: { code: true } } },
            orderBy: { createdAt: "asc" },
          },
          badgeInstances: { select: { id: true }, take: 1 },
          scanEvents: { where: { action: "ENTRY", result: "ALLOWED" }, select: { id: true }, take: 1 },
        },
        orderBy: { createdAt: "asc" },
        take: MAX_PARTS,
      }),
      db.orderLine.findMany({
        where: { participationId: { not: null }, order: { editionId: eid, status: "PAID" } },
        select: { participationId: true },
      }),
      db.deliverable.findMany({
        where: { agreement: { editionId: eid } },
        select: { status: true, dueDate: true },
      }),
      db.leadCapture.count({ where: { editionId: eid } }),
      db.meetingRequest.groupBy({ by: ["status"], where: { editionId: eid }, _count: { _all: true } }),
      db.task.findMany({
        where: { editionId: eid, status: { notIn: ["DONE"] } },
        select: { id: true, title: true, status: true, priority: true, dueDate: true },
        orderBy: { dueDate: "asc" },
        take: 200,
      }),
      db.registrationCategory.findMany({
        where: { editionId: eid },
        select: {
          code: true, name: true, capacity: true,
          _count: { select: { registrations: true } },
        },
        orderBy: { order: "asc" },
      }),
      db.registration.findMany({
        where: { editionId: eid, status: "PENDING_APPROVAL", submittedAt: { lt: new Date(nowMs - APPROVAL_STALE_MS) } },
        select: { id: true, submittedAt: true },
        take: 50,
      }),
      db.order.findMany({
        where: { editionId: eid, status: { in: ["OPEN", "PARTIALLY_PAID"] }, createdAt: { lt: new Date(nowMs - UNPAID_STALE_MS) } },
        select: { id: true, orderNo: true, totalAmount: true, createdAt: true },
        take: 50,
      }),
    ]);

    const paidSet = new Set(paidLines.map((l) => l.participationId as string));
    const funnel = buildFunnel(parts.map((p) => {
      const regs = p.registrations;
      const submittedAt = regs.map((r) => r.submittedAt).find((d): d is Date => !!d) ?? null;
      return {
        participationId: p.id,
        categoryCode: regs[0]?.category?.code ?? null,
        submittedDay: utcDay(submittedAt),
        submitted: regs.some((r) => r.status !== "DRAFT"),
        confirmed: regs.some((r) => r.status === "CONFIRMED"),
        paid: paidSet.has(p.id),
        checkedIn: p.attendance === "CHECKED_IN" || p.scanEvents.length > 0,
      };
    }));
    const coverage = buildCoverage(parts.map((p) => ({
      hasEmail: !!p.person.email,
      hasPhone: !!p.person.phone,
      hasCompany: !!p.person.company,
      hasCategory: p.registrations.some((r) => !!r.category),
      hasBadge: p.badgeInstances.length > 0,
    })));

    const paid = paidAgg._sum.amount ?? 0;
    const refunded = refundAgg._sum.amount ?? 0;
    const checkedIn = parts.filter((p) => p.attendance === "CHECKED_IN" || p.scanEvents.length > 0).length;
    const TERMINAL = ["APPROVED", "COMPLETED", "REJECTED"];
    const overdueDeliverables = deliverables.filter(
      (d) => d.dueDate && d.dueDate.getTime() < nowMs && !TERMINAL.includes(d.status),
    ).length;
    const overdueTasks = tasks.filter((t) => t.dueDate && t.dueDate.getTime() < nowMs);

    const body = {
      edition: edition ? { id: eid, name: edition.name, status: edition.status, startDate: edition.startDate, endDate: edition.endDate } : null,
      truncated: parts.length >= MAX_PARTS,
      kpis: {
        participations: parts.length,
        registrationsByStatus: Object.fromEntries(regByStatus.map((r) => [r.status, r._count._all])),
        revenue: { paid, refunded, net: paid - refunded, currency: "TRY" },
        checkedIn,
        checkinRate: parts.length > 0 ? Math.round((checkedIn / parts.length) * 10000) / 10000 : null,
        leads: leadCount,
        meetingsByStatus: Object.fromEntries(meetingsByStatus.map((r) => [r.status, r._count._all])),
        deliverables: {
          total: deliverables.length,
          approved: deliverables.filter((d) => d.status === "APPROVED" || d.status === "COMPLETED").length,
          overdue: overdueDeliverables,
        },
        tasks: { open: tasks.length, overdue: overdueTasks.length },
      },
      capacity: categories.map((c) => ({
        code: c.code, name: c.name, capacity: c.capacity,
        registered: c._count.registrations,
        fillRate: c.capacity ? Math.round((c._count.registrations / c.capacity) * 10000) / 10000 : null,
      })),
      funnel,
      coverage,
      decay: {
        staleApprovals: { count: staleApprovals.length, olderThanDays: 7, sample: staleApprovals.slice(0, 10) },
        staleUnpaid: { count: staleUnpaid.length, olderThanDays: 14, sample: staleUnpaid.slice(0, 10) },
        overdueTasks: { count: overdueTasks.length, sample: overdueTasks.slice(0, 10) },
      },
    };

    if (format !== "xlsx") return NextResponse.json(body);

    const wb = XLSX.utils.book_new();
    const kpiRows: Array<[string, string | number]> = [
      ["Etkinlik", edition?.name ?? eid],
      ["Katılım", parts.length],
      ["Gelir (net, kuruş)", paid - refunded],
      ["Giriş", `${checkedIn} (${body.kpis.checkinRate ?? "—"})`],
      ["Lead", leadCount],
      ["Teslim (onaylı/toplam)", `${body.kpis.deliverables.approved}/${body.kpis.deliverables.total}`],
      ["Bayat onay", staleApprovals.length],
      ["Bayat tahsilat", staleUnpaid.length],
      ["Gecikmiş görev", overdueTasks.length],
    ];
    const wsKpi = XLSX.utils.aoa_to_sheet([["Gösterge", "Değer"], ...kpiRows]);
    wsKpi["!cols"] = [{ wch: 24 }, { wch: 30 }];
    XLSX.utils.book_append_sheet(wb, wsKpi, "KPI");
    const wsFunnel = XLSX.utils.aoa_to_sheet([
      ["Aşama", "Sayı", "Oran"],
      ...funnel.stages.map((s) => [s.key, s.count, s.rate ?? "—"] as Array<string | number>),
    ]);
    XLSX.utils.book_append_sheet(wb, wsFunnel, "Huni");
    const wsCov = XLSX.utils.aoa_to_sheet([
      ["Alan", "Dolu", "Oran"],
      ["E-posta", coverage.email, coverage.emailRate ?? "—"],
      ["Telefon", coverage.phone, coverage.phoneRate ?? "—"],
      ["Firma", coverage.company, coverage.companyRate ?? "—"],
      ["Kategori", coverage.categorized, coverage.categorizedRate ?? "—"],
      ["Rozet", coverage.badged, coverage.badgedRate ?? "—"],
    ]);
    XLSX.utils.book_append_sheet(wb, wsCov, "Kapsama");
    const wsDecay = XLSX.utils.aoa_to_sheet([
      ["Tür", "Kayıt", "Tarih"],
      ...staleApprovals.map((r) => ["Bayat onay", r.id, trDate(r.submittedAt)]),
      ...staleUnpaid.map((o) => ["Bayat tahsilat", o.orderNo, trDate(o.createdAt)]),
      ...overdueTasks.map((t) => ["Gecikmiş görev", t.title, trDate(t.dueDate)]),
    ]);
    XLSX.utils.book_append_sheet(wb, wsDecay, "Bayatlayan");

    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
    const stamp = new Date().toISOString().slice(0, 10);
    const actor = await requestActor();
    await logExport(db, {
      tenantId: ctx.tenantId ?? null,
      editionId: eid,
      type: "ANALYTICS",
      count: parts.length,
      actorName: actor?.uid ?? null,
    });
    return new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="kokpit-${stamp}.xlsx"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    const ge = guardJson(e);
    if (ge) return ge;
    console.error("analytics/cockpit error:", e);
    return NextResponse.json({ error: "Kokpit alınamadı" }, { status: 500 });
  }
}
