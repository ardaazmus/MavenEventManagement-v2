// ─── P16: Şirket rehberi / etkinlik kişileri kapsam deneyimi ───────────────────
// P16.1: kiracı master listesi (yalnız yetkili roller — rota katmanında kadro
// kapısı); P16.2: edisyona participation ile bağlı kişiler; "etkinliğe ekle"
// master kaydı KOPYALAMAZ, yalnız ilişki kurar; P16.3: hızlı eklemede e-posta
// normalize/dedupe — olası eşleşmede otomatik oluşturma YOK, birleştirme
// kararı kullanıcıya bırakılır.
// NOT: `@/` takma adı YOK — node --test (tip-sıyırma) uyumu için bağımsız.

export class PeopleScopeError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = "PeopleScopeError";
    this.status = status;
  }
}

// ── Normalizasyon (P16.3) ───────────────────────────────────────────────────

export function normalizeEmail(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const v = raw.trim().toLowerCase();
  if (!v || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return null;
  return v;
}

export function normalizeName(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw
    .trim()
    .toLocaleLowerCase("tr-TR")
    .replace(/[^a-zçğıöşü ]/g, "")
    .replace(/\s+/g, " ");
}

export function normalizePhone(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw.replace(/\D/g, "").slice(-10);
}

export function normalizeOrg(raw: unknown): string {
  if (typeof raw !== "string") return "";
  return raw
    .trim()
    .toLocaleLowerCase("tr-TR")
    // \b ASCII-only olduğundan Türkçe harflerde sınır tutmaz — açık sınıf kullanılır.
    .replace(/(^|[^a-zçğıöşü0-9])(a\.ş\.|a\.s\.|ltd\. şti\.?|ltd\.?|şti\.?|inc\.?|gmbh|co\.?|company)(?![a-zçğıöşü0-9])/g, "$1")
    .replace(/[^a-zçğıöşü0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export interface PersonLite {
  id: string;
  tenantId: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  status: string;
}

export type DuplicateReason = "EMAIL" | "NAME_PHONE" | "NAME_ORG";

export interface DuplicateCandidate {
  person: PersonLite;
  reason: DuplicateReason;
}

export function findDuplicateCandidates(existing: PersonLite[], input: { firstName: string; lastName: string; email?: string | null; phone?: string | null; company?: string | null }): DuplicateCandidate[] {
  const email = normalizeEmail(input.email);
  const fullName = `${normalizeName(input.firstName)} ${normalizeName(input.lastName)}`.trim();
  const phone = normalizePhone(input.phone);
  const org = normalizeOrg(input.company);
  const out: DuplicateCandidate[] = [];
  for (const p of existing) {
    if (p.status === "MERGED") continue;
    const pEmail = normalizeEmail(p.email);
    if (email && pEmail && email === pEmail) {
      out.push({ person: p, reason: "EMAIL" });
      continue;
    }
    const pName = `${normalizeName(p.firstName)} ${normalizeName(p.lastName)}`.trim();
    if (fullName && pName && fullName === pName) {
      const pPhone = normalizePhone(p.phone);
      if (phone && pPhone && phone === pPhone) {
        out.push({ person: p, reason: "NAME_PHONE" });
        continue;
      }
      const pOrg = normalizeOrg(p.company);
      if (org && pOrg && org === pOrg) {
        out.push({ person: p, reason: "NAME_ORG" });
      }
    }
  }
  return out;
}

// ── Prisma arayüzü (daraltılmış) ────────────────────────────────────────────

export interface PeopleScopePrisma {
  person: {
    create: (args: { data: Record<string, unknown> }) => Promise<PersonLite & Record<string, unknown>>;
    findMany: (args: { where: Record<string, unknown>; orderBy?: unknown; take?: number }) => Promise<Array<PersonLite & Record<string, unknown>>>;
    findUnique: (args: { where: Record<string, unknown> }) => Promise<(PersonLite & Record<string, unknown>) | null>;
    count: (args: { where: Record<string, unknown> }) => Promise<number>;
  };
  eventParticipation: {
    create: (args: { data: Record<string, unknown> }) => Promise<Record<string, unknown>>;
    findUnique: (args: { where: Record<string, unknown> }) => Promise<Record<string, unknown> | null>;
    findMany: (args: { where: Record<string, unknown>; orderBy?: unknown; take?: number; include?: unknown }) => Promise<Array<Record<string, unknown>>>;
    delete: (args: { where: Record<string, unknown> }) => Promise<Record<string, unknown>>;
  };
  eventEdition: {
    findUnique: (args: { where: Record<string, unknown> }) => Promise<{ id: string; tenantId: string } | null>;
  };
}

async function requireTenantEdition(prisma: PeopleScopePrisma, tenantId: string, editionId: string): Promise<void> {
  const edition = await prisma.eventEdition.findUnique({ where: { id: editionId } });
  if (!edition || edition.tenantId !== tenantId) {
    throw new PeopleScopeError("Etkinlik bulunamadı", 404);
  }
}

async function requireTenantPerson(prisma: PeopleScopePrisma, tenantId: string, personId: string): Promise<PersonLite & Record<string, unknown>> {
  const person = await prisma.person.findUnique({ where: { id: personId } });
  if (!person || (person as PersonLite).tenantId !== tenantId) {
    throw new PeopleScopeError("Kişi bulunamadı", 404);
  }
  return person;
}

// ── P16.1: şirket rehberi (kiracı master) ───────────────────────────────────

export interface DirectoryInput {
  tenantId: string;
  q?: string;
  includeMerged?: boolean;
  limit?: number;
  cursor?: string | null;
}

export interface DirectoryPage {
  items: Array<Record<string, unknown>>;
  nextCursor: string | null;
}

export async function listDirectory(prisma: PeopleScopePrisma, input: DirectoryInput): Promise<DirectoryPage> {
  if (!input.tenantId) throw new PeopleScopeError("tenantId zorunludur", 422);
  const limit = Math.min(Math.max(input.limit ?? 50, 1), 200);
  const where: Record<string, unknown> = { tenantId: input.tenantId };
  if (!input.includeMerged) {
    where.status = { not: "MERGED" };
  }
  const q = (input.q ?? "").trim();
  if (q) {
    where.OR = [
      { firstName: { contains: q } },
      { lastName: { contains: q } },
      { email: { contains: q } },
      { company: { contains: q } },
    ];
  }
  if (input.cursor) {
    const anchor = await prisma.person.findUnique({ where: { id: input.cursor } });
    if (anchor && (anchor as PersonLite).tenantId === input.tenantId) {
      const ts = (anchor as unknown as { createdAt: Date }).createdAt;
      delete where.OR;
      // Kararlı imleç: (createdAt, id) bileşiği.
      where.AND = [
        ...(q
          ? [{ OR: [{ firstName: { contains: q } }, { lastName: { contains: q } }, { email: { contains: q } }, { company: { contains: q } }] }]
          : []),
        { OR: [{ createdAt: { gt: ts } }, { createdAt: ts, id: { gt: input.cursor } }] },
      ];
    }
  }
  const rows = await prisma.person.findMany({
    where,
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: limit + 1,
  });
  const items = rows.slice(0, limit);
  return { items, nextCursor: rows.length > limit ? String(items[items.length - 1].id) : null };
}

// ── P16.2: etkinlik kişileri + ilişki kurma (kopya YOK) ─────────────────────

export interface EventPeopleInput {
  tenantId: string;
  editionId: string;
  q?: string;
  limit?: number;
  cursor?: string | null;
}

export interface EventPeoplePage {
  items: Array<{ participation: Record<string, unknown>; person: Record<string, unknown> }>;
  nextCursor: string | null;
}

export async function listEventPeople(prisma: PeopleScopePrisma, input: EventPeopleInput): Promise<EventPeoplePage> {
  if (!input.tenantId || !input.editionId) throw new PeopleScopeError("tenantId ve editionId zorunludur", 422);
  await requireTenantEdition(prisma, input.tenantId, input.editionId);
  const limit = Math.min(Math.max(input.limit ?? 50, 1), 200);
  const q = (input.q ?? "").trim();
  const where: Record<string, unknown> = { editionId: input.editionId };
  if (q) {
    where.person = {
      is: {
        OR: [{ firstName: { contains: q } }, { lastName: { contains: q } }, { email: { contains: q } }, { company: { contains: q } }],
      },
    };
  }
  if (input.cursor) {
    const anchor = await prisma.eventParticipation.findUnique({ where: { id: input.cursor } });
    const ts = anchor ? (anchor as unknown as { createdAt: Date }).createdAt : null;
    if (anchor && ts) {
      where.AND = [{ editionId: input.editionId }, { OR: [{ createdAt: { gt: ts } }, { createdAt: ts, id: { gt: input.cursor } }] }];
      if (q) {
        (where.AND as unknown[]).push({
          person: { is: { OR: [{ firstName: { contains: q } }, { lastName: { contains: q } }, { email: { contains: q } }, { company: { contains: q } }] } },
        });
        delete where.person;
      }
      delete where.editionId;
    }
  }
  const rows = await prisma.eventParticipation.findMany({
    where,
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: limit + 1,
    include: { person: true },
  });
  const items = rows.slice(0, limit).map((r) => {
    const { person, ...participation } = r as unknown as { person: Record<string, unknown>; [k: string]: unknown };
    return { participation, person };
  });
  return { items, nextCursor: rows.length > limit ? String(items[items.length - 1].participation.id) : null };
}

export interface AttachInput {
  tenantId: string;
  editionId: string;
  personId: string;
  source?: string;
}

export async function attachToEdition(prisma: PeopleScopePrisma, input: AttachInput): Promise<{ participation: Record<string, unknown>; created: boolean }> {
  if (!input.tenantId || !input.editionId || !input.personId) {
    throw new PeopleScopeError("tenantId, editionId ve personId zorunludur", 422);
  }
  await requireTenantEdition(prisma, input.tenantId, input.editionId);
  const person = await requireTenantPerson(prisma, input.tenantId, input.personId);
  if ((person as PersonLite).status === "MERGED") {
    throw new PeopleScopeError("Birleştirilmiş kayıt etkinliğe eklenemez", 409);
  }
  const existing = await prisma.eventParticipation.findUnique({
    where: { editionId_personId: { editionId: input.editionId, personId: input.personId } },
  });
  if (existing) return { participation: existing, created: false };
  const participation = await prisma.eventParticipation.create({
    data: { editionId: input.editionId, personId: input.personId, source: input.source ?? "ADMIN_ENTRY" },
  });
  return { participation, created: true };
}

export async function detachFromEdition(prisma: PeopleScopePrisma, input: { tenantId: string; editionId: string; personId: string }): Promise<{ detached: boolean }> {
  if (!input.tenantId || !input.editionId || !input.personId) {
    throw new PeopleScopeError("tenantId, editionId ve personId zorunludur", 422);
  }
  await requireTenantEdition(prisma, input.tenantId, input.editionId);
  await requireTenantPerson(prisma, input.tenantId, input.personId);
  const existing = await prisma.eventParticipation.findUnique({
    where: { editionId_personId: { editionId: input.editionId, personId: input.personId } },
  });
  if (!existing) return { detached: false };
  // YALNIZ ilişki silinir — master kişi kaydı asla silinmez.
  await prisma.eventParticipation.delete({ where: { id: (existing as unknown as { id: string }).id } });
  return { detached: true };
}

// ── P16.3: hızlı ekleme (normalize/dedupe + birleştirme kararı) ─────────────

export interface QuickAddInput {
  tenantId: string;
  firstName: string;
  lastName: string;
  email?: string | null;
  phone?: string | null;
  company?: string | null;
  title?: string | null;
  editionId?: string | null;
  source?: string;
}

export type QuickAddOutcome =
  | { outcome: "created"; person: Record<string, unknown>; participation: Record<string, unknown> | null }
  | { outcome: "attached"; person: Record<string, unknown>; participation: Record<string, unknown>; createdRelation: boolean }
  | { outcome: "duplicate"; candidates: DuplicateCandidate[] };

export async function quickAddPerson(prisma: PeopleScopePrisma, input: QuickAddInput): Promise<QuickAddOutcome> {
  if (!input.tenantId) throw new PeopleScopeError("tenantId zorunludur", 422);
  const firstName = (input.firstName ?? "").trim();
  const lastName = (input.lastName ?? "").trim();
  if (!firstName || !lastName) throw new PeopleScopeError("Ad ve soyad zorunludur", 422);
  const email = normalizeEmail(input.email);
  if (input.email && !email) throw new PeopleScopeError("E-posta biçimi geçersiz", 422);
  if (input.editionId) await requireTenantEdition(prisma, input.tenantId, input.editionId);

  // Kiracı master'ında aday tara (MERGED hariç — matcher eler).
  const masters = (await prisma.person.findMany({ where: { tenantId: input.tenantId }, take: 5000 })) as unknown as PersonLite[];
  const candidates = findDuplicateCandidates(masters, { firstName, lastName, email, phone: input.phone, company: input.company });
  const exact = candidates.find((c) => c.reason === "EMAIL");

  if (exact) {
    // Kesin eşleşme: yeni master YOK. Edisyon istendiyse ilişki kur, yoksa adayı döndür.
    if (input.editionId) {
      const { participation, created } = await attachToEdition(prisma, {
        tenantId: input.tenantId,
        editionId: input.editionId,
        personId: exact.person.id,
        source: input.source,
      });
      return { outcome: "attached", person: exact.person as unknown as Record<string, unknown>, participation, createdRelation: created };
    }
    return { outcome: "duplicate", candidates };
  }
  if (candidates.length > 0) {
    // Olası eşleşme: otomatik oluşturma YOK — birleştirme kararı kullanıcıda.
    return { outcome: "duplicate", candidates };
  }
  const person = await prisma.person.create({
    data: {
      tenantId: input.tenantId,
      firstName,
      lastName,
      email,
      phone: (input.phone ?? "").trim() || null,
      company: (input.company ?? "").trim() || null,
      title: (input.title ?? "").trim() || null,
    },
  });
  let participation: Record<string, unknown> | null = null;
  if (input.editionId) {
    const attached = await attachToEdition(prisma, {
      tenantId: input.tenantId,
      editionId: input.editionId,
      personId: String(person.id),
      source: input.source,
    });
    participation = attached.participation;
  }
  return { outcome: "created", person, participation };
}
