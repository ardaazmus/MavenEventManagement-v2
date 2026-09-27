// ─── P1 (yeni-fazlar 3-4): istek-aktörü — middleware doğrulamalı oturum başlıkları ──
// MAVEN_AUTH=on'da middleware HMAC imzasını DOĞRULADIKTAN SONRA x-maven-session-*
// başlıklarını enjekte eder; istemci-supplied kopyalar HER API yolunda silinir
// (sahtecilik kapalı). Bayrak kapalıyken (demo) kapılar null döner — mevcut davranış
// korunur; auth-on üretim duruşunda yönetim yüzeyleri oturum+rol zorunlu tutulur.
import { headers } from "next/headers";
import { AUTH_ENABLED } from "@/lib/auth-flag";

export interface RequestActor {
  uid: string;
  role: string;
  tenantId: string;
}

// §48 rol taksonomisi — yönetici kadro ("staff"); idari işlemler ORG_* ikilisiyle sınırlı
export const STAFF_ROLES = new Set([
  "ORG_OWNER",
  "ORG_ADMIN",
  "EVENT_MANAGER",
  "FINANCE_MANAGER",
  "REGISTRATION_MANAGER",
  "SPONSORSHIP_MANAGER",
  "SCIENTIFIC_MANAGER",
  "PROGRAM_MANAGER",
  "ONSITE_MANAGER",
]);
export const ADMIN_ROLES = new Set(["ORG_OWNER", "ORG_ADMIN"]);

/** Middleware'in doğrulayıp enjekte ettiği aktör — auth-off'ta null. */
export async function requestActor(): Promise<RequestActor | null> {
  if (!AUTH_ENABLED) return null;
  const h = await headers();
  const uid = h.get("x-maven-session-uid");
  const role = h.get("x-maven-session-role");
  const tenantId = h.get("x-maven-session-tenant");
  if (!uid || !role || !tenantId) return null; // public yüzey / oturumsuz
  return { uid, role, tenantId };
}

function deny(status: number, error: string): Response {
  return Response.json({ error }, { status });
}

/** Yönetim yüzeyi: auth-on'da oturum + staff rolü ZORUNLU (401/403); auth-off'ta null. */
export async function requireStaff(): Promise<Response | null> {
  if (!AUTH_ENABLED) return null;
  const actor = await requestActor();
  if (!actor) return deny(401, "Oturum gerekli");
  if (!STAFF_ROLES.has(actor.role)) return deny(403, "Bu işlem için yetkiniz yok");
  return null;
}

/** İdari yüzey (belirteç çıkarımı, KVKK işleme, portal editörü): ORG_* zorunlu. */
export async function requireAdmin(): Promise<Response | null> {
  if (!AUTH_ENABLED) return null;
  const actor = await requestActor();
  if (!actor) return deny(401, "Oturum gerekli");
  if (!ADMIN_ROLES.has(actor.role)) return deny(403, "Bu işlem için yönetici yetkisi gerekir");
  return null;
}
