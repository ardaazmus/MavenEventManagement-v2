// Personel — P21.3 segment + RFM + gelir: kategori/fon/rol dağılımı,
// yeni/geri-dönen ayrımı, kişi RFM katmanları, özellik vektörü ve net gelir
// (başarılı ödemeler − işlenmiş iadeler).
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { resolveEditionContext, GuardError } from "@/lib/api/tenant-guard";
import { requireStaff } from "@/lib/auth/request-context";
import { enforceRateLimit } from "@/lib/rate-limit";
import { buildSegments, scoreRfm, type SegmentRow, type RfmRow } from "@/lib/analytics/aggregations";
import { buildPersonFeatures, type PersonFeatures } from "@/lib/analytics/features";

const MAX_PARTS = 20000;
const MAX_PEOPLE = 2000;
const DAY_MS = 86_400_000;

function guardJson(e: unknown) {
  if (e instanceof GuardError) return NextResponse.json({ error: e.message }, { status: e.status });
  return null;
}

export async function GET(req: NextRequest) {
  const staffGate = await requireStaff();
  if (staffGate) return staffGate;
  try {
    const denied = enforceRateLimit(req, { key: "analytics-segments", limit: 30, windowMs: 60_000 });
    if (denied) return denied;
    const ctx = await resolveEditionContext(req.nextUrl.searchParams.get("editionId"), { required: true });
    const eid = ctx.editionId as string;
    const nowMs = Date.now();

    const [edition, parts, payments, tenantParts, leads, meetings, paidAgg, refundAgg] = await Promise.all([
      db.eventEdition.findUnique({ where: { id: eid }, select: { startDate: true, tenantId: true } }),
      db.eventParticipation.findMany({
        where: { editionId: eid },
        select: {
          id: true,
          personId: true,
          roleAssignments: { select: { role: true } },
          registrations: {
            select: { fundingSource: true, submittedAt: true, category: { select: { code: true } } },
            orderBy: { createdAt: "asc" },
            take: 1,
          },
        },
        orderBy: { createdAt: "asc" },
        take: MAX_PARTS,
      }),
      db.payment.findMany({
        where: { order: { editionId: eid }, status: "SUCCEEDED" },
        select: {
          amount: true, paidAt: true, createdAt: true,
          order: { select: { lines: { select: { participationId: true } } } },
        },
      }),
      db.eventParticipation.findMany({
        where: { edition: { tenantId: ctx.tenantId } },
        select: { personId: true, editionId: true, createdAt: true },
        take: 100000,
      }),
      db.leadCapture.groupBy({ by: ["personId"], where: { editionId: eid }, _count: { _all: true } }),
      db.meetingRequest.groupBy({ by: ["requesterPersonId"], where: { editionId: eid }, _count: { _all: true } }),
      db.payment.aggregate({ where: { order: { editionId: eid }, status: "SUCCEEDED" }, _sum: { amount: true } }),
      db.refund.aggregate({ where: { order: { editionId: eid }, status: "PROCESSED" }, _sum: { amount: true } }),
    ]);

    const partPerson = new Map(parts.map((p) => [p.id, p.personId]));
    // kişi → kiracı katılım geçmişi (geri-dönen + ilk görülme)
    const history = new Map<string, { editions: Set<string>; firstMs: number }>();
    for (const t of tenantParts) {
      const h = history.get(t.personId) ?? { editions: new Set<string>(), firstMs: Number.MAX_SAFE_INTEGER };
      h.editions.add(t.editionId);
      h.firstMs = Math.min(h.firstMs, t.createdAt.getTime());
      history.set(t.personId, h);
    }
    // kişi → ödeme özeti (satır aidiyetli)
    const pay = new Map<string, { count: number; total: number; lastMs: number | null }>();
    for (const pmt of payments) {
      const pids = new Set(
        (pmt.order.lines.map((l) => l.participationId).filter(Boolean) as string[])
          .map((pid) => partPerson.get(pid))
          .filter((x): x is string => !!x),
      );
      if (pids.size === 0) continue;
      const share = Math.floor(pmt.amount / pids.size);
      const at = (pmt.paidAt ?? pmt.createdAt).getTime();
      for (const pid of pids) {
        const e = pay.get(pid) ?? { count: 0, total: 0, lastMs: null as number | null };
        e.count += 1;
        e.total += share;
        e.lastMs = e.lastMs === null ? at : Math.max(e.lastMs, at);
        pay.set(pid, e);
      }
    }
    const leadCount = new Map(leads.map((l) => [l.personId, l._count._all]));
    const meetingCount = new Map(meetings.map((m) => [m.requesterPersonId, m._count._all]));

    const editionStartMs = edition?.startDate?.getTime() ?? null;
    const segRows: SegmentRow[] = [];
    const rfmRows: RfmRow[] = [];
    const features: PersonFeatures[] = [];
    const seenPerson = new Set<string>();
    for (const p of parts) {
      const reg = p.registrations[0];
      const roles = p.roleAssignments.map((r) => r.role);
      const h = history.get(p.personId);
      const returning = !!h && (h.editions.size > 1 || ([...h.editions][0] !== eid));
      segRows.push({
        categoryCode: reg?.category?.code ?? null,
        fundingSource: reg?.fundingSource ?? null,
        roles,
        returning,
      });
      if (seenPerson.has(p.personId)) continue;
      seenPerson.add(p.personId);
      if (rfmRows.length >= MAX_PEOPLE) continue;
      const pe = pay.get(p.personId) ?? { count: 0, total: 0, lastMs: null };
      rfmRows.push({ personId: p.personId, lastPaidAtMs: pe.lastMs, paidCount: pe.count, paidTotal: pe.total });
      features.push(buildPersonFeatures({
        personId: p.personId,
        editionCount: h?.editions.size ?? 1,
        daysSinceFirstSeen: h ? Math.max(0, Math.floor((nowMs - h.firstMs) / DAY_MS)) : 0,
        paidTotal: pe.total,
        paidCount: pe.count,
        daysSinceLastPaid: pe.lastMs === null ? null : Math.max(0, Math.floor((nowMs - pe.lastMs) / DAY_MS)),
        leadCount: leadCount.get(p.personId) ?? 0,
        meetingCount: meetingCount.get(p.personId) ?? 0,
        isStaff: roles.includes("STAFF") || roles.includes("EXHIBITOR_STAFF"),
        isSpeaker: roles.includes("SPEAKER"),
        isVip: roles.includes("VIP"),
        daysToEventAtSubmit:
          editionStartMs !== null && reg?.submittedAt
            ? Math.round((editionStartMs - reg.submittedAt.getTime()) / DAY_MS)
            : null,
      }));
    }

    const paid = paidAgg._sum.amount ?? 0;
    const refunded = refundAgg._sum.amount ?? 0;
    return NextResponse.json({
      editionId: eid,
      truncated: parts.length >= MAX_PARTS,
      segments: buildSegments(segRows),
      rfm: scoreRfm(rfmRows, nowMs),
      features,
      revenue: { paid, refunded, net: paid - refunded, currency: "TRY" },
    });
  } catch (e) {
    const ge = guardJson(e);
    if (ge) return ge;
    console.error("analytics/segments error:", e);
    return NextResponse.json({ error: "Segment alınamadı" }, { status: 500 });
  }
}
