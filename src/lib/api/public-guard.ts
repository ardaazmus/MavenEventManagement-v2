// ─── Public yüzey koruması (Faz A) ──────────────────────────────────────────────
// Public route allowlist: dış uçlar slug/editionId → kiracı çözümlemesi yapar;
// çözümlenemeyen istek 404 alır (varlık varlığı ifşa edilmez) ve KİŞİSEL VERİ döndürmez.
import { db } from "@/lib/db";

// slug → tenant; tutmazsa null (rota 404 verir)
export async function resolvePublicTenant(slug: string | null | undefined) {
  if (!slug || slug.trim() === "") return null;
  return db.tenant.findUnique({ where: { slug: slug.trim() } });
}

// editionId → edisyon (kiracı bağı ile); tutmazsa null
export async function resolvePublicEdition(editionId: string | null | undefined) {
  if (!editionId || editionId.trim() === "") return null;
  return db.eventEdition.findUnique({
    where: { id: editionId.trim() },
    select: { id: true, tenantId: true, slug: true, name: true, isPublished: true },
  });
}
