// ─── P08.2: Sponsor durum geçişi zorlaması (generic PUT bypass'ı kapalı) ───────
// Item route sponsor-agreements + status içeren güncellemelerde bu kararı
// update ÖNCESİ çalıştırır. transitionReason yardımcı alanı Prisma'ya gitmez;
// denetim kaydına taşınır. Rütbe yetersizliği 403, kural ihlali 400 üretir.
import { canTransition } from "./transitions.ts";

export interface TransitionPrisma {
  sponsorAgreement: {
    findUnique: (args: { where: Record<string, unknown>; select?: unknown }) => Promise<{
      id: string;
      status: string;
      signedAt: Date | string | null;
    } | null>;
  };
}

export interface DecideTransitionInput {
  actorMaxRank: number;
  agreementId: string;
  data: Record<string, unknown>;
}

export interface TransitionAudit {
  from: string;
  to: string;
  kind: "noop" | "forward" | "cancel" | "reopen";
  reason: string | null;
}

export type DecideTransitionResult =
  | { ok: true; data: Record<string, unknown>; audit: TransitionAudit | null }
  | { ok: false; error: string; status: number };

function stripHelper(data: Record<string, unknown>): Record<string, unknown> {
  const out = { ...data };
  delete out.transitionReason;
  return out;
}

export async function decideSponsorStatusChange(
  prisma: TransitionPrisma,
  input: DecideTransitionInput,
): Promise<DecideTransitionResult> {
  const clean = stripHelper(input.data);
  const to = clean.status;
  if (typeof to !== "string") {
    return { ok: true, data: clean, audit: null };
  }
  const existing = await prisma.sponsorAgreement.findUnique({
    where: { id: input.agreementId },
    select: { id: true, status: true, signedAt: true },
  });
  if (!existing) {
    // Kayıt yoksa item-route 400'e düşer; geçiş kararı anlamsız.
    return { ok: true, data: clean, audit: null };
  }
  const reason = typeof input.data.transitionReason === "string" ? input.data.transitionReason : null;
  const signedAt = (clean.signedAt as string | Date | undefined) ?? existing.signedAt ?? null;
  const decision = canTransition(existing.status, to, {
    actorMaxRank: input.actorMaxRank,
    reason,
    signedAt,
  });
  if (!decision.allowed) {
    const status = /yönetici yetkisi/.test(decision.error ?? "") ? 403 : 400;
    return { ok: false, error: decision.error ?? "Geçişe izin yok", status };
  }
  if (decision.kind === "noop") {
    return { ok: true, data: clean, audit: null };
  }
  return {
    ok: true,
    data: clean,
    audit: { from: existing.status, to, kind: decision.kind ?? "forward", reason },
  };
}
