// Müşteri / Düzenleyen Kurum (CLIENT / COMMISSIONER) Dış Portalı (F-06 & CONTEXT.md)
// Firma B'nin iş yaptığı müşteri kurum (dernek, şirket, fonlayıcı kurum) için
// yönetici yetkisi vermeden güvenli icra özeti (executive overview) sunar.
// Token Kapsamı: CLIENT (PortalToken sha256 doğrulamalı).
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { extractToken, validatePortalToken, touchToken } from "@/lib/api/portal-tokens";
import { enforceRateLimit } from "@/lib/rate-limit";
import { parseOrgRoleMetadata, resolveOrgRoleDisplay } from "@/lib/organization-roles";

export async function GET(req: NextRequest) {
  try {
    const denied = enforceRateLimit(req, { key: "portal-client", limit: 60, windowMs: 60_000 });
    if (denied) return denied;

    const raw = extractToken(req);
    if (!raw) return NextResponse.json({ error: "Portal belirteci gerekli" }, { status: 401 });

    const check = await validatePortalToken(raw);
    if (!check.ok) {
      if (check.reason === "EXPIRED") return NextResponse.json({ error: "Belirtecin süresi dolmuş" }, { status: 410 });
      if (check.reason === "REVOKED") return NextResponse.json({ error: "Belirteç iptal edilmiş" }, { status: 410 });
      return NextResponse.json({ error: "Geçersiz portal belirteci" }, { status: 404 });
    }

    if (check.token.scope !== "CLIENT") {
      return NextResponse.json({ error: "Bu belirteç müşteri portalı için yetkili değil" }, { status: 403 });
    }

    touchToken(check.token.id);

    const edition = await db.eventEdition.findUnique({
      where: { id: check.token.editionId },
      select: {
        id: true,
        name: true,
        editionLabel: true,
        status: true,
        startDate: true,
        endDate: true,
        city: true,
        country: true,
        venueName: true,
        description: true,
        logoUrl: true,
        coverColor: true,
        timezone: true,
      },
    });

    if (!edition) {
      return NextResponse.json({ error: "Edisyon bulunamadı" }, { status: 404 });
    }

    let organization: {
      id: string;
      name: string;
      type: string | null;
      city: string | null;
      website: string | null;
      logoUrl: string | null;
    } | null = null;
    let assignmentDisplay: {
      role: string;
      displayLabel: string;
      validFrom: Date | null;
      validTo: Date | null;
    } | null = null;

    if (check.token.organizationId) {
      const org = await db.organization.findUnique({
        where: { id: check.token.organizationId },
        select: {
          id: true,
          name: true,
          type: true,
          city: true,
          website: true,
          logoUrl: true,
        },
      });

      const assignment = await db.eventOrganizationAssignment.findFirst({
        where: {
          editionId: check.token.editionId,
          organizationId: check.token.organizationId,
        },
        select: {
          id: true,
          role: true,
          notes: true,
          validFrom: true,
          validTo: true,
        },
      });

      if (org) {
        organization = org;
        const role = assignment?.role ?? "CLIENT";
        const meta = parseOrgRoleMetadata(assignment?.notes);
        const displayLabel = resolveOrgRoleDisplay(role, meta.meta.customLabel);
        assignmentDisplay = {
          role,
          displayLabel,
          validFrom: assignment?.validFrom ?? null,
          validTo: assignment?.validTo ?? null,
        };
      }
    }

    // İcra Özet Metrikleri (Executive Overview) — Gizli maliyetler ve iç notlar hariç tutulur
    const [confirmedRegs, pendingRegs, totalSessions, activeSponsors] = await Promise.all([
      db.registration.count({
        where: { editionId: check.token.editionId, status: "CONFIRMED" },
      }),
      db.registration.count({
        where: { editionId: check.token.editionId, status: "PENDING" },
      }),
      db.programSession.count({
        where: { editionId: check.token.editionId },
      }),
      db.sponsorAgreement.count({
        where: { editionId: check.token.editionId, status: { not: "CANCELLED" } },
      }),
    ]);

    return NextResponse.json({
      edition,
      organization,
      assignment: assignmentDisplay,
      metrics: {
        confirmedRegistrationsCount: confirmedRegs,
        pendingRegistrationsCount: pendingRegs,
        totalSessionsCount: totalSessions,
        activeSponsorsCount: activeSponsors,
      },
    });
  } catch (e) {
    console.error("portal/client GET error:", e);
    return NextResponse.json({ error: "Müşteri portal verisi alınamadı" }, { status: 500 });
  }
}
