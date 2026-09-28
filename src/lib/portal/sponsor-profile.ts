// ─── P20.1: Sponsor profil yaması — izinli alan + biçim denetimi ─────────────
// Sponsor kendi kurum kartını düzenler; kritik alanlar (ad, vergi no, kiracı)
// YAMALANAMAZ. URL alanları http(s) biçim zorunluluğu taşır.
const ALLOWED = ["website", "city", "country", "logoUrl", "generalEmail", "description", "address"] as const;
type AllowedKey = (typeof ALLOWED)[number];

const MAX_LEN: Record<AllowedKey, number> = {
  website: 300,
  city: 120,
  country: 120,
  logoUrl: 500,
  generalEmail: 200,
  description: 2000,
  address: 500,
};

function isHttpUrl(v: string): boolean {
  try {
    const u = new URL(v);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

function isEmail(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

export type ProfilePatchResult =
  | { ok: true; data: Record<string, string | null> }
  | { ok: false; error: string };

export function sanitizeProfilePatch(body: unknown): ProfilePatchResult {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "Geçersiz profil gövdesi" };
  }
  const data: Record<string, string | null> = {};
  for (const key of ALLOWED) {
    const v = (body as Record<string, unknown>)[key];
    if (v === undefined) continue;
    if (v === null) {
      data[key] = null;
      continue;
    }
    if (typeof v !== "string") return { ok: false, error: `${key} metin olmalı` };
    const s = v.trim();
    if (s.length > MAX_LEN[key]) return { ok: false, error: `${key} çok uzun (en fazla ${MAX_LEN[key]} karakter)` };
    if (s.length === 0) {
      data[key] = null;
      continue;
    }
    if ((key === "website" || key === "logoUrl") && !isHttpUrl(s)) {
      return { ok: false, error: `${key} geçerli bir http(s) adresi olmalı` };
    }
    if (key === "generalEmail" && !isEmail(s)) {
      return { ok: false, error: "generalEmail geçerli bir e-posta olmalı" };
    }
    data[key] = s;
  }
  if (Object.keys(data).length === 0) return { ok: false, error: "Güncellenecek alan yok" };
  return { ok: true, data };
}
