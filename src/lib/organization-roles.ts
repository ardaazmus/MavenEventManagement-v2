// ─── Kurum Event Rol ve Paydaş Esnekliği Modülü (F-06 & CONTEXT.md) ─────────
// Firma B (Tenant) ile etkinlik düzenleyen/müşteri kurum (CLIENT) arasındaki
// semantik rol, kategori ve görünen ad (custom label) ayrımını yönetir.

export const STANDARD_ORG_ROLES = [
  "HOST",
  "EVENT_OWNER",
  "CLIENT",
  "PCO",
  "CO_ORGANIZER",
  "SCIENTIFIC_OWNER",
  "PUBLIC_AUTHORITY",
  "SUPPORTER",
  "SPONSOR",
  "EXHIBITOR",
  "VENUE",
  "HOTEL",
  "SUPPLIER",
  "MEDIA_PARTNER",
  "ACADEMIC_PARTNER",
  "ASSOCIATION",
  "WORKSHOP_SPONSOR",
] as const;

export type StandardOrgRole = (typeof STANDARD_ORG_ROLES)[number];

export type OrgRoleCategory =
  | "COMMISSIONER" // Müşteri / Hesabına düzenlenen kurum (CLIENT, EVENT_OWNER)
  | "ORGANIZER"    // İcra ve organizatör (HOST, PCO, CO_ORGANIZER, SCIENTIFIC_OWNER)
  | "PARTNER"      // Destekçi ve akademik paydaş (SUPPORTER, ASSOCIATION, vb.)
  | "COMMERCIAL"   // Ticari paydaş (SPONSOR, EXHIBITOR, WORKSHOP_SPONSOR)
  | "FACILITY"     // Tesis ve lojistik (VENUE, HOTEL, SUPPLIER)
  | "OTHER";

export const ORG_ROLE_CATEGORY_MAP: Record<StandardOrgRole, OrgRoleCategory> = {
  CLIENT: "COMMISSIONER",
  EVENT_OWNER: "COMMISSIONER",
  HOST: "ORGANIZER",
  PCO: "ORGANIZER",
  CO_ORGANIZER: "ORGANIZER",
  SCIENTIFIC_OWNER: "ORGANIZER",
  PUBLIC_AUTHORITY: "PARTNER",
  SUPPORTER: "PARTNER",
  MEDIA_PARTNER: "PARTNER",
  ACADEMIC_PARTNER: "PARTNER",
  ASSOCIATION: "PARTNER",
  SPONSOR: "COMMERCIAL",
  EXHIBITOR: "COMMERCIAL",
  WORKSHOP_SPONSOR: "COMMERCIAL",
  VENUE: "FACILITY",
  HOTEL: "FACILITY",
  SUPPLIER: "FACILITY",
};

export const DEFAULT_ORG_ROLE_LABELS_TR: Record<StandardOrgRole, string> = {
  HOST: "Ev Sahibi",
  EVENT_OWNER: "Etkinlik Sahibi",
  CLIENT: "Müşteri / Düzenleyen Kurum",
  PCO: "PCO (Profesyonel Organizatör)",
  CO_ORGANIZER: "Ortak Organizatör",
  SCIENTIFIC_OWNER: "Bilimsel Sahip",
  PUBLIC_AUTHORITY: "Kamu Kurumu",
  SUPPORTER: "Destekçi",
  SPONSOR: "Sponsor",
  EXHIBITOR: "Fuarcı",
  VENUE: "Mekân",
  HOTEL: "Otel",
  SUPPLIER: "Tedarikçi",
  MEDIA_PARTNER: "Medya Partneri",
  ACADEMIC_PARTNER: "Akademik Partner",
  ASSOCIATION: "Dernek",
  WORKSHOP_SPONSOR: "Workshop Sponsoru",
};

export function isValidOrgRole(role: string): boolean {
  return STANDARD_ORG_ROLES.includes(role as StandardOrgRole);
}

export function getOrgRoleCategory(role: string): OrgRoleCategory {
  return (ORG_ROLE_CATEGORY_MAP as Record<string, OrgRoleCategory>)[role] ?? "OTHER";
}

export function isCommissionerRole(role: string): boolean {
  return getOrgRoleCategory(role) === "COMMISSIONER";
}

/**
 * Rolün kullanıcı arayüzünde veya raporlarda görünecek etiketini çözer.
 * Özel bir etiket (customLabel) tanımlıysa onu döner, yoksa standart Türkçe sözlük karşılığını döner.
 */
export function resolveOrgRoleDisplay(role: string, customLabel?: string | null): string {
  if (customLabel && customLabel.trim().length > 0) {
    return customLabel.trim();
  }
  return DEFAULT_ORG_ROLE_LABELS_TR[role as StandardOrgRole] ?? role;
}

export interface OrgRoleMetadata {
  customLabel?: string;
  priority?: number;
  isClientStakeholder?: boolean;
}

const META_PREFIX = "__ORG_ROLE_META__:";

/**
 * EventOrganizationAssignment.notes alanından metin ve yapısal meta ayrıştırması yapar.
 */
export function parseOrgRoleMetadata(notes?: string | null): { cleanNotes: string; meta: OrgRoleMetadata } {
  if (!notes) return { cleanNotes: "", meta: {} };
  const idx = notes.indexOf(META_PREFIX);
  if (idx === -1) return { cleanNotes: notes.trim(), meta: {} };

  const cleanNotes = notes.slice(0, idx).trim();
  const rawMeta = notes.slice(idx + META_PREFIX.length).trim();
  try {
    const parsed = JSON.parse(rawMeta) as OrgRoleMetadata;
    return { cleanNotes, meta: parsed };
  } catch {
    return { cleanNotes: notes.trim(), meta: {} };
  }
}

/**
 * EventOrganizationAssignment.notes alanına yapısal meta gömer.
 */
export function serializeOrgRoleMetadata(baseNotes: string | null | undefined, meta: OrgRoleMetadata): string {
  const clean = baseNotes ? baseNotes.split(META_PREFIX)[0].trim() : "";
  const metaStr = `${META_PREFIX}${JSON.stringify(meta)}`;
  return clean ? `${clean}\n\n${metaStr}` : metaStr;
}
