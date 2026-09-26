// /api/registrations/import — Excel/CSV TOPLU kayıt içe aktarma (Kayıt & Katılımcılar)
// İki fazlı sözleşme:
//   1) commit !== true → PREVIEW: satırlar normalize+doğrulanır, kategori eşlemesi ve
//      mükerrer analizi raporlanır; HİÇBİR YAZIM YAPILMAZ (önizleme UX'i).
//   2) commit === true → COMMIT: geçerli satırlar createManualRegistration ile içe
//      alınır (kaynak IMPORT); hatalı satırlar atlanıp raporlanır — kısmi başarı meşru.
// Dosya istemcide (SheetJS) parse edilip JSON satırları gönderilir; sunucu ASLA
// istemciye güvenmez — aynı doğrulama commit'te yeniden koşar (defense in depth).
// Başlıklar TR/EN esnek: Ad/First Name, Soyad/Last Name, E-posta/Email, Kurum/Company…
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  createManualRegistration, ManualRegistrationError, resolveCategoryRef,
  MANUAL_STATUSES, MANUAL_FUNDING, isValidEmail,
} from "@/lib/api/manual-registration";
import { verifyEditionTenant, GuardError } from "@/lib/api/tenant-guard";
import { requestActor, requireStaff } from "@/lib/auth/request-context";
import { enforceRateLimit } from "@/lib/rate-limit";
import { withLock } from "@/lib/tx-lock";
import { ActivityType } from "@/lib/api/activity";

const MAX_ROWS = 1000;

// başlık normalizasyonu — Türkçe/İngilizce yaygın kolon adları (küçük harfe indirilir)
const HEADER_ALIASES: Record<string, string[]> = {
  firstName: ["ad", "adı", "isim", "first name", "firstname", "given name"],
  lastName: ["soyad", "soyadı", "soyisim", "last name", "lastname", "surname"],
  email: ["e-posta", "eposta", "e posta", "email", "e-mail", "mail"],
  phone: ["telefon", "tel", "gsm", "cep", "phone", "mobile"],
  title: ["unvan", "ünvan", "title", "pozisyon", "görev", "job title"],
  company: ["kurum", "kuruluş", "firma", "şirket", "company", "organization", "organisation", "organizasyon"],
  city: ["şehir", "sehir", "city"],
  country: ["ülke", "ulke", "country"],
  category: ["kategori", "category", "katılım türü", "katilim turu"],
  status: ["durum", "kayıt durumu", "kayit durumu", "status"],
  fundingSource: ["fon", "fon kaynağı", "fon kaynagi", "funding", "funding source", "ödeme"],
  notes: ["not", "notlar", "notes", "açıklama", "aciklama"],
};

function normalizeHeaders(rows: Record<string, unknown>[]): { norm: Record<string, unknown>[]; mapping: Record<string, string> } {
  const mapping: Record<string, string> = {};
  const norm = rows.map((row) => {
    const out: Record<string, unknown> = {};
    for (const [header, value] of Object.entries(row)) {
      const key = header.trim().toLowerCase();
      const field = Object.entries(HEADER_ALIASES).find(([, aliases]) => aliases.includes(key))?.[0];
      if (field) {
        mapping[field] = header;
        out[field] = value;
      }
    }
    return out;
  });
  return { norm, mapping };
}

// dosyadaki durum metni → enum (TR etiketler + enum kodları)
const STATUS_TEXT_MAP: Record<string, string> = {
  taslak: "DRAFT", draft: "DRAFT",
  "gönderildi": "SUBMITTED", "gonderildi": "SUBMITTED", submitted: "SUBMITTED",
  "onay bekliyor": "PENDING_APPROVAL", pending: "PENDING_APPROVAL", pending_approval: "PENDING_APPROVAL",
  "onaylandı": "CONFIRMED", "onaylandi": "CONFIRMED", "onaylı": "CONFIRMED", "onayli": "CONFIRMED", confirmed: "CONFIRMED",
};
const FUNDING_TEXT_MAP: Record<string, string> = {
  "kendi ödemesi": "SELF_PAID", "kendi odemesi": "SELF_PAID", self_paid: "SELF_PAID",
  "kurum ödüyor": "ORGANIZATION_PAID", "kurum oduyor": "ORGANIZATION_PAID", organization_paid: "ORGANIZATION_PAID",
  "sponsor hakkı": "SPONSOR_ENTITLEMENT", sponsor_entitlement: "SPONSOR_ENTITLEMENT",
  "konuk": "HOST_COMPLIMENTARY", "ağırlama": "HOST_COMPLIMENTARY", host_complimentary: "HOST_COMPLIMENTARY",
};

