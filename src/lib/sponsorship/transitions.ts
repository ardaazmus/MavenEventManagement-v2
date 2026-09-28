// ─── P08.1: Sponsor anlaşması durum makinesi (saf geçiş fonksiyonu) ───────────
// İleri akış: PROSPECT → NEGOTIATION → CONTRACTED → ACTIVE → COMPLETED.
// Yan çıkış: PROSPECT|NEGOTIATION|CONTRACTED|ACTIVE → CANCELLED (gerekçe şart).
// Geri dönüş (reopen): bir basamak geri + CANCELLED/COMPLETED diriltme —
//   gerekçe + rütbe ≥50 (yönetici) şart. Atlamalar her zaman yasak.
// CONTRACTED yalnız imza kanıtıyla (signedAt). COMPLETED'ten CANCELLED'e yok.
import { CANONICAL_STATUSES } from "./agreements.ts";

export interface TransitionContext {
  actorMaxRank: number;
  reason?: string | null;
  signedAt?: string | Date | null;
}

export interface TransitionDecision {
  allowed: boolean;
  error?: string;
  kind?: "noop" | "forward" | "cancel" | "reopen";
}

const FORWARD: Record<string, string> = {
  PROSPECT: "NEGOTIATION",
  NEGOTIATION: "CONTRACTED",
  CONTRACTED: "ACTIVE",
  ACTIVE: "COMPLETED",
};

const CANCELLABLE = new Set(["PROSPECT", "NEGOTIATION", "CONTRACTED", "ACTIVE"]);

const REOPEN: Record<string, readonly string[]> = {
  NEGOTIATION: ["PROSPECT"],
  CONTRACTED: ["NEGOTIATION"],
  ACTIVE: ["CONTRACTED"],
  COMPLETED: ["ACTIVE"],
  CANCELLED: ["PROSPECT", "NEGOTIATION"],
};

const REOPEN_MIN_RANK = 50;

function hasReason(reason: string | null | undefined): boolean {
  return typeof reason === "string" && reason.trim().length > 0;
}

function hasSignedAt(signedAt: string | Date | null | undefined): boolean {
  if (signedAt == null) return false;
  if (signedAt instanceof Date) return !Number.isNaN(signedAt.getTime());
  return String(signedAt).trim().length > 0 && !Number.isNaN(new Date(String(signedAt)).getTime());
}

export function canTransition(from: string, to: string, ctx: TransitionContext): TransitionDecision {
  const known = CANONICAL_STATUSES as readonly string[];
  if (!known.includes(from) || !known.includes(to)) {
    return { allowed: false, error: `Bilinmeyen durum geçişi: ${from} → ${to}` };
  }
  if (from === to) return { allowed: true, kind: "noop" };

  if (FORWARD[from] === to) {
    if (to === "CONTRACTED" && !hasSignedAt(ctx.signedAt)) {
      return { allowed: false, error: "CONTRACTED geçişi imza kanıtı ister: signedAt gönderin" };
    }
    return { allowed: true, kind: "forward" };
  }

  if (to === "CANCELLED" && CANCELLABLE.has(from)) {
    if (!hasReason(ctx.reason)) {
      return { allowed: false, error: "İptal için gerekçe zorunludur (transitionReason)" };
    }
    return { allowed: true, kind: "cancel" };
  }

  const reopenTargets = REOPEN[from];
  if (reopenTargets && (reopenTargets as readonly string[]).includes(to)) {
    if (!hasReason(ctx.reason)) {
      return { allowed: false, error: "Geri dönüş (reopen) için gerekçe zorunludur (transitionReason)" };
    }
    if (ctx.actorMaxRank < REOPEN_MIN_RANK) {
      return { allowed: false, error: "Geri dönüş (reopen) yönetici yetkisi ister (rütbe ≥ 50)" };
    }
    return { allowed: true, kind: "reopen" };
  }

  return { allowed: false, error: `Geçişe izin yok: ${from} → ${to} (atlamalı/ tanımsız geçiş)` };
}
