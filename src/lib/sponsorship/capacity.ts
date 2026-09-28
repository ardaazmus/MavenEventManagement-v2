// ─── P10: Tier/package korumaları + atomik kapasite ────────────────────────────
// Tier kapasitesi CONTRACTED/ACTIVE anlaşmaları sayar. Kapasite kontrolü +
// yazım AYNI transaction içinde yapılır (SQLite tek-yazıcı serileştirme;
// Postgres'e geçişte SELECT..FOR UPDATE notu aşağıda). Kilit çakışmasında
// sınırlı retry uygulanır; kaybeden taraf temiz 409 alır.
// Silme koruması: paket/anlaşma bağlı tier ve anlaşma bağlı paket hard
// delete edilemez (409); arşiv/pasifleştirme ürün kararı olarak ayrı fazda.
import { canTransition } from "./transitions.ts";

export const COUNTED_STATUSES = ["CONTRACTED", "ACTIVE"] as const;

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim() !== "";
}

function isNonNegInt(v: unknown): v is number {
  return typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= 2147483647;
}

export function validateTierInput(data: Record<string, unknown>, isUpdate: boolean): string | null {
  if (!isUpdate && !isNonEmptyString(data.name)) return "Seviye adı zorunludur";
  if ("name" in data && data.name != null && !isNonEmptyString(data.name)) return "Seviye adı boş olamaz";
  if ("capacity" in data && data.capacity != null && !isNonNegInt(data.capacity)) {
    return "capacity null (sınırsız) ya da 0 ve üzeri tamsayı olmalı";
  }
  if ("price" in data && data.price != null && !isNonNegInt(data.price)) {
    return "price 0 ve üzeri tamsayı kuruş olmalı";
  }
  if ("currency" in data && data.currency != null && (typeof data.currency !== "string" || !/^[A-Z]{3}$/.test(data.currency))) {
    return "currency 3 harfli büyük kod olmalı (örn. TRY)";
  }
  return null;
}

export function validatePackageInput(data: Record<string, unknown>, isUpdate: boolean): string | null {
  if (!isUpdate && !isNonEmptyString(data.name)) return "Paket adı zorunludur";
  if ("name" in data && data.name != null && !isNonEmptyString(data.name)) return "Paket adı boş olamaz";
  if ("price" in data && data.price != null && !isNonNegInt(data.price)) {
    return "price 0 ve üzeri tamsayı kuruş olmalı";
  }
  if ("currency" in data && data.currency != null && (typeof data.currency !== "string" || !/^[A-Z]{3}$/.test(data.currency))) {
    return "currency 3 harfli büyük kod olmalı (örn. TRY)";
  }
  return null;
}

export interface DeleteGuardPrisma {
  sponsorPackage: { count: (args: { where: Record<string, unknown> }) => Promise<number> };
  sponsorAgreement: { count: (args: { where: Record<string, unknown> }) => Promise<number> };
}

export async function guardTierDelete(prisma: DeleteGuardPrisma, tierId: string): Promise<string | null> {
  const [packages, agreements] = await Promise.all([
    prisma.sponsorPackage.count({ where: { tierId } }),
    prisma.sponsorAgreement.count({ where: { tierId } }),
  ]);
  if (packages + agreements > 0) {
    return `Bu seviye kullanımda (${packages} paket, ${agreements} anlaşma); önce bağlantıları taşıyın`;
  }
  return null;
}

export async function guardPackageDelete(prisma: DeleteGuardPrisma, packageId: string): Promise<string | null> {
  const agreements = await prisma.sponsorAgreement.count({ where: { packageId } });
  if (agreements > 0) {
    return `Bu paket kullanımda (${agreements} anlaşma); önce bağlantıları taşıyın`;
  }
  return null;
}