function rowToInput(row: Record<string, unknown>, defaultStatus: string | null, defaultFunding: string) {
  const statusText = String(row.status ?? "").trim().toLowerCase();
  const fundingText = String(row.fundingSource ?? "").trim().toLowerCase();
  const enumStatus = statusText.toUpperCase();
  const enumFunding = fundingText.toUpperCase();
  const status = statusText
    ? (STATUS_TEXT_MAP[statusText] ?? ((MANUAL_STATUSES as readonly string[]).includes(enumStatus) ? enumStatus : null))
    : defaultStatus;
  const fundingSource = fundingText
    ? (FUNDING_TEXT_MAP[fundingText] ?? ((MANUAL_FUNDING as readonly string[]).includes(enumFunding) ? enumFunding : null))
    : defaultFunding;
  return {
    firstName: String(row.firstName ?? "").trim(),
    lastName: String(row.lastName ?? "").trim(),
    email: String(row.email ?? "").trim().toLowerCase() || null,
    phone: String(row.phone ?? "").trim() || null,
    title: String(row.title ?? "").trim() || null,
    company: String(row.company ?? "").trim() || null,
    city: String(row.city ?? "").trim() || null,
    country: String(row.country ?? "").trim() || null,
    categoryText: String(row.category ?? "").trim(),
    status,
    fundingSource,
    notes: String(row.notes ?? "").trim() || null,
  };
}

interface Issue { row: number; name: string; kind: "VALIDATION" | "CATEGORY" | "DUPLICATE_FILE" | "DUPLICATE_DB" | "CAPACITY" | "ERROR"; reason: string }

