// Admin — §P20.1 Sponsor erişim izni (grant) yönetimi: SPONSOR kapsamlı PortalToken
// çıkarımı + listeleme + iptal. Ham belirteç YALNIZ çıkarım yanıtında bir kez döner
// (single-display — DB'de yalnız sha256); listede belirteç ASLA yer almaz.
// agreementId DOLU ise jeton yalnız o anlaşmaya işler (§P20.1 anlaşma-bazlı rol
// erişimi); BOŞ ise kurum geneli. Yetki: requireAdmin + resolveEditionContext.
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
    const denied = enforceRateLimit(req, { key: "portal-sponsor-grants", limit: 20, windowMs: 60_000 });
    if (denied) return denied;
    const body = (await req.json()) as {
      editionId?: string;
      organizationId?: string;
      agreementId?: string | null;
      ttlDays?: number;
    };
    if (!body.editionId) return NextResponse.json({ error: "editionId zorunlu" }, { status: 400 });
    if (!body.organizationId) return NextResponse.json({ error: "organizationId zorunlu" }, { status: 400 });
    const ctx = await resolveEditionContext(body.editionId, { required: true });
    const eid = ctx.editionId as string;

    // kurum-kiracı bağı doğrulanır — yabancı kuruma jeton çıkarılmaz
    const org = await db.organization.findFirst({
      where: { id: body.organizationId, tenantId: ctx.tenantId },
      select: { id: true, name: true },
    });
    if (!org) return NextResponse.json({ error: "Kurum bulunamadı" }, { status: 404 });

    // anlaşma bağı doğrulanır — (edisyon + kurum) zinciri tutmalı
    let agreementId: string | null = null;
    if (body.agreementId) {
      const ag = await db.sponsorAgreement.findFirst({
        where: { id: body.agreementId, editionId: eid, organizationId: org.id },
        select: { id: true, status: true },
      });
      if (!ag) return NextResponse.json({ error: "Anlaşma bu kurum-edisyona ait değil" }, { status: 404 });
      if (ag.status === "CANCELLED") {
        return NextResponse.json({ error: "İptal edilmiş anlaşmaya erişim çıkarılamaz" }, { status: 409 });
      }
      agreementId = ag.id;
    }

    const ttlMs = Math.max(1, Math.min(365, body.ttlDays ?? 90)) * 24 * 3_600_000;
    const { token, expiresAt } = await issuePortalToken({
      scope: "SPONSOR",
      editionId: eid,
      organizationId: org.id,
      agreementId,
      ttlMs,
      issuedBy: "ADMIN",
    });
    await db.activityLog.create({
      data: {
        type: ActivityType.SPONSOR_AGREEMENT,
        tenantId: ctx.tenantId,
        editionId: eid,
        message: `Sponsor erişimi çıkarıldı — ${org.name}${agreementId ? " (anlaşma kapsamlı)" : " (kurum geneli)"}`,
        entityType: "PortalToken",
        actorName: "Yönetici",
      },
    });
    return NextResponse.json({ token, expiresAt, scope: "SPONSOR", organizationId: org.id, agreementId }, { status: 201 });
  } catch (e) {
    const ge = guardJson(e);
    if (ge) return ge;
    console.error("portal/sponsor-grants POST:", e);
    return NextResponse.json({ error: "Sponsor erişimi çıkarılamadı" }, { status: 400 });
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
        scope: "SPONSOR",
        editionId: eid,
        ...(organizationId ? { organizationId } : {}),
      },
      select: {
        id: true, scope: true, editionId: true, organizationId: true, agreementId: true,
        issuedAt: true, issuedBy: true, expiresAt: true, revokedAt: true, lastUsedAt: true,
        organization: { select: { name: true } },
      },
      orderBy: { issuedAt: "desc" },
      take: 200,
    });
    // NOT: tokenHash seçilmedi — liste yanıtında belirteç türevi ASLA dolaşmaz
    return NextResponse.json({ items: grants });
  } catch (e) {
    const ge = guardJson(e);
    if (ge) return ge;
    console.error("portal/sponsor-grants GET:", e);
    return NextResponse.json({ error: "Erişim listesi alınamadı" }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest) {
  const gate = await requireAdmin();
  if (gate) return gate;
  try {
    const denied = enforceRateLimit(req, { key: "portal-sponsor-grants", limit: 20, windowMs: 60_000 });
    if (denied) return denied;
    const id = req.nextUrl.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id zorunlu" }, { status: 400 });
    const grant = await db.portalToken.findFirst({
      where: { id, scope: "SPONSOR" },
      select: { id: true, editionId: true, revokedAt: true, organization: { select: { name: true } } },
    });
    if (!grant) return NextResponse.json({ error: "Erişim bulunamadı" }, { status: 404 });
    // kiracı kapsamı jetonun edisyonu üzerinden doğrulanır
    const ctx = await resolveEditionContext(grant.editionId, { required: true });
    if (grant.revokedAt) return NextResponse.json({ ok: true, alreadyRevoked: true });
    await db.portalToken.update({ where: { id: grant.id }, data: { revokedAt: new Date() } });
    await db.activityLog.create({
      data: {
        type: ActivityType.SPONSOR_AGREEMENT,
        tenantId: ctx.tenantId,
        editionId: grant.editionId,
        message: `Sponsor erişimi iptal edildi — ${grant.organization?.name ?? ""}`,
        entityType: "PortalToken",
        entityId: grant.id,
        actorName: "Yönetici",
      },
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    const ge = guardJson(e);
    if (ge) return ge;
    console.error("portal/sponsor-grants DELETE:", e);
    return NextResponse.json({ error: "Erişim iptal edilemedi" }, { status: 400 });
  }
}
