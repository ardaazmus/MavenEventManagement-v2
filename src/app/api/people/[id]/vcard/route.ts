// QR VCard — kişinin yaka kartı/etiket için QR'lanabilir sanal kartviziti (düşünce bulutu 1)
// GET /api/people/[id]/vcard?format=json  → vCard 3.0 metni + QR SVG data URL + meta
// GET /api/people/[id]/vcard?format=vcf   → .vcf dosyası indir
// GET /api/people/[id]/vcard?format=qr    → yalnız QR SVG data URL (yaka kartı tasarımında kullanılır)
import { NextRequest, NextResponse } from "next/server";
import QRCode from "qrcode";
import { db } from "@/lib/db";
import { ensureInScope } from "@/lib/api/tenant-guard";
import { requireStaff } from "@/lib/auth/request-context";

function buildVCard(p: {
  firstName: string; lastName: string; title?: string | null; company?: string | null;
  email?: string | null; phone?: string | null; city?: string | null; country?: string | null;
  bio?: string | null; linkedin?: string | null; organization?: { name?: string | null; website?: string | null } | null;
  roles?: string[];
}) {
  const lines = [
    "BEGIN:VCARD",
    "VERSION:3.0",
    `N:${p.lastName};${p.firstName};;;`,
    `FN:${p.firstName} ${p.lastName}`,
  ];
  if (p.title) lines.push(`TITLE:${p.title}`);
  if (p.company || p.organization?.name) lines.push(`ORG:${p.organization?.name ?? p.company}`);
  if (p.email) lines.push(`EMAIL;TYPE=INTERNET,WORK:${p.email}`);
  if (p.phone) lines.push(`TEL;TYPE=WORK,VOICE:${p.phone}`);
  if (p.organization?.website) lines.push(`URL:${p.organization.website}`);
  if (p.linkedin) lines.push(`X-SOCIALPROFILE;TYPE=linkedin:${p.linkedin}`);
  const geo = [p.city, p.country].filter(Boolean).join(", ");
  if (geo) lines.push(`ADR;TYPE=WORK:;;${geo};;;;`);
  if (p.roles && p.roles.length > 0) lines.push(`NOTE:Rol${p.roles.length > 1 ? "ler" : ""}: ${p.roles.join(", ")}`);
  if (p.bio) lines.push(`NOTE:${p.bio.replace(/\n/g, " ").slice(0, 180)}`);
  lines.push(`REV:${new Date().toISOString()}`);
  lines.push("END:VCARD");
  return lines.join("\r\n");
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  // N-08 rol kapısı — envanter iddiasıyla uyum (auth-off'ta null, davranış korunur).
  const staffGate = await requireStaff();
  if (staffGate) return staffGate;
  try {
    const { id } = await params;
    const format = new URL(req.url).searchParams.get("format") ?? "json";

    // G0-a: vcard kişisel veri taşır — kapsam dışı/başka kiracı kişi 404
    const scoped = await ensureInScope("people", id);
    if (!scoped.ok) return NextResponse.json({ error: scoped.error }, { status: scoped.status });

    const person = await db.person.findUnique({
      where: { id },
      include: {
        participations: {
          include: { roleAssignments: true, edition: { select: { name: true } } },
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
    });
    if (!person) return NextResponse.json({ error: "Kişi bulunamadı" }, { status: 404 });

    const roles = person.participations.flatMap((p) => p.roleAssignments.map((r) => r.role)).filter(Boolean);
    const vcard = buildVCard({
      firstName: person.firstName, lastName: person.lastName, title: person.title,
      company: person.company, email: person.email, phone: person.phone,
      city: person.city, country: person.country, bio: person.bio, linkedin: person.linkedin,
      roles,
    });

    const qrDataUrl = await QRCode.toDataURL(vcard, {
      errorCorrectionLevel: "M",
      margin: 1,
      width: 480,
      color: { dark: "#0f172a", light: "#ffffff" },
    });

    if (format === "vcf") {
      return new NextResponse(vcard, {
        headers: {
          "Content-Type": "text/vcard; charset=utf-8",
          "Content-Disposition": `attachment; filename="${person.firstName}-${person.lastName}.vcf"`,
        },
      });
    }
    if (format === "qr") {
      return new NextResponse(qrDataUrl, { headers: { "Content-Type": "text/plain" } });
    }

    return NextResponse.json({
      vcard,
      qrDataUrl,
      person: {
        id: person.id, fullName: `${person.firstName} ${person.lastName}`, title: person.title,
        company: person.company, email: person.email, phone: person.phone, photoUrl: person.photoUrl,
        edition: person.participations[0]?.edition?.name ?? null, roles,
      },
    });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "VCard üretilemedi" }, { status: 500 });
  }
}