export async function POST(req: NextRequest) {
  // S3: toplu yazım kapısı — 10 istek/dk/IP
  const denied = enforceRateLimit(req, { key: "reg-import", limit: 10, windowMs: 60_000 });
  if (denied) return denied;
  const staffGate = await requireStaff();
  if (staffGate) return staffGate;

  try {
    const body = (await req.json()) as {
      editionId?: string;
      rows?: Record<string, unknown>[];
      commit?: boolean;
      defaultStatus?: string | null;
      defaultFundingSource?: string | null;
    };
    const editionId = typeof body.editionId === "string" ? body.editionId : "";
    if (!editionId) return NextResponse.json({ error: "editionId zorunludur" }, { status: 400 });
    try {
      await verifyEditionTenant(editionId);
    } catch (e) {
      if (e instanceof GuardError) return NextResponse.json({ error: e.message }, { status: e.status });
      throw e;
    }

    const rawRows = Array.isArray(body.rows) ? body.rows : [];
    if (rawRows.length === 0) return NextResponse.json({ error: "İçe aktarılacak satır yok" }, { status: 400 });
    if (rawRows.length > MAX_ROWS) {
      return NextResponse.json({ error: `Tek istekte en fazla ${MAX_ROWS} satır içe aktarılabilir (gönderilen: ${rawRows.length})` }, { status: 413 });
    }

    const edition = await db.eventEdition.findUnique({ where: { id: editionId }, select: { tenantId: true, name: true } });
    if (!edition) return NextResponse.json({ error: "Etkinlik bulunamadı" }, { status: 404 });

    const defaultStatus = body.defaultStatus && (MANUAL_STATUSES as readonly string[]).includes(body.defaultStatus) ? body.defaultStatus : null;
    const defaultFunding = body.defaultFundingSource && (MANUAL_FUNDING as readonly string[]).includes(body.defaultFundingSource) ? body.defaultFundingSource : "SELF_PAID";

    const { norm, mapping } = normalizeHeaders(rawRows);
    const parsed = norm.map((row) => rowToInput(row, defaultStatus, defaultFunding));

    // ── doğrulama + kategori çözümü + dosya-içi mükerrer analizi ──
    const issues: Issue[] = [];
    const categoryCache = new Map<string, { id: string; name: string } | null>();
    for (let i = 0; i < parsed.length; i++) {
      const r = parsed[i];
      const rowNo = i + 1;
      const name = `${r.firstName} ${r.lastName}`.trim() || `(satır ${rowNo})`;
      if (!r.firstName || !r.lastName) issues.push({ row: rowNo, name, kind: "VALIDATION", reason: "Ad ve soyad zorunludur" });
      if (r.email && !isValidEmail(r.email)) issues.push({ row: rowNo, name, kind: "VALIDATION", reason: `Geçersiz e-posta: ${r.email}` });
      if (r.categoryText && !categoryCache.has(r.categoryText.toLowerCase())) {
        categoryCache.set(r.categoryText.toLowerCase(), await resolveCategoryRef(editionId, r.categoryText));
      }
      if (r.categoryText && !categoryCache.get(r.categoryText.toLowerCase())) {
        issues.push({ row: rowNo, name, kind: "CATEGORY", reason: `Kategori bulunamadı: ${r.categoryText}` });
      }
    }
    // dosya-içi e-posta yinelemesi (ikinci+ geçişler işaretlenir)
    const seenEmail = new Map<string, number>();
    parsed.forEach((r, i) => {
      if (!r.email) return;
      const first = seenEmail.get(r.email);
      if (first != null) {
        issues.push({ row: i + 1, name: `${r.firstName} ${r.lastName}`.trim(), kind: "DUPLICATE_FILE", reason: `Dosyada yinelenen e-posta (satır ${first + 1} ile aynı)` });
      } else {
        seenEmail.set(r.email, i);
      }
    });

    // ── DB mükerrer analizi: e-posta → kişi → bu edisyonda aktif kayıt ──
    const emails = [...new Set(parsed.map((r) => r.email).filter((e): e is string => Boolean(e)))];
    const dupDbEmails = new Map<string, string>(); // email → teyit no
    if (emails.length > 0) {
      const persons = await db.person.findMany({
        where: { tenantId: edition.tenantId, email: { in: emails } },
        select: { id: true, email: true },
      });
      if (persons.length > 0) {
        const participations = await db.eventParticipation.findMany({
          where: { editionId, personId: { in: persons.map((p) => p.id) } },
          select: { id: true, personId: true },
        });
        if (participations.length > 0) {
          const activeRegs = await db.registration.findMany({
            where: { editionId, participationId: { in: participations.map((p) => p.id) }, status: { notIn: ["CANCELLED", "REJECTED"] } },
            select: { participationId: true, confirmationNo: true },
          });
          const personIdByEmail = new Map(persons.map((p) => [p.email!, p.id]));
          const partByPerson = new Map(participations.map((p) => [p.personId, p.id]));
          const regByPart = new Map(activeRegs.map((r) => [r.participationId, r.confirmationNo]));
          for (const email of emails) {
            const conf = regByPart.get(partByPerson.get(personIdByEmail.get(email) ?? "") ?? "");
            if (conf) dupDbEmails.set(email, conf);
          }
        }
      }
    }
    for (let i = 0; i < parsed.length; i++) {
      const r = parsed[i];
      if (!r.email) continue;
      const conf = dupDbEmails.get(r.email);
      if (conf) {
        issues.push({ row: i + 1, name: `${r.firstName} ${r.lastName}`.trim(), kind: "DUPLICATE_DB", reason: `Bu etkinlikte zaten kayıtlı (Teyit: ${conf})` });
      }
    }

    const badRows = new Set(issues.map((x) => x.row));
    const validRows = parsed.filter((_, i) => !badRows.has(i + 1));

    // ── PREVIEW: yazım yok, rapor dön ──
    if (body.commit !== true) {
      return NextResponse.json({
        mode: "preview",
        total: parsed.length,
        valid: validRows.length,
        issues,
        mapping,
        categories: [...categoryCache.entries()].map(([input, resolved]) => ({ input, resolved: resolved?.name ?? null })),
        editionName: edition.name,
      });
    }

    // ── COMMIT: geçerli satırları içe al (kısmi başarı meşru — atlananlar raporlanır) ──
    const actor = await requestActor();
    let actorName = "Yönetici";
    if (actor) {
      const u = await db.user.findUnique({ where: { id: actor.uid }, select: { name: true, role: true } });
      actorName = u?.name ?? actor.role;
    }

    const confirmationNos: string[] = [];
    const skipped: Issue[] = [];
    let imported = 0;

    await withLock(`regman:${editionId}`, async () => {
      for (let i = 0; i < parsed.length; i++) {
        if (badRows.has(i + 1)) continue; // önizlemede yakalananlar zaten atlanır
        const r = parsed[i];
        const name = `${r.firstName} ${r.lastName}`.trim() || `(satır ${i + 1})`;
        try {
          const cat = r.categoryText ? categoryCache.get(r.categoryText.toLowerCase()) ?? null : null;
          const res = await createManualRegistration({
            editionId,
            firstName: r.firstName,
            lastName: r.lastName,
            email: r.email,
            phone: r.phone,
            title: r.title,
            company: r.company,
            city: r.city,
            country: r.country,
            categoryId: cat?.id ?? null,
            status: r.status,
            fundingSource: r.fundingSource,
            notes: r.notes,
            source: "IMPORT",
            actorName,
          });
          confirmationNos.push(res.confirmationNo);
          imported++;
        } catch (e) {
          if (e instanceof ManualRegistrationError) {
            skipped.push({ row: i + 1, name, kind: e.code === "CAPACITY" ? "CAPACITY" : e.code === "DUPLICATE" ? "DUPLICATE_DB" : "ERROR", reason: e.message });
          } else {
            console.error("POST /api/registrations/import [row]", i + 1, e instanceof Error ? e.message : e);
            skipped.push({ row: i + 1, name, kind: "ERROR", reason: "Satır işlenemedi" });
          }
        }
      }
    });

    // özet audit — tek toplu kayıt
    await db.activityLog.create({
      data: {
        tenantId: edition.tenantId,
        editionId,
        type: ActivityType.REGISTRATION_SAVED,
        message: `İçe aktarma tamamlandı: ${imported} kayıt oluşturuldu, ${skipped.length} satır atlandı (${edition.name})`,
        entityType: "Registration",
        actorName,
      },
    });

    return NextResponse.json({ mode: "commit", imported, skipped, confirmationNos: confirmationNos.slice(0, 50), total: parsed.length });
  } catch (e) {
    if (e instanceof ManualRegistrationError) {
      const status = e.code === "EDITION_NOT_FOUND" ? 404 : e.code === "VALIDATION" || e.code === "CATEGORY" ? 400 : 409;
      return NextResponse.json({ error: e.message, code: e.code }, { status });
    }
    console.error("POST /api/registrations/import", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "İçe aktarma tamamlanamadı" }, { status: 500 });
  }
}
