// Personel — P21.1 kayıt→ödeme→giriş hunisi: aşama sayım/oran + kategori ve
// gönderim-günü kırılımı. Ödeme aşaması = PAID sipariş satırı bağlı katılım;
// giriş aşaması = CHECKED_IN ya da izinli ENTRY taraması.
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { resolveEditionContext, GuardError } from "@/lib/api/tenant-guard";
import { requireStaff } from "@/lib/auth/request-context";
import { enforceRateLimit } from "@/lib/rate-limit";
import { buildFunnel, utcDay, type FunnelRow } from "@/lib/analytics/aggregations";

const MAX_PARTS = 20000;

function guardJson(e: unknown) {
  if (e instanceof GuardError) return NextResponse.json({ error: e.message }, { status: e.status });
  return null;
}

export async function GET(req: NextRequest) {
  const staffGate = await requireStaff();
  if (staffGate) return staffGate;
  try {
    const denied = enforceRateLimit(req, { key: "analytics-funnel", limit: 30, windowMs: 60_000 });
    if (denied) return denied;
    const ctx = await resolveEditionContext(req.nextUrl.searchParams.get("editionId"), { required: true });
    const eid = ctx.editionId as string;

    const [parts, paidLines] = await Promise.all([
      db.eventParticipation.findMany({
        where: { editionId: eid },
        select: {
          id: true,
          attendance: true,
          registrations: {
            select: { status: true, submittedAt: true, category: { select: { code: true } } },
            orderBy: { createdAt: "asc" },
          },
          scanEvents: { where: { action: "ENTRY", result: "ALLOWED" }, select: { id: true }, take: 1 },
        },
        orderBy: { createdAt: "asc" },
        take: MAX_PARTS,
      }),
      db.orderLine.findMany({
        where: { participationId: { not: null }, order: { editionId: eid, status: "PAID" } },
        select: { participationId: true },
      }),
    ]);
    const paidSet = new Set(paidLines.map((l) => l.participationId as string));

    const rows: FunnelRow[] = parts.map((p) => {
      const regs = p.registrations;
      const first = regs[0];
      const submittedAt = regs.map((r) => r.submittedAt).find((d): d is Date => !!d) ?? null;
      return {
        participationId: p.id,
        categoryCode: first?.category?.code ?? null,
        submittedDay: utcDay(submittedAt),
        submitted: regs.some((r) => r.status !== "DRAFT"),
        confirmed: regs.some((r) => r.status === "CONFIRMED"),
        paid: paidSet.has(p.id),
        checkedIn: p.attendance === "CHECKED_IN" || p.scanEvents.length > 0,
      };
    });

    return NextResponse.json({
      editionId: eid,
      truncated: parts.length >= MAX_PARTS,
      ...buildFunnel(rows),
    });
  } catch (e) {
    const ge = guardJson(e);
    if (ge) return ge;
    console.error("analytics/funnel error:", e);
    return NextResponse.json({ error: "Huni alınamadı" }, { status: 500 });
  }
}
