// ─── P18.3: DSAR derleyici — kişi verisi paketi (JSON/CSV) ─────────────────────
// Kapsam: kişi master + katılımlar + kayıtlar + siparişler + rızalar +
// müşteri-datası + silme talepleri. Kiracı kapsamı zorunlu.
// NOT: `@/` takma adı YOK — node --test (tip-sıyırma) uyumu için bağımsız.

export class DsarError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = "DsarError";
    this.status = status;
  }
}

export interface DsarPrisma {
  person: {
    findUnique: (args: { where: Record<string, unknown> }) => Promise<Record<string, unknown> | null>;
  };
  eventParticipation: {
    findMany: (args: { where: Record<string, unknown>; include?: unknown }) => Promise<Array<Record<string, unknown>>>;
  };
  registration: {
    findMany: (args: { where: Record<string, unknown>; include?: unknown }) => Promise<Array<Record<string, unknown>>>;
  };
  order: {
    findMany: (args: { where: Record<string, unknown> }) => Promise<Array<Record<string, unknown>>>;
  };
  contactConsent: {
    findMany: (args: { where: Record<string, unknown> }) => Promise<Array<Record<string, unknown>>>;
  };
  customerContact: {
    findMany: (args: { where: Record<string, unknown> }) => Promise<Array<Record<string, unknown>>>;
  };
  kvkkErasureRequest: {
    findMany: (args: { where: Record<string, unknown> }) => Promise<Array<Record<string, unknown>>>;
  };
}

export interface DsarBundle {
  exportedAt: string;
  person: Record<string, unknown>;
  participations: Array<Record<string, unknown>>;
  registrations: Array<Record<string, unknown>>;
  orders: Array<Record<string, unknown>>;
  consents: Array<Record<string, unknown>>;
  contacts: Array<Record<string, unknown>>;
  erasures: Array<Record<string, unknown>>;
}

export async function buildDsarBundle(
  prisma: DsarPrisma,
  input: { tenantId: string; personId: string },
): Promise<DsarBundle> {
  if (!input.tenantId || !input.personId) throw new DsarError("tenantId ve personId zorunludur", 422);
  const person = (await prisma.person.findUnique({ where: { id: input.personId } })) as unknown as {
    tenantId: string; email: string | null;
  } | null;
  if (!person || person.tenantId !== input.tenantId) {
    throw new DsarError("Kişi bulunamadı", 404);
  }
  const emailNorm = typeof person.email === "string" ? person.email.trim().toLowerCase() : null;
  const [participations, registrations, orders, consents, contacts, erasures] = await Promise.all([
    prisma.eventParticipation.findMany({
      where: { personId: input.personId },
      include: { edition: { select: { id: true, name: true, slug: true } } },
    }),
    prisma.registration.findMany({
      where: { participation: { personId: input.personId } },
      include: { participation: { select: { editionId: true } }, category: { select: { name: true } } },
    }),
    prisma.order.findMany({ where: { buyerPersonId: input.personId } }),
    prisma.contactConsent.findMany({
      where: emailNorm ? { tenantId: input.tenantId, channel: "EMAIL", address: emailNorm } : { tenantId: input.tenantId, id: "__yok__" },
    }),
    prisma.customerContact.findMany({ where: { personId: input.personId } }),
    prisma.kvkkErasureRequest.findMany({ where: { tenantId: input.tenantId, personId: input.personId } }),
  ]);
  return {
    exportedAt: new Date().toISOString(),
    person: person as unknown as Record<string, unknown>,
    participations,
    registrations,
    orders,
    consents,
    contacts,
    erasures,
  };
}

export function csvCell(v: unknown): string {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function dsarToCsv(bundle: DsarBundle): string {
  const lines = ["bolum,id,ozet,olusturma"];
  const iso = (r: Record<string, unknown>): string =>
    r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt ?? "");
  for (const p of bundle.participations) {
    const ed = (p.edition ?? {}) as { name?: string };
    lines.push(
      ["katilim", p.id, `${ed.name ?? p.editionId} / ${p.attendance}`, iso(p)].map(csvCell).join(","),
    );
  }
  for (const r of bundle.registrations) {
    const cat = (r.category ?? {}) as { name?: string };
    lines.push(["kayit", r.id, `${r.status} / ${cat.name ?? "-"}`, iso(r)].map(csvCell).join(","));
  }
  for (const o of bundle.orders) {
    lines.push(["siparis", o.id, `${o.status} / ${o.totalAmount}${o.currency}`, iso(o)].map(csvCell).join(","));
  }
  for (const c of bundle.consents) {
    lines.push(["riza", c.id, `${c.channel} / ${c.purpose} / ${c.status}`, iso(c)].map(csvCell).join(","));
  }
  const person = bundle.person as { firstName?: string; lastName?: string; email?: string | null };
  const head = [
    "# DSAR — kişi verisi",
    `# kisi: ${person.firstName ?? ""} ${person.lastName ?? ""} <${person.email ?? "-"}>`,
    `# uretim: ${bundle.exportedAt}`,
  ].join("\n");
  return `${head}\n${lines.join("\n")}\n`;
}
