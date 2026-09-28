// Personel — P21.3 portföy analitiği: izinli edisyonların kayıt/giriş/gelir
// özeti + açık kur girdisiyle baz para birimine çevrim. Kurlar çağrıda verilir
// (rates=USD:32.5,EUR:35.1 + fxDate + fxSource); eksik kurda 400 — sessiz
// varsayılan kur YOK. Yalnız bağlam kiracısının edisyonları dahildir.
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { resolveContext, GuardError } from "@/lib/api/tenant-guard";
import { requireStaff } from "@/lib/auth/request-context";
import { enforceRateLimit } from "@/lib/rate-limit";
import { convertRevenue } from "@/lib/analytics/aggregations";

function guardJson(e: unknown) {
  if (e instanceof GuardError) return NextResponse.json({ error: e.message }, { status: e.status });
  return null;
}

function parseRates(raw: string | null): { rates: Record<string, number>; error: string | null } {
  const rates: Record<string, number> = {};
  if (!raw || !raw.trim()) return { rates, error: null };
  for (const part of raw.split(",")) {
    const [code, val] = part.split(":").map((s) => s.trim());
    const num = Number(val);
    if (!code || !Number.isFinite(num) || num <= 0) {
      return { rates: {}, error: `Geçersiz kur girdisi: ${part.trim()} (biçim CUR:oran)` };
    }
    rates[code.toUpperCase()] = num;
  }
  return { rates, error: null };
}

export async function GET(req: NextRequest) {
  const staffGate = await requireStaff();
  if (staffGate) return staffGate;
  try {
    const denied = enforceRateLimit(req, { key: "analytics-portfolio", limit: 30, windowMs: 60_000 });
    if (denied) return denied;
    const sp = req.nextUrl.searchParams;
    const tenantId = await resolveContext(sp.get("tenantId"));
    const base = (sp.get("base") ?? "TRY").trim().toUpperCase() || "TRY";
    const fxDate = sp.get("fxDate");
    const fxSource = sp.get("fxSource");
    const onlyIds = (sp.get("editions") ?? "").split(",").map((s) => s.trim()).filter(Boolean);

    const { rates, error: rateError } = parseRates(sp.get("rates"));
    if (rateError) return NextResponse.json({ error: rateError }, { status: 400 });

    const editions = await db.eventEdition.findMany({
      where: { tenantId, ...(onlyIds.length > 0 ? { id: { in: onlyIds } } : {}) },
      select: { id: true, name: true, status: true, startDate: true, endDate: true },
      orderBy: { startDate: "desc" },
      take: 100,
    });
    if (onlyIds.length > 0 && editions.length !== new Set(onlyIds).size) {
      return NextResponse.json({ error: "Bazı edisyonlar bulunamadı ya da bu kiracıya ait değil" }, { status: 404 });
    }

    const items: Array<{
      editionId: string; name: string; status: string; startDate: Date | null; endDate: Date | null;
      participations: number; checkedIn: number; registrations: number;
      revenue: { paid: Array<{ currency: string; amount: number }>; refunded: Array<{ currency: string; amount: number }> };
    }> = [];
    const totalsByCurrency = new Map<string, { paid: number; refunded: number }>();
    for (const ed of editions) {
      const [paidRows, refundRows, partCount, checkedCount, regCount] = await Promise.all([
        db.payment.groupBy({
          by: ["currency"],
          where: { order: { editionId: ed.id }, status: "SUCCEEDED" },
          _sum: { amount: true },
        }),
        db.refund.groupBy({
          by: ["currency"],
          where: { order: { editionId: ed.id }, status: "PROCESSED" },
          _sum: { amount: true },
        }),
        db.eventParticipation.count({ where: { editionId: ed.id } }),
        db.eventParticipation.count({ where: { editionId: ed.id, attendance: "CHECKED_IN" } }),
        db.registration.count({ where: { editionId: ed.id, status: { not: "DRAFT" } } }),
      ]);
      const paid = paidRows.map((r) => ({ currency: r.currency, amount: r._sum.amount ?? 0 }));
      const refunded = refundRows.map((r) => ({ currency: r.currency, amount: r._sum.amount ?? 0 }));
      for (const p of paid) {
        const e = totalsByCurrency.get(p.currency) ?? { paid: 0, refunded: 0 };
        e.paid += p.amount;
        totalsByCurrency.set(p.currency, e);
      }
      for (const r of refunded) {
        const e = totalsByCurrency.get(r.currency) ?? { paid: 0, refunded: 0 };
        e.refunded += r.amount;
        totalsByCurrency.set(r.currency, e);
      }
      items.push({
        editionId: ed.id, name: ed.name, status: ed.status,
        startDate: ed.startDate, endDate: ed.endDate,
        participations: partCount, checkedIn: checkedCount, registrations: regCount,
        revenue: { paid, refunded },
      });
    }

    // çevrim: eksik kurda 400 (yanıt yine de ham toplamları taşır)
    const paidAmounts = [...totalsByCurrency.entries()].map(([currency, t]) => ({ currency, amount: t.paid }));
    const refundAmounts = [...totalsByCurrency.entries()].map(([currency, t]) => ({ currency, amount: t.refunded }));
    const paidConv = convertRevenue(paidAmounts, rates, base);
    const refundConv = convertRevenue(refundAmounts, rates, base);
    const missing = [...new Set([...paidConv.missing, ...refundConv.missing])];
    if (missing.length > 0) {
      return NextResponse.json(
        {
          error: `Eksik kur: ${missing.join(", ")} (rates ile verin)`,
          missing,
          editions: items,
          totalsByCurrency: [...totalsByCurrency.entries()].map(([currency, t]) => ({ currency, ...t })),
        },
        { status: 400 },
      );
    }
    return NextResponse.json({
      base,
      fx: { date: fxDate, source: fxSource, rates },
      editions: items,
      totalsByCurrency: [...totalsByCurrency.entries()].map(([currency, t]) => ({ currency, ...t })),
      totalsConverted: {
        paid: paidConv.converted,
        refunded: refundConv.converted,
        net: Math.round((paidConv.converted - refundConv.converted) * 100) / 100,
      },
    });
  } catch (e) {
    const ge = guardJson(e);
    if (ge) return ge;
    console.error("analytics/portfolio error:", e);
    return NextResponse.json({ error: "Portföy alınamadı" }, { status: 500 });
  }
}
