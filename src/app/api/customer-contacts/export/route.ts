// /api/customer-contacts/export — Müşteri datası xlsx dışa aktarma
// Kurum/kuruluş yazışmalarında "kayıtlarınız tamamlandı" listesi olarak da
// kullanılabilir iletişim havuzu çıktısı (kiracı kapsamlı, edisyon filtreli).
import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { db } from "@/lib/db";
import { resolveContext, GuardError } from "@/lib/api/tenant-guard";
import { requireStaff } from "@/lib/auth/request-context";
import { enforceRateLimit } from "@/lib/rate-limit";

const MAX_EXPORT = 5000;

const SOURCE_TR: Record<string, string> = {
  PARTICIPANT_IMPORT: "Katılımcı Aktarımı",
  MANUAL: "Manuel Giriş",
  FORM: "Form",
  IMPORT: "İçe Aktarma",
};

const trDate = (d: Date | null | undefined) =>
  d ? new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Istanbul" }).format(d) : "—";

export async function GET(req: NextRequest) {
  const denied = enforceRateLimit(req, { key: "crm-export", limit: 12, windowMs: 60_000 });
  if (denied) return denied;
  const staffGate = await requireStaff();
  if (staffGate) return staffGate;

  try {
    const sp = req.nextUrl.searchParams;
    const tenantId = await resolveContext(sp.get("tenantId"));
    const editionId = sp.get("editionId");
    const kind = sp.get("kind");
    const tag = (sp.get("tag") ?? "").trim();
    const q = (sp.get("q") ?? "").trim();

    const where: Record<string, unknown> = { tenantId };
    if (editionId) where.sourceEditionId = editionId;
    if (kind === "PERSON" || kind === "ORGANIZATION") where.kind = kind;
    if (tag) where.tags = { contains: tag };
    if (q) {
      where.OR = [
        { displayName: { contains: q } },
        { email: { contains: q } },
        { phone: { contains: q } },
        { company: { contains: q } },
        { city: { contains: q } },
      ];
    }

    const rows = await db.customerContact.findMany({
      where,
      include: { sourceEdition: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      take: MAX_EXPORT,
    });

    const edition = editionId
      ? await db.eventEdition.findUnique({ where: { id: editionId }, select: { name: true, editionLabel: true } })
      : null;

    const wb = XLSX.utils.book_new();
    const header = [
      "MÜŞTERİ İLETİŞİM DATASI — MAVEN OLAY YÖNETİMİ",
      ...(edition ? [`Kaynak etkinlik: ${edition.name}${edition.editionLabel ? ` · ${edition.editionLabel}` : ""}`] : []),
      `Oluşturma: ${trDate(new Date())} · ${rows.length} kayıt (maks ${MAX_EXPORT})`,
      "",
    ];
    const ws = XLSX.utils.aoa_to_sheet([header]);
    XLSX.utils.sheet_add_aoa(ws, [
      ["Ad / Kurum", "Tür", "E-posta", "Telefon", "Kurum", "Ünvan", "Şehir", "Ülke", "Kategori", "Kaynak", "Kaynak Etkinlik", "Etiketler", "İletişim Onayı", "Son E-posta", "Son SMS", "Son WhatsApp", "Kayıt Tarihi"],
      ...rows.map((c) => [
        c.displayName,
        c.kind === "ORGANIZATION" ? "Kurum/Kuruluş" : "Kişi",
        c.email ?? "",
        c.phone ?? "",
        c.company ?? "",
        c.title ?? "",
        c.city ?? "",
        c.country ?? "",
        c.category ?? "",
        SOURCE_TR[c.source] ?? c.source,
        c.sourceEdition?.name ?? "",
        c.tags ?? "",
        c.commsOptIn ? "Onaylı" : "Onaysız",
        c.lastEmailAt ? trDate(c.lastEmailAt) : "",
        c.lastSmsAt ? trDate(c.lastSmsAt) : "",
        c.lastWhatsAppAt ? trDate(c.lastWhatsAppAt) : "",
        trDate(c.createdAt),
      ]),
    ], { origin: "A5" });

    ws["!cols"] = [{ wch: 26 }, { wch: 12 }, { wch: 30 }, { wch: 16 }, { wch: 24 }, { wch: 18 }, { wch: 14 }, { wch: 12 }, { wch: 18 }, { wch: 16 }, { wch: 22 }, { wch: 20 }, { wch: 12 }, { wch: 18 }, { wch: 18 }, { wch: 18 }, { wch: 18 }];
    XLSX.utils.book_append_sheet(wb, ws, "Müşteri Datası");

    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
    const stamp = new Date().toISOString().slice(0, 10);
    return new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="musteri-datas-${stamp}.xlsx"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    if (e instanceof GuardError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("GET /api/customer-contacts/export", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Dışa aktarma başarısız" }, { status: 500 });
  }
}
