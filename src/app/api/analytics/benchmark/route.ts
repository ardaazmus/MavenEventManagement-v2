// P21.4: Sponsor benchmark — seviye bazında anonim kıyas. Grup istatistiği
// K eşiğine ulaşmazsa suppressed (kıyas kapalı). Personel tüm grupları,
// sponsor jetonu yalnız KENDİ değeri + kendi seviye grubunu görür
// (rakip kurum kimliği ASLA ifşa edilmez).
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { resolveEditionContext, GuardError } from "@/lib/api/tenant-guard";
import { resolvePublicEdition } from "@/lib/api/public-guard";
import { requireStaff } from "@/lib/auth/request-context";
import { extractToken, validatePortalToken, touchToken } from "@/lib/api/portal-tokens";
import { checkSponsorScope } from "@/lib/portal/sponsor-scope";
import { buildBenchmark, BENCHMARK_DEFAULT_K, BENCHMARK_MIN_K, type BenchmarkMember } from "@/lib/analytics/aggregations";
import { leadLiveWhere } from "@/lib/leads/capture";
import { enforceRateLimit } from "@/lib/rate-limit";

const METRICS = ["leads", "meetings", "profileViews", "favorites"] as const;
type Metric = (typeof METRICS)[number];

function guardJson(e: unknown) {
  if (e instanceof GuardError) return NextResponse.json({ error: e.message }, { status: e.status });
  return null;
}

export async function GET(req: NextRequest) {
  try {
    const denied = enforceRateLimit(req, { key: "analytics-benchmark", limit: 30, windowMs: 60_000 });
    if (denied) return denied;
    const sp = req.nextUrl.searchParams;
    const editionId = sp.get("editionId");
    const metric = sp.get("metric") ?? "leads";
    if (!editionId) return NextResponse.json({ error: "editionId zorunlu" }, { status: 400 });
    if (!(METRICS as readonly string[]).includes(metric)) {
      return NextResponse.json({ error: `metric ${METRICS.join("|")} olmalı` }, { status: 400 });
    }
    const kRaw = Number(sp.get("k") ?? BENCHMARK_DEFAULT_K);
    const k = Number.isFinite(kRaw) ? Math.max(BENCHMARK_MIN_K, Math.floor(kRaw)) : BENCHMARK_DEFAULT_K;

    // kapsam: sponsor jetonu varsa portal yolu, yoksa personel yolu
    const raw = extractToken(req);
    let sponsorOrgId: string | null = null;
    if (raw) {
      const check = await validatePortalToken(raw);
      if (!check.ok) {
        return NextResponse.json(
          { error: check.reason === "UNKNOWN" ? "Etkinlik bulunamadı" : "Erişim anahtarınız geçersiz veya süresi dolmuş" },
          { status: check.reason === "UNKNOWN" ? 404 : 410 },
        );
      }
      const token = check.token;
      const organizationId = sp.get("organizationId");
      if (!organizationId) return NextResponse.json({ error: "organizationId zorunlu" }, { status: 400 });
      if (!checkSponsorScope(token, { editionId, organizationId }).ok) {
        return NextResponse.json({ error: "Etkinlik bulunamadı" }, { status: 404 });
      }
      touchToken(token.id);
      const publicEdition = await resolvePublicEdition(editionId);
      if (!publicEdition) return NextResponse.json({ error: "Etkinlik bulunamadı" }, { status: 404 });
      sponsorOrgId = organizationId;
    } else {
      const staffGate = await requireStaff();
      if (staffGate) return staffGate;
      await resolveEditionContext(editionId, { required: true });
    }

    const agreements = await db.sponsorAgreement.findMany({
      where: { editionId, status: { not: "CANCELLED" } },
      select: {
        id: true, organizationId: true,
        tier: { select: { name: true } },
        package: { select: { tier: { select: { name: true } } } },
      },
    });
    const groupOf = new Map<string, string>();
    for (const a of agreements) {
      groupOf.set(a.organizationId, a.tier?.name ?? a.package?.tier?.name ?? "UNTIERED");
    }
    const orgIds = [...groupOf.keys()];
    if (orgIds.length === 0) return NextResponse.json({ metric, k, groups: [] });

    const values = new Map<string, number>(orgIds.map((id) => [id, 0]));
    const m = metric as Metric;
    if (m === "leads") {
      const rows = await db.leadCapture.groupBy({
        by: ["agreementId"],
        where: { editionId, ...leadLiveWhere() },
        _count: { _all: true },
      });
      const agOrg = new Map(agreements.map((a) => [a.id, a.organizationId]));
      for (const r of rows) {
        const org = agOrg.get(r.agreementId);
        if (org) values.set(org, (values.get(org) ?? 0) + r._count._all);
      }
    } else if (m === "meetings") {
      const rows = await db.meetingRequest.groupBy({
        by: ["agreementId"],
        where: { editionId, status: { in: ["CONFIRMED", "COMPLETED"] } },
        _count: { _all: true },
      });
      const agOrg = new Map(agreements.map((a) => [a.id, a.organizationId]));
      for (const r of rows) {
        const org = agOrg.get(r.agreementId);
        if (org) values.set(org, (values.get(org) ?? 0) + r._count._all);
      }
    } else if (m === "profileViews") {
      const rows = await db.portalAnalyticsLog.groupBy({
        by: ["meta"],
        where: { editionId, kind: "SPONSOR_VIEW", meta: { in: orgIds } },
        _count: { _all: true },
      });
      for (const r of rows) {
        if (r.meta) values.set(r.meta, (values.get(r.meta) ?? 0) + r._count._all);
      }
    } else {
      const rows = await db.sponsorFavorite.groupBy({
        by: ["organizationId"],
        where: { editionId, organizationId: { in: orgIds } },
        _count: { _all: true },
      });
      for (const r of rows) values.set(r.organizationId, (values.get(r.organizationId) ?? 0) + r._count._all);
    }

    const members: BenchmarkMember[] = orgIds.map((orgId) => ({
      orgId,
      group: groupOf.get(orgId) ?? "UNTIERED",
      value: values.get(orgId) ?? 0,
    }));
    const groups = buildBenchmark(members, k);

    if (sponsorOrgId) {
      const ownGroup = groupOf.get(sponsorOrgId) ?? "UNTIERED";
      const peer = groups.find((g) => g.group === ownGroup) ?? null;
      return NextResponse.json({
        metric, k,
        own: { organizationId: sponsorOrgId, value: values.get(sponsorOrgId) ?? 0, group: ownGroup },
        peer,
      });
    }
    return NextResponse.json({ metric, k, groups });
  } catch (e) {
    const ge = guardJson(e);
    if (ge) return ge;
    console.error("analytics/benchmark error:", e);
    return NextResponse.json({ error: "Kıyas alınamadı" }, { status: 500 });
  }
}
