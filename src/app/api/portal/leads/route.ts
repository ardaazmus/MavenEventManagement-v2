// Sponsor portalı — lead listesi + xlsx dışa aktarma. Jeton kapsamlıdır
// (anlaşma-kapsamlı jeton yalnız o anlaşmanın lead'lerini görür).
// KVKK: liste yanıtında rızasız kişinin iletişimi MASKELİ döner; xlsx çıktısına
// rızasız satır DÜŞMEZ (consentVersion filtresi) ve HER indirme denetim kaydına
// düşer (LEADS tipi). Belirteç yanıtta ASLA yer almaz.
import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { db } from "@/lib/db";
import { resolvePublicEdition } from "@/lib/api/public-guard";
import { extractToken, validatePortalToken, touchToken } from "@/lib/api/portal-tokens";
import { checkSponsorScope } from "@/lib/portal/sponsor-scope";
import { maskLeadContact, leadLiveWhere } from "@/lib/leads/capture";
import { logExport } from "@/lib/privacy/export-guard";
import { enforceRateLimit } from "@/lib/rate-limit";

const MAX_ROWS = 5000;

const CHANNEL_TR: Record<string, string> = {
  BADGE_SCAN: "Rozet Tarama",
  MANUAL: "Manuel",
  IMPORT: "İçe Aktarma",
};

const trDate = (d: Date | null | undefined) =>
  d ? new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Istanbul" }).format(d) : "—";

export async function GET(req: NextRequest) {
  try {
    const denied = enforceRateLimit(req, { key: "portal-leads", limit: 30, windowMs: 60_000 });
    if (denied) return denied;

    const sp = req.nextUrl.searchParams;
    const editionId = sp.get("editionId");
    const organizationId = sp.get("organizationId");
    const wantAgreementId = sp.get("agreementId");
    const format = sp.get("format");
    if (!editionId || !organizationId) {
      return NextResponse.json({ error: "editionId ve organizationId zorunlu" }, { status: 400 });
    }

    const raw = extractToken(req);
    if (!raw) {
      return NextResponse.json({ error: "Portal erişim anahtarı gerekli" }, { status: 410 });
    }
    const check = await validatePortalToken(raw);
    if (!check.ok) {
      return NextResponse.json(
        { error: check.reason === "UNKNOWN" ? "Etkinlik bulunamadı" : "Erişim anahtarınız geçersiz veya süresi dolmuş" },
        { status: check.reason === "UNKNOWN" ? 404 : 410 },
      );
    }
    const token = check.token;
    // kapsam: jeton kapsamlıysa hedef o; gövde çelişirse 404
    if (token.agreementId && wantAgreementId && token.agreementId !== wantAgreementId) {
      return NextResponse.json({ error: "Etkinlik bulunamadı" }, { status: 404 });
    }
    const scope = checkSponsorScope(token, { editionId, organizationId });
    if (!scope.ok) return NextResponse.json({ error: "Etkinlik bulunamadı" }, { status: 404 });
    touchToken(token.id);

    const publicEdition = await resolvePublicEdition(editionId);
    if (!publicEdition) return NextResponse.json({ error: "Etkinlik bulunamadı" }, { status: 404 });
    const organization = await db.organization.findFirst({
      where: { id: organizationId, tenantId: publicEdition.tenantId },
      select: { id: true, name: true },
    });
    if (!organization) return NextResponse.json({ error: "Kurum bulunamadı" }, { status: 404 });

    const targetAgreementId = token.agreementId ?? wantAgreementId;
    if (targetAgreementId) {
      const ag = await db.sponsorAgreement.findFirst({
        where: { id: targetAgreementId, editionId, organizationId },
        select: { id: true },
      });
      if (!ag) return NextResponse.json({ error: "Anlaşma bulunamadı" }, { status: 404 });
    }

    const leads = await db.leadCapture.findMany({
      where: {
        editionId,
        ...(targetAgreementId
          ? { agreementId: targetAgreementId }
          : { agreement: { organizationId } }),
        ...leadLiveWhere(),
      },
      include: {
        person: {
          select: {
            firstName: true, lastName: true, email: true, phone: true,
            company: true, title: true, consentVersion: true,
          },
        },
        agreement: { select: { id: true } },
        capturedBy: { select: { firstName: true, lastName: true } },
      },
      orderBy: { capturedAt: "desc" },
      take: MAX_ROWS,
    });

    if (format === "xlsx") {
      // rızasız satır dosyaya girmez; indirme denetlenir
      const consented = leads.filter((l) => l.person.consentVersion);
      const wb = XLSX.utils.book_new();
      const header = [
        `LEAD LİSTESİ — ${organization.name}`,
        `Oluşturma: ${trDate(new Date())} · ${consented.length} kayıt (rızalı)`,
        "",
      ];
      const ws = XLSX.utils.aoa_to_sheet([header]);
      XLSX.utils.sheet_add_aoa(ws, [
        ["Ad", "Soyad", "E-posta", "Telefon", "Firma", "Ünvan", "Kanal", "Derece", "Not", "Yakalayan", "Tarih"],
        ...consented.map((l) => [
          l.person.firstName,
          l.person.lastName,
          l.person.email ?? "",
          l.person.phone ?? "",
          l.person.company ?? "",
          l.person.title ?? "",
          CHANNEL_TR[l.channel] ?? l.channel,
          l.rating ?? "",
          l.note ?? "",
          l.capturedBy ? `${l.capturedBy.firstName} ${l.capturedBy.lastName}` : "",
          trDate(l.capturedAt),
        ]),
      ], { origin: "A5" });
      ws["!cols"] = [{ wch: 16 }, { wch: 16 }, { wch: 30 }, { wch: 16 }, { wch: 24 }, { wch: 18 }, { wch: 14 }, { wch: 10 }, { wch: 30 }, { wch: 20 }, { wch: 18 }];
      XLSX.utils.book_append_sheet(wb, ws, "Lead'ler");
      const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
      const stamp = new Date().toISOString().slice(0, 10);
      await logExport(db, {
        tenantId: publicEdition.tenantId ?? null,
        editionId,
        type: "LEADS",
        count: consented.length,
        actorName: `Sponsor Portalı — ${organization.name}`,
      });
      return new NextResponse(new Uint8Array(buf), {
        status: 200,
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="leadler-${stamp}.xlsx"`,
          "Cache-Control": "no-store",
        },
      });
    }

    return NextResponse.json({
      items: leads.map((l) => {
        const masked = maskLeadContact(l.person);
        return {
          id: l.id,
          agreementId: l.agreementId,
          channel: l.channel,
          rating: l.rating,
          note: l.note,
          purpose: l.consentPurpose,
          capturedAt: l.capturedAt,
          expiresAt: l.expiresAt,
          contactMasked: !l.person.consentVersion,
          person: {
            firstName: masked.firstName, lastName: masked.lastName, email: masked.email,
            phone: masked.phone, company: masked.company, title: masked.title,
          },
          capturedBy: l.capturedBy ? `${l.capturedBy.firstName} ${l.capturedBy.lastName}` : null,
        };
      }),
    });
  } catch (err) {
    console.error("portal/leads error:", err);
    return NextResponse.json({ error: "Lead listesi alınamadı" }, { status: 500 });
  }
}
