// /api/registrations/export — Kayıt & Katılımcılar dışa aktarma (Excel/xlsx)
// İki mod:
//   normal   → Katılımcı listesi (mevcut filtrelerle: durum, arama, kurum)
//   official → RESMİ KAYIT ONAY BELGESİ — kurum/kuruluş "kayıtlarınız tamamlandı,
//              son resmi onay" talebi yazışmalarında kullanılan onaylı belge formatı:
//              başlık bloğu + etkinlik künyesi + kayıt tablosu + imza bloğu.
// Sunucu tarafı SheetJS üretimi; kiracı kapsamı verifyEditionTenant ile zorlanır.
import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import { db } from "@/lib/db";
import { verifyEditionTenant, GuardError } from "@/lib/api/tenant-guard";
import { requireStaff } from "@/lib/auth/request-context";
import { enforceRateLimit } from "@/lib/rate-limit";

// SUNUCU-GÜVENLİ etiket haritaları — @/lib/constants İSTEMCİ modülüdür (i18n
// useSyncExternalStore bağı var; route'a giremez). Değerler constants.ts ile
// senkron tutulur (§10/§12 envanter); sadece xlsx export metni için kullanılır.
const REGISTRATION_STATUS_TR: Record<string, string> = {
  DRAFT: "Taslak", SUBMITTED: "Gönderildi", PENDING_APPROVAL: "Onay bekliyor",
  CONFIRMED: "Onaylandı", REJECTED: "Reddedildi", CANCELLED: "İptal",
};
const FUNDING_SOURCES_TR: Record<string, string> = {
  SELF_PAID: "Kendi Ödemesi", ORGANIZATION_PAID: "Kurum Ödüyor", SPONSOR_ENTITLEMENT: "Sponsor Hakkı",
  HOST_COMPLIMENTARY: "Ev Sahibi Daveti", SPEAKER_ENTITLEMENT: "Konuşmacı Hakkı", STAFF: "Görevli",
  SCHOLARSHIP: "Burs", GRANT: "Hibe", PROMO: "Promosyon",
};
const REG_SOURCES_TR: Record<string, string> = {
  PUBLIC_FORM: "Genel Form", INVITATION: "Davet", SPONSOR_PORTAL: "Sponsor Portalı",
  EXHIBITOR_PORTAL: "Fuarcı Portalı", SCIENTIFIC_PORTAL: "Bilimsel Portal", ADMIN_ENTRY: "Admin Girişi",
  IMPORT: "İçe Aktarma", API: "API", ONSITE_WALK_IN: "Sahada Kayıt", GROUP_REGISTRATION: "Grup Kaydı",
  WAITLIST_PROMOTION: "Bekleme Listesi",
};
const ATTENDANCE_STATUS_TR: Record<string, string> = {
  NOT_ARRIVED: "Gelmedi", CHECKED_IN: "Giriş yaptı", CHECKED_OUT: "Çıkış yaptı", NO_SHOW: "No-show",
};

const MAX_EXPORT = 5000;

const trDate = (d: Date | null | undefined) =>
  d ? new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Istanbul" }).format(d) : "—";

