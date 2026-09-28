// ─── P12: Stand tahsisi domain kapısı ─────────────────────────────────────────
// Kurallar:
//  * agreementId ZORUNLU ve açıkça seçilmiş olmalı (otomatik ilk-eşleşme yok).
//  * Anlaşma standla AYNI edition'da ve CONTRACTED|ACTIVE durumunda olmalı
//    (kesin tahsis sözleşmesiz olmaz).
//  * organizationId verilirse anlaşmanın kurumuyla eşleşmeli; verilmezse türetilir.
//  * Stant AVAILABLE|HELD|OPTION|RELEASED olmalı; aktif tahsisli standa 409.
//  * Serbest kalmış (releasedAt) satır güncellenerek yeniden tahsis edilir.
//  * Karar + yazım transaction içinde; P2002 yarışı 409'a çevrilir.
export const ALLOCATABLE_BOOTH_STATUSES = ["AVAILABLE", "HELD", "OPTION", "RELEASED"] as const;
export const ALLOCATABLE_AGREEMENT_STATUSES = ["CONTRACTED", "ACTIVE"] as const;

export interface BoothTx {
  boothUnit: {
    findUnique: (args: { where: Record<string, unknown> }) => Promise<{
      id: string;
      editionId: string;
      code: string;
      status: string;
    } | null>;
    update: (args: { where: Record<string, unknown>; data: Record<string, unknown> }) => Promise<unknown>;
  };
  sponsorAgreement: {
    findUnique: (args: { where: Record<string, unknown> }) => Promise<{
      id: string;
      editionId: string;
      organizationId: string;
      status: string;
    } | null>;
  };
  boothAllocation: {
    findUnique: (args: { where: Record<string, unknown> }) => Promise<{
      id: string;
      releasedAt: Date | null;
      status: string;
    } | null>;
    create: (args: { data: Record<string, unknown> }) => Promise<Record<string, unknown> & { id: string; status: string; organizationId: string | null }>;
    update: (args: { where: Record<string, unknown>; data: Record<string, unknown> }) => Promise<Record<string, unknown> & { id: string; status: string; organizationId: string | null }>;
  };
}

export interface BoothPrisma {
  $transaction: <T>(fn: (tx: BoothTx) => Promise<T>) => Promise<T>;
}

export interface AllocateBoothInput {
  boothUnitId: string;
  agreementId: string;
  organizationId?: string | null;
}

export type AllocateBoothResult =
  | { ok: true; allocation: { id: string; status: string; organizationId: string | null } }
  | { ok: false; error: string; status: number };

function errorKind(e: unknown): "unique" | "busy" | "other" {
  const msg = e instanceof Error ? `${e.message} ${(e as { code?: string }).code ?? ""}` : String(e);
  if (/P2002|Unique constraint/i.test(msg)) return "unique";
  if (/database is locked|SQLITE_BUSY|P2034|P2028|write conflict|deadlock/i.test(msg)) return "busy";
  return "other";
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function allocateBooth(prisma: BoothPrisma, input: AllocateBoothInput): Promise<AllocateBoothResult> {
  if (!input.boothUnitId || !input.agreementId) {
    return { ok: false, error: "boothUnitId ve agreementId zorunludur", status: 400 };
  }
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await prisma.$transaction(async (tx) => {
        const booth = await tx.boothUnit.findUnique({ where: { id: input.boothUnitId } });
        if (!booth) return { ok: false as const, error: "Stant bulunamadı", status: 404 };
        if (!(ALLOCATABLE_BOOTH_STATUSES as readonly string[]).includes(booth.status)) {
          return { ok: false as const, error: `Stant ${booth.status} durumunda — tahsis edilemez`, status: 409 };
        }
        const agreement = await tx.sponsorAgreement.findUnique({ where: { id: input.agreementId } });
        if (!agreement) return { ok: false as const, error: "Anlaşma bulunamadı", status: 404 };
        if (agreement.editionId !== booth.editionId) {
          return { ok: false as const, error: "Anlaşma bu standın etkinliğine ait değil (cross-edition)", status: 400 };
        }
        if (!(ALLOCATABLE_AGREEMENT_STATUSES as readonly string[]).includes(agreement.status)) {
          return {
            ok: false as const,
            error: `Kesin tahsis için anlaşma CONTRACTED ya da ACTIVE olmalı (mevcut: ${agreement.status})`,
            status: 400,
          };
        }
        if (input.organizationId != null && input.organizationId !== agreement.organizationId) {
          return { ok: false as const, error: "Kurum anlaşmanın kurumuyla eşleşmiyor", status: 400 };
        }
        const existing = await tx.boothAllocation.findUnique({ where: { boothUnitId: booth.id } });
        if (existing && existing.releasedAt == null) {
          return { ok: false as const, error: "Stand zaten tahsisli — önce serbest bırakın", status: 409 };
        }
        const data = {
          agreementId: agreement.id,
          organizationId: agreement.organizationId,
          status: "RESERVED",
          allocatedAt: new Date(),
          releasedAt: null,
        };
        const allocation = existing
          ? await tx.boothAllocation.update({ where: { id: existing.id }, data })
          : await tx.boothAllocation.create({ data: { boothUnitId: booth.id, ...data } });
        await tx.boothUnit.update({ where: { id: booth.id }, data: { status: "RESERVED" } });
        return { ok: true as const, allocation };
      });
    } catch (e) {
      const kind = errorKind(e);
      if (kind === "unique") {
        return { ok: false, error: "Stand tahsisi çakışması — başka işlem önce yerleşti", status: 409 };
      }
      if (kind === "busy") {
        if (attempt < 3) {
          await sleep(25 * (attempt + 1));
          continue;
        }
        return { ok: false, error: "Stand tahsisi çakışması — yeniden deneyin", status: 409 };
      }
      throw e;
    }
  }
}
