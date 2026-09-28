// Sponsor portalı — P20.4 ROI özeti: harcama, lead hunisi, görüşmeler,
// teslim zamanında-tamamlanma, hak tüketimi, stant ve personel sayımları.
// Canlı agregasyon (önbellek yok); kapsam jetondan daralır.
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { resolvePublicEdition } from "@/lib/api/public-guard";
import { extractToken, validatePortalToken, touchToken } from "@/lib/api/portal-tokens";
import { checkSponsorScope } from "@/lib/portal/sponsor-scope";
import { getSponsorRoi, type RoiPrisma } from "@/lib/portal/sponsor-roi";
import { enforceRateLimit } from "@/lib/rate-limit";

export async function GET(req: NextRequest) {
  try {
    const denied = enforceRateLimit(req, { key: "portal-roi", limit: 30, windowMs: 60_000 });
    if (denied) return denied;

    const sp = req.nextUrl.searchParams;
    const editionId = sp.get("editionId");
    const organizationId = sp.get("organizationId");
    const wantAgreementId = sp.get("agreementId");
    if (!editionId || !organizationId) {
      return NextResponse.json({ error: "editionId ve organizationId zorunlu" }, { status: 400 });
    }

    const raw = extractToken(req);
    if (!raw) return NextResponse.json({ error: "Portal erişim anahtarı gerekli" }, { status: 410 });
    const check = await validatePortalToken(raw);
    if (!check.ok) {
      return NextResponse.json(
        { error: check.reason === "UNKNOWN" ? "Etkinlik bulunamadı" : "Erişim anahtarınız geçersiz veya süresi dolmuş" },
        { status: check.reason === "UNKNOWN" ? 404 : 410 },
      );
    }
    const token = check.token;
    if (token.agreementId && wantAgreementId && token.agreementId !== wantAgreementId) {
      return NextResponse.json({ error: "Etkinlik bulunamadı" }, { status: 404 });
    }
    if (!checkSponsorScope(token, { editionId, organizationId }).ok) {
      return NextResponse.json({ error: "Etkinlik bulunamadı" }, { status: 404 });
    }
    touchToken(token.id);

    const publicEdition = await resolvePublicEdition(editionId);
    if (!publicEdition) return NextResponse.json({ error: "Etkinlik bulunamadı" }, { status: 404 });
    const organization = await db.organization.findFirst({
      where: { id: organizationId, tenantId: publicEdition.tenantId },
      select: { id: true, name: true },
    });
    if (!organization) return NextResponse.json({ error: "Kurum bulunamadı" }, { status: 404 });

    const roi = await getSponsorRoi(db as unknown as RoiPrisma, {
      editionId,
      organizationId,
      orgName: organization.name,
      agreementId: token.agreementId ?? wantAgreementId,
    });
    return NextResponse.json({ organization: { id: organization.id, name: organization.name }, ...roi });
  } catch (err) {
    console.error("portal/sponsor/roi error:", err);
    return NextResponse.json({ error: "ROI özeti alınamadı" }, { status: 500 });
  }
}
