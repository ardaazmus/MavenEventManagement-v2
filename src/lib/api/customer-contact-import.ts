// ─── MÜŞTERİ DATASI DOSYA İÇE AKTARMA ÇEKİRDEĞİ (xlsx/csv → CustomerContact) ──
// Kullanıcı ilkesi: "tek bir veri girişi kaynağı olmamalı" — kontak havuzuna dosya
// yükleme yüzeyi (firma listeleri, e-postayla gelen tekil/çoklu listeler).
// REG-IO iki-fazlı sözleşme:
//   1) commit !== true → PREVIEW: satırlar normalize+doğrulanır, oluşturma/birleştirme
//      planı ve sorunlar raporlanır — HİÇBİR YAZIM YAPILMAZ.
//   2) commit === true → COMMIT: geçerli satırlar işlenir. DB'de e-posta/telefon
//      eşleşen kontak YENİDEN YARATILMAZ — zenginleştirilir (importParticipantsToCustomers
//      ile aynı birleştirme ilkesi: boş alanlar doldurulur, etiket eklenir).
// Dosya istemcide (SheetJS) parse edilip JSON satırları gönderilir; sunucu ASLA
// istemciye güvenmez — aynı doğrulama commit'te yeniden koşar (defense in depth).
import { db } from "@/lib/db";
import { BroadcastError } from "@/lib/api/comms-broadcast";
import { withLock } from "@/lib/tx-lock";

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
export const MAX_IMPORT_ROWS = 1000;

// başlık normalizasyonu — TR/EN yaygın kolon adları (küçük harfe indirilir)
const HEADER_ALIASES: Record<string, string[]> = {
  displayName: ["ad soyad", "adı soyadı", "adi soyadi", "isim", "isim soyisim", "ad", "adı", "adi", "name", "full name", "fullname", "contact name", "kişi", "kisi"],
  email: ["e-posta", "eposta", "e posta", "email", "e-mail", "mail"],
  phone: ["telefon", "tel", "gsm", "cep", "phone", "mobile", "whatsapp"],
  company: ["kurum", "kuruluş", "kurulus", "firma", "şirket", "sirket", "company", "organization", "organisation", "organizasyon"],
  title: ["unvan", "ünvan", "title", "pozisyon", "görev", "gorev", "job title"],
  city: ["şehir", "sehir", "city"],
  country: ["ülke", "ulke", "country"],
  kind: ["tür", "tur", "tip", "type", "kayıt türü", "kayit turu"],
  category: ["kategori", "category", "segment"],
  tags: ["etiket", "etiketler", "tags", "tag"],
  notes: ["not", "notlar", "notes", "açıklama", "aciklama"],
};

