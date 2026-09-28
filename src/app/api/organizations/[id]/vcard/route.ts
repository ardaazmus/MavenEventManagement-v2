// Kurum QR VCard + konum QR — paydaş kimlik kartı (düşünce bulutu 5)
// GET /api/organizations/[id]/vcard?format=json|vcf|qr|location
//   qr       → kurum kartvizit QR'ı
//   location → Salon/Fuar/Otel konum QR'ı (locationNote + adres) — stand/yer tabelası için
import { NextRequest, NextResponse } from "next/server";
import QRCode from "qrcode";
import { db } from "@/lib/db";
import { ensureInScope } from "@/lib/api/tenant-guard";
import { requireStaff } from "@/lib/auth/request-context";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  // N-08 rol kapısı — envanter iddiasıyla uyum (auth-off'ta null, davranış korunur).
  const staffGate = await requireStaff();
  if (staffGate) return staffGate;
  try {
    const { id } = await params;
    const format = new URL(req.url).searchParams.get("format") ?? "json";

    // G0-a: kurum vcard/iletişim bilgisi kişisel veri taşır — kapsam dışı 404
    const scoped = await ensureInScope("organizations", id);
    if (!scoped.ok) return NextResponse.json({ error: scoped.error }, { status: scoped.status });

    const org = await db.organization.findUnique({
      where: { id },
      include: { contacts: { orderBy: { isPrimary: "desc" } } },
    });
    if (!org) return NextResponse.json({ error: "Kurum bulunamadı" }, { status: 404 });

    const primary = org.contacts.find((c) => c.isPrimary) ?? org.contacts[0];
    const vcard = [
      "BEGIN:VCARD",
      "VERSION:3.0",
      `ORG:${org.name}`,
      `FN:${org.name}`,
      primary?.name ? `TITLE:${primary.title ?? primary.role ?? "İletişim"}: ${primary.name}` : "",
      primary?.email || org.generalEmail ? `EMAIL;TYPE=INTERNET,WORK:${primary?.email ?? org.generalEmail}` : "",
      primary?.phone ? `TEL;TYPE=WORK,VOICE:${primary.phone}` : "",
      org.website ? `URL:${org.website}` : "",
      org.address ? `ADR;TYPE=WORK:;;${org.address.replace(/\n/g, ", ")};;;;` : "",
      org.locationNote ? `NOTE:Konum: ${org.locationNote}` : "",
      org.notes ? `NOTE:${org.notes.replace(/\n/g, " ").slice(0, 160)}` : "",
      `REV:${new Date().toISOString()}`,
      "END:VCARD",
    ].filter(Boolean).join("\r\n");

    // Konum QR: locationNote varsa öncelikli — salon/fuar/otel yönlendirmesi
    const locationPayload = org.locationNote
      ? [org.name, org.locationNote, org.address].filter(Boolean).join(" · ")
      : [org.name, org.address].filter(Boolean).join(" · ");

    const qrDataUrl = await QRCode.toDataURL(vcard, { errorCorrectionLevel: "M", margin: 1, width: 480 });
    const locationQrDataUrl = await QRCode.toDataURL(locationPayload || org.name, {
      errorCorrectionLevel: "M", margin: 1, width: 480, color: { dark: "#134e4a", light: "#ffffff" },
    });

    if (format === "vcf") {
      return new NextResponse(vcard, {
        headers: {
          "Content-Type": "text/vcard; charset=utf-8",
          "Content-Disposition": `attachment; filename="${org.name.replace(/\s+/g, "-")}.vcf"`,
        },
      });
    }
    if (format === "qr") return new NextResponse(qrDataUrl, { headers: { "Content-Type": "text/plain" } });
    if (format === "location") return new NextResponse(locationQrDataUrl, { headers: { "Content-Type": "text/plain" } });

    return NextResponse.json({
      vcard, qrDataUrl, locationQrDataUrl, locationPayload,
      organization: {
        id: org.id, name: org.name, type: org.type, website: org.website,
        generalEmail: org.generalEmail, address: org.address, locationNote: org.locationNote,
        logoUrl: org.logoUrl, contacts: org.contacts.map((c) => ({
          id: c.id, name: c.name, role: c.role, email: c.email, phone: c.phone, isPrimary: c.isPrimary,
        })),
      },
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Kurum QR üretilemedi" }, { status: 500 });
  }
}
