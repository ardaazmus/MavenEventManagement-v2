// Admin — §5.6 Canlı Portal İstatistikleri (Event Analytics)
// Tekil oturum (GUEST/AUTH), günlük ziyaret, widget tıklama, PWA kurulum,
// form/quiz katılımı, B2B tamamlama oranı ve Q&A sayımı — raporlama tabanı.
// Yetki: requireAdmin + resolveEditionContext; yanıt PII içermez (yalnız sayım).
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { resolveEditionContext, GuardError } from "@/lib/api/tenant-guard";
import { enforceRateLimit } from "@/lib/rate-limit";
import { requireAdmin } from "@/lib/auth/request-context";

function guardJson(e: unknown) {
  if (e instanceof GuardError) return NextResponse.json({ error: e.message }, { status: e.status });
  return null;
}

export async function GET(req: NextRequest) {
  const gate = await requireAdmin();
  if (gate) return gate;
  try {
    const denied = enforceRateLimit(req, { key: "portal-analytics", limit: 30, windowMs: 60_000 });
    if (denied) return denied;
    const editionId = req.nextUrl.searchParams.get("editionId");
    const ctx = await resolveEditionContext(editionId, { required: true });
    const eid = ctx.editionId as string;

    const [sessions, logs, clicks, publicForms, assignments, questions, announcements] = await Promise.all([
      db.portalSession.groupBy({ by: ["kind"], where: { editionId: eid }, _count: { _all: true } }),
      db.portalAnalyticsLog.findMany({
        where: { editionId: eid, kind: { in: ["VISIT", "PWA_INSTALL", "FORM_OPEN", "QA_SUBMIT", "B2B_ACTION"] } },
        select: { kind: true, createdAt: true },
      }),
      db.portalAnalyticsLog.groupBy({
        by: ["widgetKey"],
        where: { editionId: eid, kind: "WIDGET_CLICK" },
        _count: { _all: true },
      }),
      db.formDefinition.findMany({
        where: { editionId: eid, isPublic: true },
        select: { id: true, name: true, _count: { select: { submissions: true } } },
      }),
      db.b2bAssignment.findMany({
        where: { plan: { editionId: eid } },
        select: { status: true },
      }),
      db.portalQuestion.groupBy({ by: ["status"], where: { editionId: eid }, _count: { _all: true } }),
      db.portalAnnouncement.count({ where: { editionId: eid } }),
    ]);

    // günlük ziyaret eğrisi — son 14 gün
    const byDay = new Map<string, number>();
    const now = new Date();
    for (let i = 13; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      byDay.set(d.toISOString().slice(0, 10), 0);
    }
    for (const l of logs) {
      if (l.kind !== "VISIT") continue;
      const key = l.createdAt.toISOString().slice(0, 10);
      if (byDay.has(key)) byDay.set(key, (byDay.get(key) ?? 0) + 1);
    }

    const kindCount = (k: string) => logs.filter((l) => l.kind === k).length;
    const sessionByKind = (k: string) => sessions.find((s) => s.kind === k)?._count._all ?? 0;

    const b2bTotal = assignments.length;
    const b2bCompleted = assignments.filter((a) => a.status === "COMPLETED").length;
    const b2bAccepted = assignments.filter((a) => a.status === "ACCEPTED" || a.status === "COMPLETED").length;
    const b2bDeclined = assignments.filter((a) => a.status === "DECLINED").length;

    return NextResponse.json({
      uniqueVisitors: {
        guest: sessionByKind("GUEST"),
        auth: sessionByKind("AUTH"),
        total: sessionByKind("GUEST") + sessionByKind("AUTH"),
      },
      visits: { total: kindCount("VISIT"), byDay: [...byDay.entries()].map(([day, count]) => ({ day, count })) },
      widgetClicks: clicks
        .filter((c) => c.widgetKey)
        .map((c) => ({ widgetKey: c.widgetKey as string, count: c._count._all }))
        .sort((a, b) => b.count - a.count),
      installs: kindCount("PWA_INSTALL"),
      formEngagement: {
        opens: kindCount("FORM_OPEN"),
        submissions: publicForms.reduce((s, f) => s + f._count.submissions, 0),
        forms: publicForms.map((f) => ({ id: f.id, name: f.name, submissions: f._count.submissions })),
      },
      b2b: {
        total: b2bTotal,
        accepted: b2bAccepted,
        declined: b2bDeclined,
        completed: b2bCompleted,
        completionRate: b2bTotal > 0 ? Math.round((b2bCompleted / b2bTotal) * 100) : 0,
      },
      questions: {
        pending: questions.find((q) => q.status === "PENDING")?._count._all ?? 0,
        answered: questions.find((q) => q.status === "ANSWERED")?._count._all ?? 0,
        hidden: questions.find((q) => q.status === "HIDDEN")?._count._all ?? 0,
        total: questions.reduce((s, q) => s + q._count._all, 0),
      },
      announcements,
    });
  } catch (e) {
    const ge = guardJson(e);
    if (ge) return ge;
    console.error("portal/analytics GET:", e);
    return NextResponse.json({ error: "Analitik verisi alınamadı" }, { status: 500 });
  }
}