export function normalizeContactHeaders(rows: Record<string, unknown>[]): {
  norm: Record<string, unknown>[];
  mapping: Record<string, string>;
} {
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

const KIND_PERSON_WORDS = new Set(["kişi", "kisi", "person", "birey", "şahıs", "sahis"]);
const KIND_ORG_WORDS = new Set(["kurum", "kuruluş", "kurulus", "organization", "organisation", "firma", "şirket", "sirket", "org"]);

export interface ContactRowInput {
  displayName: string;
  kind: "PERSON" | "ORGANIZATION";
  kindText: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  title: string | null;
  city: string | null;
  country: string | null;
  category: string | null;
  tags: string | null;
  notes: string | null;
}

export function parseContactRow(row: Record<string, unknown>): ContactRowInput {
  const s = (k: string) => String(row[k] ?? "").trim();
  const email = s("email").toLowerCase() || null;
  const phoneRaw = s("phone");
  const phone = phoneRaw ? phoneRaw.replace(/[^\d+]/g, "") || null : null;
  return {
    displayName: s("displayName"),
    kindText: s("kind"),
    kind: KIND_ORG_WORDS.has(s("kind").toLowerCase()) ? "ORGANIZATION" : "PERSON",
    email,
    phone,
    company: s("company") || null,
    title: s("title") || null,
    city: s("city") || null,
    country: s("country") || null,
    category: s("category") || null,
    tags: s("tags") || null,
    notes: s("notes") || null,
  };
}

export interface ImportIssue {
  row: number;
  name: string;
  kind: "VALIDATION" | "DUPLICATE_FILE";
  reason: string;
}

export interface MergePlanEntry {
  row: number;
  incoming: string;
  existing: string;
  fills: string[]; // mevcut kontakta boş olup dosyadan doldurulacak alanlar
}

export interface ContactPreview {
  mode: "preview";
  total: number;
  valid: number;
  toCreate: number;
  toMerge: number;
  issues: ImportIssue[];
  mergePlan: MergePlanEntry[];
  mapping: Record<string, string>;
  sample: { row: number; name: string; email: string | null; phone: string | null; company: string | null; action: "create" | "merge" }[];
}

export interface CommitResult {
  mode: "commit";
  created: number;
  merged: number;
  skippedFileDup: number;
  failed: number;
  total: number;
}

// doğrulama + mükerrer analizi (preview ve commit ortak yol — defense in depth)
function validateRows(parsed: ContactRowInput[]): { issues: ImportIssue[]; validIndexes: number[] } {
  const issues: ImportIssue[] = [];
  const seenEmail = new Map<string, number>();
  const seenPhone = new Map<string, number>();
  for (let i = 0; i < parsed.length; i++) {
    const r = parsed[i];
    const rowNo = i + 1;
    const name = r.displayName || `(satır ${rowNo})`;
    if (!r.displayName) issues.push({ row: rowNo, name, kind: "VALIDATION", reason: "Ad / kurum adı zorunludur" });
    if (!r.email && !r.phone) issues.push({ row: rowNo, name, kind: "VALIDATION", reason: "E-posta veya telefon en az biri zorunludur" });
    if (r.email && !EMAIL_RE.test(r.email)) issues.push({ row: rowNo, name, kind: "VALIDATION", reason: `Geçersiz e-posta: ${r.email}` });
    if (r.kindText && !KIND_PERSON_WORDS.has(r.kindText.toLowerCase()) && !KIND_ORG_WORDS.has(r.kindText.toLowerCase())) {
      issues.push({ row: rowNo, name, kind: "VALIDATION", reason: `Tür anlaşılamadı: ${r.kindText} (kişi veya kurum yazın)` });
    }
    // dosya-içi yineleme — İLK satır kazanır, sonrakiler işaretlenir
    if (r.email) {
      const first = seenEmail.get(r.email);
      if (first != null) issues.push({ row: rowNo, name, kind: "DUPLICATE_FILE", reason: `Dosyada yinelenen e-posta (satır ${first + 1} ile aynı)` });
      else seenEmail.set(r.email, i);
    }
    if (r.phone && !r.email) {
      const first = seenPhone.get(r.phone);
      if (first != null) issues.push({ row: rowNo, name, kind: "DUPLICATE_FILE", reason: `Dosyada yinelenen telefon (satır ${first + 1} ile aynı)` });
      else seenPhone.set(r.phone, i);
    }
  }
  const badRows = new Set(issues.map((x) => x.row));
  const validIndexes = parsed.map((_, i) => i).filter((i) => !badRows.has(i + 1));
  return { issues, validIndexes };
}

async function findExistingContacts(tenantId: string, parsed: ContactRowInput[]) {
  const emails = [...new Set(parsed.map((r) => r.email).filter((e): e is string => Boolean(e)))];
  const phones = [...new Set(parsed.map((r) => r.phone).filter((p): p is string => Boolean(p)))];
  if (emails.length === 0 && phones.length === 0) return { byEmail: new Map<string, ExistingContact>(), byPhone: new Map<string, ExistingContact>() };
  const existing = await db.customerContact.findMany({
    where: {
      tenantId,
      OR: [...(emails.length ? [{ email: { in: emails } }] : []), ...(phones.length ? [{ phone: { in: phones } }] : [])],
    },
    select: {
      id: true, displayName: true, email: true, phone: true, company: true, title: true,
      city: true, country: true, category: true, tags: true, notes: true,
    },
  });
  const byEmail = new Map<string, ExistingContact>();
  const byPhone = new Map<string, ExistingContact>();
  for (const c of existing) {
    if (c.email && !byEmail.has(c.email)) byEmail.set(c.email, c);
    if (c.phone && !byPhone.has(c.phone)) byPhone.set(c.phone, c);
  }
  return { byEmail, byPhone };
}

type ExistingContact = {
  id: string; displayName: string; email: string | null; phone: string | null;
  company: string | null; title: string | null; city: string | null; country: string | null;
  category: string | null; tags: string | null; notes: string | null;
};

function mergeFillFields(existing: ExistingContact, r: ContactRowInput): string[] {
  const fills: string[] = [];
  if (!existing.company && r.company) fills.push("kurum");
  if (!existing.title && r.title) fills.push("unvan");
  if (!existing.city && r.city) fills.push("şehir");
  if (!existing.country && r.country) fills.push("ülke");
  if (!existing.category && r.category) fills.push("kategori");
  if (!existing.notes && r.notes) fills.push("not");
  if (!existing.phone && r.phone) fills.push("telefon");
  if (!existing.email && r.email) fills.push("e-posta");
  return fills;
}

function unionTags(...lists: (string | null | undefined)[]): string | null {
  const set = new Set<string>();
  for (const list of lists) {
    for (const t of (list ?? "").split(",").map((s) => s.trim()).filter(Boolean)) set.add(t);
  }
  return set.size ? [...set].join(",") : null;
}

// ─── FAZ 1: PREVIEW — yazım yok, plan + sorunlar ────────────────────────────
export async function previewContactImport(opts: { tenantId: string; rows: Record<string, unknown>[] }): Promise<ContactPreview> {
  const { norm, mapping } = normalizeContactHeaders(opts.rows);
  const parsed = norm.map(parseContactRow);
  const { issues, validIndexes } = validateRows(parsed);
  const { byEmail, byPhone } = await findExistingContacts(opts.tenantId, parsed);

  const mergePlan: MergePlanEntry[] = [];
  const sample: ContactPreview["sample"] = [];
  let toCreate = 0;
  let toMerge = 0;
  for (const i of validIndexes) {
    const r = parsed[i];
    const rowNo = i + 1;
    const existing = (r.email ? byEmail.get(r.email) : undefined) ?? (r.phone ? byPhone.get(r.phone) : undefined);
    if (existing) {
      const fills = mergeFillFields(existing, r);
      mergePlan.push({ row: rowNo, incoming: r.displayName, existing: existing.displayName, fills });
      toMerge += 1;
      if (sample.length < 8) sample.push({ row: rowNo, name: r.displayName, email: r.email, phone: r.phone, company: r.company, action: "merge" });
    } else {
      toCreate += 1;
      if (sample.length < 8) sample.push({ row: rowNo, name: r.displayName, email: r.email, phone: r.phone, company: r.company, action: "create" });
    }
  }

  return { mode: "preview", total: parsed.length, valid: validIndexes.length, toCreate, toMerge, issues, mergePlan, mapping, sample };
}

// ─── FAZ 2: COMMIT — yarat / birleştir (kısmi başarı meşru) ─────────────────
export async function commitContactImport(opts: {
  tenantId: string;
  rows: Record<string, unknown>[];
  tag?: string | null;
  actorName: string;
}): Promise<CommitResult> {
  const { norm } = normalizeContactHeaders(opts.rows);
  const parsed = norm.map(parseContactRow);
  const { issues, validIndexes } = validateRows(parsed);
  const badRows = new Set(issues.map((x) => x.row));
  const skippedFileDup = issues.filter((x) => x.kind === "DUPLICATE_FILE").length;

  let created = 0;
  let merged = 0;
  let failed = 0;

  await withLock(`ccimport:${opts.tenantId}`, async () => {
    // kilit altında taze mükerrer analizi (yarış koruması)
    const { byEmail, byPhone } = await findExistingContacts(opts.tenantId, parsed);
    for (const i of validIndexes) {
      if (badRows.has(i + 1)) continue;
      const r = parsed[i];
      try {
        const existing = (r.email ? byEmail.get(r.email) : undefined) ?? (r.phone ? byPhone.get(r.phone) : undefined);
        if (existing) {
          await db.customerContact.update({
            where: { id: existing.id },
            data: {
              displayName: existing.displayName || r.displayName,
              email: existing.email ?? r.email,
              phone: existing.phone ?? r.phone,
              company: existing.company ?? r.company,
              title: existing.title ?? r.title,
              city: existing.city ?? r.city,
              country: existing.country ?? r.country,
              category: existing.category ?? r.category,
              notes: existing.notes ?? r.notes,
              tags: unionTags(existing.tags, r.tags, opts.tag),
            },
          });
          merged += 1;
        } else {
          const made = await db.customerContact.create({
            data: {
              tenantId: opts.tenantId,
              kind: r.kind,
              displayName: r.displayName,
              email: r.email,
              phone: r.phone,
              company: r.company,
              title: r.title,
              city: r.city,
              country: r.country,
              category: r.category,
              notes: r.notes,
              source: "IMPORT",
              tags: unionTags(r.tags, opts.tag),
              commsOptIn: true,
            },
            select: { id: true, email: true, phone: true },
          });
          // yarış koruması: aynı koşumda sonraki satırlar bu kontakla eşleşsin
          const asExisting: ExistingContact = {
            id: made.id, displayName: r.displayName, email: made.email, phone: made.phone,
            company: r.company, title: r.title, city: r.city, country: r.country,
            category: r.category, tags: unionTags(r.tags, opts.tag), notes: r.notes,
          };
          if (made.email) byEmail.set(made.email, asExisting);
          if (made.phone) byPhone.set(made.phone, asExisting);
          created += 1;
        }
      } catch (e) {
        console.error("commitContactImport [row]", i + 1, e instanceof Error ? e.message : e);
        failed += 1;
      }
    }
  });

  await db.activityLog.create({
    data: {
      tenantId: opts.tenantId,
      type: "CAMPAIGN_SAVED",
      message: `Müşteri datası dosya içe aktarma: ${created} yeni, ${merged} birleştirildi, ${skippedFileDup + failed} atlandı`,
      entityType: "customer-contact",
      actorName: opts.actorName,
    },
  });

  return { mode: "commit", created, merged, skippedFileDup, failed, total: parsed.length };
}