export async function GET(req: NextRequest) {
  const denied = enforceRateLimit(req, { key: "reg-export", limit: 12, windowMs: 60_000 });
  if (denied) return denied;
  const staffGate = await requireStaff();
  if (staffGate) return staffGate;

  try {
    const sp = req.nextUrl.searchParams;
    const editionId = sp.get("editionId") ?? "";
    if (!editionId) return NextResponse.json({ error: "editionId zorunludur" }, { status: 400 });
    try {
      await verifyEditionTenant(editionId);
    } catch (e) {
      if (e instanceof GuardError) return NextResponse.json({ error: e.message }, { status: e.status });
      throw e;
    }

    const status = sp.get("status") ?? "ALL";
    const q = (sp.get("q") ?? "").trim();
    const company = (sp.get("company") ?? "").trim();
    const official = sp.get("official") === "1";

    const edition = await db.eventEdition.findUnique({
      where: { id: editionId },
      select: { name: true, editionLabel: true, startDate: true, endDate: true, venueName: true, city: true, country: true, timezone: true },
    });
    if (!edition) return NextResponse.json({ error: "Etkinlik bulunamadı" }, { status: 404 });

    const where: Record<string, unknown> = { editionId };
    if (status && status !== "ALL") where.status = status;
    // kombinasyon-geçerli filtre: q (serbest arama) + company (kurum) birlikte de çalışır —
    // kişi-yüzü tek cümlede birleşir; teyit no/kategori araması kayıt-düzeyi OR'a eklenir.
    const personClause: Record<string, unknown> = {};
    if (company) personClause.company = { contains: company };
    if (q) {
      personClause.OR = [
        { firstName: { contains: q } }, { lastName: { contains: q } },
        { email: { contains: q } }, { company: { contains: q } },
      ];
    }
    const regLevelOr: Record<string, unknown>[] = q
      ? [{ confirmationNo: { contains: q } }, { category: { is: { OR: [{ name: { contains: q } }, { code: { contains: q } }] } } }]
      : [];
    if (Object.keys(personClause).length > 0) {
      regLevelOr.push({ participation: { is: { person: { is: personClause } } } });
    }
    if (regLevelOr.length > 0) where.OR = regLevelOr;

    const regs = await db.registration.findMany({
      where: where as never,
      include: { participation: { include: { person: true } }, category: true },
      orderBy: [{ participation: { person: { lastName: "asc" } } }, { participation: { person: { firstName: "asc" } } }],
      take: MAX_EXPORT,
    });

    const editionTitle = `${edition.name}${edition.editionLabel ? ` · ${edition.editionLabel}` : ""}`;
    const generatedAt = new Date();

    const headers = [
      "Teyit No", "Ad", "Soyad", "E-posta", "Telefon", "Unvan", "Kurum", "Şehir", "Ülke",
      "Kategori", "Ücret", "Para Birimi", "Kayıt Durumu", "Fon Kaynağı", "Kaynak", "Katılım",
      "Gönderim", "Onay", "Notlar",
    ];
    const rows = regs.map((r) => [
      r.confirmationNo,
      r.participation.person.firstName,
      r.participation.person.lastName,
      r.participation.person.email ?? "",
      r.participation.person.phone ?? "",
      r.participation.person.title ?? "",
      r.participation.person.company ?? "",
      r.participation.person.city ?? "",
      r.participation.person.country ?? "",
      r.category?.name ?? "",
      r.category?.basePrice ? (r.category.basePrice / 100).toLocaleString("tr-TR") : "Ücretsiz",
      r.category?.currency ?? "",
      REGISTRATION_STATUS_TR[r.status] ?? r.status,
      FUNDING_SOURCES_TR[r.fundingSource] ?? r.fundingSource,
      REG_SOURCES_TR[r.source] ?? r.source,
      ATTENDANCE_STATUS_TR[r.participation.attendance] ?? r.participation.attendance,
      trDate(r.submittedAt),
      trDate(r.decidedAt),
      r.notes ?? "",
    ]);

    const aoa: (string | number)[][] = [];
    if (official) {
      const confirmed = regs.filter((r) => r.status === "CONFIRMED").length;
      aoa.push(
        ["RESMİ KAYIT ONAY BELGESİ"],
        [editionTitle],
        [
          edition.startDate
            ? `Etkinlik tarihleri: ${new Intl.DateTimeFormat("tr-TR", { dateStyle: "long", timeZone: edition.timezone }).format(edition.startDate)}${edition.endDate ? ` — ${new Intl.DateTimeFormat("tr-TR", { dateStyle: "long", timeZone: edition.timezone }).format(edition.endDate)}` : ""}`
            : "Etkinlik tarihleri: —",
        ],
        [`${edition.venueName ?? ""}${edition.venueName && (edition.city ?? edition.country) ? ", " : ""}${edition.city ?? ""}${edition.country ? ` / ${edition.country}` : ""}` || "Yer: —"],
        [company ? `Kurum / Kuruluş: ${company}` : "Kurum / Kuruluş: —"],
        [`Aşağıda listelenen ${regs.length} kişinin "${editionTitle}" etkinliği kayıtları tamamlanmıştır. Onaylı (CONFIRMED) kayıt sayısı: ${confirmed}.`],
        [`Belge oluşturma: ${trDate(generatedAt)}`],
        []
      );
    } else {
      const counts = new Map<string, number>();
      for (const r of regs) counts.set(r.status, (counts.get(r.status) ?? 0) + 1);
      aoa.push(
        ["Maven Event Management"],
        [`${editionTitle} — Katılımcı Kayıt Listesi`],
        [`Oluşturulma: ${trDate(generatedAt)} · Toplam kayıt: ${regs.length}`],
        ...(counts.size > 0 ? [[`Durum dağılımı: ${[...counts.entries()].map(([k, v]) => `${REGISTRATION_STATUS_TR[k] ?? k}: ${v}`).join(" · ")}`]] : []),
        []
      );
    }
    aoa.push(headers, ...rows);
    if (official) {
      aoa.push(
        [],
        ["Bu belge Maven Event Management kayıt sisteminden üretilmiştir."],
        ["Düzenleyen (ad-soyad): ______________________"],
        ["Yetkili İmza: ______________________"],
        ["Kaşe / Tarih: ______________________"]
      );
    }

    const sheet = XLSX.utils.aoa_to_sheet(aoa);
    sheet["!cols"] = headers.map((h, i) => ({
      wch: i === 0 ? 14 : Math.min(38, Math.max(h.length + 2, ...rows.slice(0, 50).map((r) => String(r[i] ?? "").length + 2))),
    }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, sheet, official ? "Kayıt Onay Belgesi" : "Katılımcılar");

    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
    const stamp = generatedAt.toISOString().slice(0, 10);
    const slugBase = official ? `kayit-onay-belgesi-${company ? company.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") : "genel"}` : "katilimci-listesi";
    const filename = `${slugBase}-${stamp}.xlsx`;

    return new NextResponse(new Uint8Array(buf), {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
        "X-Export-Count": String(regs.length),
      },
    });
  } catch (e) {
    console.error("GET /api/registrations/export", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Dışa aktarma oluşturulamadı" }, { status: 500 });
  }
}
