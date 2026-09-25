// ─── PWA Katılımcı Dış Portalı — oturum yaşam döngüsü ─────────────────────────
// TASK-A F1 (OWASP API1:2023) çizgisi PortalToken ile aynıdır:
//  - ham anahtar ps_<hex> YALNIZ giriş anında bir kez döner; DB'de yalnız sha256
//    hash yaşar (düzyazı saklama yasak), yanıt gövdelerinde ASLA dolaşmaz.
//  - GUEST: etkinlik koduyla giren anonim katılımcı (kimlik yok → kişisel veri yok).
//  - AUTH: doğrulanmış katılımcı — PortalToken (magic link) veya e-posta+kodu ile
//    kişiye bağlanır; kimlik gerektiren modüller (B2B, bilet) yalnız bu oturumda.
import { NextRequest } from "next/server";
import { createHash, randomUUID } from "node:crypto";
import { db } from "@/lib/db";

export type PortalSessionKind = "GUEST" | "AUTH";

export function generateSessionKey(): string {
  return `ps_${randomUUID().replace(/-/g, "")}`;
}

export function hashSessionKey(raw: string): string {
  return createHash("sha256").update(raw, "utf8").digest("hex");
}

// oturum çıkarımı — ham anahtarı BİR KEZ döndürür (istemci localStorage'ta tutar)
export async function issuePortalSession(opts: {
  editionId: string;
  kind: PortalSessionKind;
  personId?: string | null;
  ttlMs?: number;
}): Promise<{ key: string; expiresAt: Date; id: string }> {
  const key = generateSessionKey();
  const expiresAt = new Date(Date.now() + (opts.ttlMs ?? (opts.kind === "AUTH" ? 90 : 30) * 24 * 3_600_000));
  const row = await db.portalSession.create({
    data: {
      tokenHash: hashSessionKey(key),
      editionId: opts.editionId,
      kind: opts.kind,
      personId: opts.kind === "AUTH" ? (opts.personId ?? null) : null,
      expiresAt,
    },
    select: { id: true },
  });
  return { key, expiresAt, id: row.id };
}

export type PortalSessionRow = {
  id: string;
  editionId: string;
  kind: string;
  personId: string | null;
  expiresAt: Date;
  revokedAt: Date | null;
};

export type SessionCheck =
  | { ok: true; session: PortalSessionRow }
  | { ok: false; reason: "NO_SESSION" | "UNKNOWN" | "EXPIRED" | "REVOKED" };

// istekten ham oturum anahtarı: önce x-portal-session başlığı (URL sızıntısı yok),
// sonra ?session= sorgu parametresi (portal kolaylığı)
export function extractSession(req: NextRequest): string | null {
  const h = req.headers.get("x-portal-session");
  if (h && h.trim()) return h.trim();
  const q = req.nextUrl.searchParams.get("session");
  return q && q.trim() ? q.trim() : null;
}

// doğrulama: hash araması + süre/iptal denetimi. Bilinmeyen → UNKNOWN (404),
// süresi geçmiş → EXPIRED, iptal → REVOKED (410).
export async function validatePortalSession(raw: string): Promise<SessionCheck> {
  const session = (await db.portalSession.findUnique({
    where: { tokenHash: hashSessionKey(raw) },
  })) as PortalSessionRow | null;
  if (!session) return { ok: false, reason: "UNKNOWN" };
  if (session.revokedAt) return { ok: false, reason: "REVOKED" };
  if (session.expiresAt.getTime() <= Date.now()) return { ok: false, reason: "EXPIRED" };
  return { ok: true, session };
}

// en-az-yetke kullanım izi — fire-and-forget (yanıt yolunu bloklamaz)
export function touchSession(id: string): void {
  void db.portalSession
    .update({ where: { id }, data: { lastSeenAt: new Date() } })
    .catch(() => undefined);
}

// giriş kodu normalizasyonu: büyük harf + boşluk temizliği — karşılaştırma tutarlılığı
export function normalizeEventCode(raw: string | null | undefined): string {
  return (raw ?? "").replace(/\s+/g, "").toUpperCase();
}

// rastgele okunabilir etkinlik kodu (6 karakter, karışan karakterler hariç)
export function generateEventCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 6; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return out;
}
