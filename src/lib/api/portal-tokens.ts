// ─── TASK-A F1: Portal yetenek belirteci yaşam döngüsü ────────────────────────
// OWASP API1:2023 (BOLA) sertleştirmesi:
//  - Ham belirteç YALNIZ çıkarım anında bir kez döner (single-display); sunucuda
//    yalnız sha256 hash'i yaşar (düzyazı saklama yasak — eski Person/Organization
//    portalToken skalerleri kaldırıldı).
//  - Belirteç yanıt gövdelerinde ASLA yer almaz; GET/POST doğrulaması yalnız
//    hash aramasıyla yapılır.
//  - Kapsam: PARTICIPANT (kişiye bağlı) | SPONSOR (kuruma bağlı) — edisyon kapsamlı.
//  - Yaşam döngüsü: expiresAt (süre sonu → 410) ve revokedAt (iptal → 410).
import { NextRequest } from "next/server";
import { createHash, randomUUID } from "node:crypto";
import { db } from "@/lib/db";

// ham belirteç: pt_<32 hex> — biçim kaba denetimi action rotasında da kullanılır
export function generateRawToken(): string {
  return `pt_${randomUUID().replace(/-/g, "")}`;
}

// tek yönlü hash — DB'de yalnız bu değer tutulur
export function hashToken(raw: string): string {
  return createHash("sha256").update(raw, "utf8").digest("hex");
}

export type PortalTokenScope = "PARTICIPANT" | "SPONSOR" | "CLIENT";

// çıkarım: ham belirteci BİR KEZ döndürür — çağıranın eline geçer (onay kanalında
// e-postayla gönderilir / yönetici önizlemesinde bellekte tutulur), sonra yok.
export async function issuePortalToken(opts: {
  scope: PortalTokenScope;
  editionId: string;
  personId?: string | null;
  organizationId?: string | null;
  agreementId?: string | null;
  ttlMs?: number;
  issuedBy?: string;
}): Promise<{ token: string; expiresAt: Date }> {
  const token = generateRawToken();
  const expiresAt = new Date(Date.now() + (opts.ttlMs ?? 90 * 24 * 3_600_000)); // varsayılan 90 gün
  await db.portalToken.create({
    data: {
      tokenHash: hashToken(token),
      scope: opts.scope,
      editionId: opts.editionId,
      personId: opts.personId ?? null,
      organizationId: opts.organizationId ?? null,
      agreementId: opts.agreementId ?? null,
      expiresAt,
      issuedBy: opts.issuedBy ?? "ADMIN",
    },
  });
  return { token, expiresAt };
}

export type PortalTokenRow = {
  id: string;
  tokenHash: string;
  scope: string;
  editionId: string;
  personId: string | null;
  organizationId: string | null;
  agreementId: string | null;
  expiresAt: Date;
  revokedAt: Date | null;
};

export type TokenCheck =
  | { ok: true; token: PortalTokenRow }
  | { ok: false; reason: "NO_TOKEN" | "UNKNOWN" | "EXPIRED" | "REVOKED" };

// istekten ham belirteç: önce x-portal-token başlığı (URL/log sızıntısı yok),
// sonra ?token= sorgu parametresi (harici portal kolaylığı)
export function extractToken(req: NextRequest): string | null {
  const h = req.headers.get("x-portal-token");
  if (h && h.trim()) return h.trim();
  const q = req.nextUrl.searchParams.get("token");
  return q && q.trim() ? q.trim() : null;
}

// doğrulama: hash araması + süre/iptal denetimi. Bilinmeyen/sahte → UNKNOWN
// (yanıt 404); süresi geçmiş → EXPIRED, iptal → REVOKED (yanıt 410).
export async function validatePortalToken(raw: string): Promise<TokenCheck> {
  const token = (await db.portalToken.findUnique({
    where: { tokenHash: hashToken(raw) },
  })) as PortalTokenRow | null;
  if (!token) return { ok: false, reason: "UNKNOWN" };
  if (token.revokedAt) return { ok: false, reason: "REVOKED" };
  if (token.expiresAt.getTime() <= Date.now()) return { ok: false, reason: "EXPIRED" };
  return { ok: true, token };
}

// en-az-yetke kullanım izi — fire-and-forget (yanıt yolunu bloklamaz)
export function touchToken(id: string): void {
  void db.portalToken.update({ where: { id }, data: { lastUsedAt: new Date() } }).catch(() => undefined);
}