export interface CapacityTx {
  sponsorAgreement: {
    findUnique: (args: { where: Record<string, unknown>; select?: unknown }) => Promise<{
      id: string;
      status: string;
      signedAt: Date | string | null;
      tierId: string | null;
    } | null>;
    count: (args: { where: Record<string, unknown> }) => Promise<number>;
    update: (args: { where: Record<string, unknown>; data: Record<string, unknown> }) => Promise<Record<string, unknown>>;
  };
  sponsorTierDefinition: {
    findUnique: (args: { where: Record<string, unknown>; select?: unknown }) => Promise<{
      id: string;
      capacity: number | null;
    } | null>;
  };
}

export interface CapacityPrisma {
  $transaction: <T>(fn: (tx: CapacityTx) => Promise<T>) => Promise<T>;
}

export interface CapacityTransitionInput {
  actorMaxRank: number;
  agreementId: string;
  data: Record<string, unknown>;
}

export type CapacityTransitionResult =
  | { ok: true; row: Record<string, unknown>; audit: { from: string; to: string; kind: string; reason: string | null } | null }
  | { ok: false; error: string; status: number };

function isBusyError(e: unknown): boolean {
  const msg = e instanceof Error ? `${e.message} ${(e as { code?: string }).code ?? ""}` : String(e);
  return /database is locked|SQLITE_BUSY|P2034|P2028|write conflict|deadlock/i.test(msg);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function transitionSponsorAgreement(
  prisma: CapacityPrisma,
  input: CapacityTransitionInput,
  retries = 3,
): Promise<CapacityTransitionResult> {
  let attempt = 0;
  for (;;) {
    try {
      return await prisma.$transaction(async (tx) => {
        const clean: Record<string, unknown> = { ...input.data };
        delete clean.transitionReason;
        const to = clean.status;
        if (typeof to !== "string") {
          const row = await tx.sponsorAgreement.update({ where: { id: input.agreementId }, data: clean });
          return { ok: true as const, row, audit: null };
        }
        const existing = await tx.sponsorAgreement.findUnique({
          where: { id: input.agreementId },
          select: { id: true, status: true, signedAt: true, tierId: true },
        });
        if (!existing) return { ok: false as const, error: "Kayıt bulunamadı", status: 400 };
        const reason = typeof input.data.transitionReason === "string" ? input.data.transitionReason : null;
        const signedAt = (clean.signedAt as string | Date | undefined) ?? existing.signedAt ?? null;
        const decision = canTransition(existing.status, to, { actorMaxRank: input.actorMaxRank, reason, signedAt });
        if (!decision.allowed) {
          return {
            ok: false as const,
            error: decision.error ?? "Geçişe izin yok",
            status: /yönetici yetkisi/.test(decision.error ?? "") ? 403 : 400,
          };
        }
        // Kapasite: sayılan kümeye YENİ girişlerde slot denetimi (transaction içi).
        // Postgres notu: bu SELECT + UPDATE çifti FOR UPDATE kilidi ister.
        const counted = COUNTED_STATUSES as readonly string[];
        const nextTierId = typeof clean.tierId === "string" ? clean.tierId : existing.tierId;
        const entersCounted = counted.includes(to) && (!counted.includes(existing.status) || nextTierId !== existing.tierId);
        if (entersCounted && nextTierId) {
          const tier = await tx.sponsorTierDefinition.findUnique({
            where: { id: nextTierId },
            select: { id: true, capacity: true },
          });
          if (tier && tier.capacity != null) {
            const used = await tx.sponsorAgreement.count({
              where: { tierId: nextTierId, status: { in: [...counted] }, id: { not: input.agreementId } },
            });
            if (used >= tier.capacity) {
              return { ok: false as const, error: `Seviye kapasitesi doldu (${used}/${tier.capacity})`, status: 409 };
            }
          }
        }
        const row = await tx.sponsorAgreement.update({ where: { id: input.agreementId }, data: clean });
        return {
          ok: true as const,
          row,
          audit: decision.kind === "noop" ? null : { from: existing.status, to, kind: decision.kind ?? "forward", reason },
        };
      });
    } catch (e) {
      if (attempt < retries && isBusyError(e)) {
        attempt += 1;
        await sleep(25 * attempt);
        continue;
      }
      throw e;
    }
  }
}
