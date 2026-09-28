// ─── P14.3b: Katılımcı xlsx üretici (doğrudan + denetimli akışın ortak kaynağı) ──
// Rıza filtresi ÜST-SEVİYE AND olarak her sorguya dahildir (P14.2). Tavan
// çağıran tarafından verilir: doğrudan 2001 (eşik), denetimli 5000.
import * as XLSX from "xlsx";
import { personConsentWhere } from "../privacy/export-guard.ts";

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

const trDate = (d: Date | null | undefined) =>
  d ? new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Istanbul" }).format(d) : "—";

export interface EditionRow {
  name: string;
  editionLabel: string | null;
  startDate: Date | null;
  endDate: Date | null;
  venueName: string | null;
  city: string | null;
  country: string | null;
  timezone: string;
  tenantId: string;
}

export interface RegRow {
  confirmationNo: string;
  status: string;
  fundingSource: string;
  source: string;
  submittedAt: Date | null;
  decidedAt: Date | null;
  notes: string | null;
  participation: {
    attendance: string;
    person: {
      firstName: string;
      lastName: string;
      email: string | null;
      phone: string | null;
      title: string | null;
      company: string | null;
      city: string | null;
      country: string | null;
    };
  };
  category: { name: string; basePrice: number; currency: string } | null;
}

export interface XlsxPrisma {
  eventEdition: { findUnique: (args: never) => Promise<EditionRow | null> };
  registration: { findMany: (args: never) => Promise<RegRow[]> };
}

export interface BuildXlsxInput {
  editionId: string;
  status: string;
  q: string;
  company: string;
  official: boolean;
  maxRows: number;
}

export interface BuiltXlsx {
  buffer: Buffer;
  filename: string;
  count: number;
}

export async function buildRegistrationsXlsx(prisma: XlsxPrisma, input: BuildXlsxInput): Promise<BuiltXlsx> {
  const findEdition = prisma.eventEdition.findUnique as unknown as (args: Record<string, unknown>) => Promise<EditionRow | null>;
  const findRegs = prisma.registration.findMany as unknown as (args: Record<string, unknown>) => Promise<RegRow[]>;
  const edition = await findEdition({
    where: { id: input.editionId },
    select: { name: true, editionLabel: true, startDate: true, endDate: true, venueName: true, city: true, country: true, timezone: true, tenantId: true },
  });
  if (!edition) throw new Error("Etkinlik bulunamadı");

  const where: Record<string, unknown> = { editionId: input.editionId };
  if (input.status && input.status !== "ALL") where.status = input.status;
  const q = input.q.trim();
  const company = input.company.trim();
  const personSearch: Record<string, unknown> = {};
  if (company) personSearch.company = { contains: company };
  if (q) {
    personSearch.OR = [
      { firstName: { contains: q } }, { lastName: { contains: q } },
      { email: { contains: q } }, { company: { contains: q } },
    ];
  }
  const regLevelOr: Record<string, unknown>[] = q
    ? [{ confirmationNo: { contains: q } }, { category: { is: { OR: [{ name: { contains: q } }, { code: { contains: q } }] } } }]
    : [];
  if (Object.keys(personSearch).length > 0) {
    regLevelOr.push({ participation: { is: { person: { is: personSearch } } } });
  }
  const andClauses: Record<string, unknown>[] = [
    { participation: { is: { person: { is: personConsentWhere() } } } },
  ];
  if (regLevelOr.length > 0) andClauses.push({ OR: regLevelOr });
  where.AND = andClauses;

  const regs = await findRegs({
    where,
    include: { participation: { include: { person: true } }, category: true },
    orderBy: [{ participation: { person: { lastName: "asc" } } }, { participation: { person: { firstName: "asc" } } }],
    take: input.maxRows,
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
  if (input.official) {
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
  if (input.official) {
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
  XLSX.utils.book_append_sheet(wb, sheet, input.official ? "Kayıt Onay Belgesi" : "Katılımcılar");

  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
  const stamp = generatedAt.toISOString().slice(0, 10);
  const slugBase = input.official ? `kayit-onay-belgesi-${company ? company.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") : "genel"}` : "katilimci-listesi";
  return { buffer: buf, filename: `${slugBase}-${stamp}.xlsx`, count: regs.length };
}
