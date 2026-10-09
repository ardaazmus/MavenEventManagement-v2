// Admin — Müşteri (CLIENT) Portalı Erişim İzni (Grant) Yönetimi (F-06 & CONTEXT.md)
// CLIENT kapsamlı PortalToken çıkarımı + listeleme + iptal.
// Ham belirteç YALNIZ çıkarım anında tek seferlik döner (single-display); sunucuda sha256 saklanır.
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { resolveEditionContext, GuardError } from "@/lib/api/tenant-guard";
import { enforceRateLimit } from "@/lib/rate-limit";
import { requireAdmin } from "@/lib/auth/request-context";
import { issuePortalToken } from "@/lib/api/portal-tokens";
import { ActivityType } from "@/lib/api/activity";

function guardJson(e: unknown) {
  if (e instanceof GuardError) return NextResponse.json({ error: e.message }, { status: e.status });
  return null;
}

export async function POST(req: NextRequest) {
  const gate = await requireAdmin();
  if (gate) return gate;
  try {
    const denied = enforceRateLimit(req, { key: "portal-client-grants", limit: 20, windowMs: 60_000 });
    if (denied) return denied;

    const body = (await req.json()) as {
      editionId?: string;
      organizationId?: string;
      ttlDays?: number;
    };

    if (!body.editionId) return NextResponse.json({ error: "editionId zorunlu" }, { status: 400 });
    if (!body.organizationId) return NextResponse.json({ error: "organizationId zorunlu" }, { status: 400 });

    const ctx = await resolveEditionContext(body.editionId, { required: true });
    const eid = ctx.editionId as string;

    const org = await db.organization.findFirst({
      where: { id: body.organizationId, tenantId: ctx.tenantId },
      select: { id: true, name: true },
    });
    if (!org) return NextResponse.json({ error: "Kurum bulunamadı" }, { status: 404 });

    const ttlMs = Math.max(1, Math.min(365, body.ttlDays ?? 90)) * 24 * 3_600_000;
    const { token, expiresAt } = await issuePortalToken({
      scope: "CLIENT",
      editionId: eid,
      organizationId: org.id,
      ttlMs,
      issuedBy: "ADMIN",
    });

    await db.activityLog.create({
      data: {
        type: ActivityType.ORG_ASSIGNMENT,
        tenantId: ctx.tenantId,
        editionId: eid,
        message: `Müşteri portal erişimi çıkarıldı — ${org.name}`,
        entityType: "PortalToken",
        actorName: "Yönetici",
      },
    });

    return NextResponse.json({ token, expiresAt, scope: "CLIENT", organizationId: org.id }, { status: 201 });
  } catch (e) {
    const ge = guardJson(e);
    if (ge) return ge;
    console.error("portal/client-grants POST error:", e);
    return NextResponse.json({ error: "Müşteri erişimi çıkarılamadı" }, { status: 400 });
  }
}

export async function GET(req: NextRequest) {
  const gate = await requireAdmin();
  if (gate) return gate;
  try {
    const sp = req.nextUrl.searchParams;
    const ctx = await resolveEditionContext(sp.get("editionId"), { required: true });
    const eid = ctx.editionId as string;
    const organizationId = sp.get("organizationId");

    const grants = await db.portalToken.findMany({
      where: {
        scope: "CLIENT",
        editionId: eid,
        ...(organizationId ? { organizationId } : {}),
      },
      select: {
        id: true,
        scope: true,
        editionId: true,
        organizationId: true,
        issuedAt: true,
        issuedBy: true,
        expiresAt: true,
        revokedAt: true,
        lastUsedAt: true,
        organization: { select: { name: true } },
      },
      orderBy: { issuedAt: "desc" },
      take: 200,
    });

    // tokenHash seçilmedi — listede belirteç türevi asla dolaşmaz
    return NextResponse.json({ items: grants });
  } catch (e) {
    const ge = guardJson(e);
    if (ge) return ge;
    console.error("portal/client-grants GET error:", e);
    return NextResponse.json({ error: "Müşteri erişim listesi alınamadı" }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest) {
  const gate = await requireAdmin();
  if (gate) return gate;
  try {
    const denied = enforceRateLimit(req, { key: "portal-client-grants", limit: 20, windowMs: 60_000 });
    if (denied) return denied;

    const id = req.nextUrl.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id zorunlu" }, { status: 400 });

    const grant = await db.portalToken.findFirst({
      where: { id, scope: "CLIENT" },
      select: { id: true, editionId: true, revokedAt: true, organization: { select: { name: true } } },
    });
    if (!grant) return NextResponse.json({ error: "Erişim bulunamadı" }, { status: 404 });

    const ctx = await resolveEditionContext(grant.editionId, { required: true });

    if (grant.revokedAt) return NextResponse.json({ ok: true, alreadyRevoked: true });

    await db.portalToken.update({ where: { id: grant.id }, data: { revokedAt: new Date() } });

    await db.activityLog.create({
      data: {
        type: ActivityType.ORG_ASSIGNMENT,
        tenantId: ctx.tenantId,
        editionId: grant.editionId,
        message: `Müşteri portal erişimi iptal edildi — ${grant.organization?.name ?? ""}`,
        entityType: "PortalToken",
        entityId: grant.id,
        actorName: "Yönetici",
      },
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    const ge = guardJson(e);
    if (ge) return ge;
    console.error("portal/client-grants DELETE error:", e);
    return NextResponse.json({ error: "Müşteri erişimi iptal edilemedi" }, { status: 400 });
  }
}
