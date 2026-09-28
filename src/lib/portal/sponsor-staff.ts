// ─── P20.1: Stand personeli ekleme/çıkarma kararları ───────────────────────────
// Sponsor jetonuyla personel yönetimi:
//  - EKLEME: kisi (mevcut personId ya da ad+soyad ile) + edisyon katılımı
//    (source SPONSOR_PORTAL) + EXHIBITOR_STAFF rolü (INVITED — düzenleyici onayı
//    genel rol akışından ACTIVE'ye alınır). Aynı personele ikinci rol 409.
//  - ÇIKARMA: yalnız kendi edisyonundaki SPONSOR_PORTAL katılımları; CONFIRMED
//    kaydı olan katılım çıkarılamaz (önce kayıt iptali gerekir).
export const STAFF_ROLE = "EXHIBITOR_STAFF";
export const STAFF_SOURCE = "SPONSOR_PORTAL";

export interface StaffAddInput {
  personId?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
}

export interface PersonCandidate {
  id: string;
  status: string;
  firstName: string;
  lastName: string;
  company: string | null;
}

export type StaffAddPlan =
  | { ok: true; personId: string | null; createPerson: { firstName: string; lastName: string; email: string | null } | null; setCompany: boolean }
  | { ok: false; error: string; status: number };

function nonEmpty(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

// kişi çözümleme: personId öncelikli; yoksa ad+soyad (+seçimli e-posta).
// byId/byEmail aramalarını rota yapar (DB bağımlılığı dışarıda), karar burada.
export function planStaffAdd(
  input: StaffAddInput,
  found: { byId: PersonCandidate | null; byEmail: PersonCandidate | null },
): StaffAddPlan {
  if (nonEmpty(input.personId)) {
    const p = found.byId;
    if (!p) return { ok: false, error: "Kişi bulunamadı", status: 404 };
    if (p.status === "MERGED") return { ok: false, error: "Birleştirilmiş kişi kaydı kullanılamaz", status: 400 };
    if (p.status !== "ACTIVE") return { ok: false, error: "Pasif kişi kaydı kullanılamaz", status: 400 };
    return { ok: true, personId: p.id, createPerson: null, setCompany: !nonEmpty(p.company) };
  }
  if (!nonEmpty(input.firstName) || !nonEmpty(input.lastName)) {
    return { ok: false, error: "personId ya da ad+soyad zorunlu", status: 400 };
  }
  if (input.email !== undefined && input.email !== null && input.email !== "") {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email)) {
      return { ok: false, error: "E-posta biçimi geçersiz", status: 400 };
    }
  }
  // e-posta çakışması: kayıtlı kişi varsa o kullanılır (çift kişi açılamaz)
  if (found.byEmail) {
    if (found.byEmail.status !== "ACTIVE") {
      return { ok: false, error: "Bu e-postadaki kişi kaydı aktif değil", status: 400 };
    }
    return { ok: true, personId: found.byEmail.id, createPerson: null, setCompany: !nonEmpty(found.byEmail.company) };
  }
  return {
    ok: true,
    personId: null,
    createPerson: {
      firstName: input.firstName.trim(),
      lastName: input.lastName.trim(),
      email: nonEmpty(input.email) ? input.email.trim().toLowerCase() : null,
    },
    setCompany: true,
  };
}

export interface ExistingStaffLink {
  participation: { id: string; editionId: string; source: string } | null;
  staffRole: { id: string; status: string } | null;
}

export type StaffLinkDecision =
  | { ok: true; reuseParticipationId: string | null }
  | { ok: false; error: string; status: number };

// katılım+rol yazım kararı: mevcut EXHIBITOR_STAFF rolü 409 (yeniden davet yok).
export function decideStaffLink(existing: ExistingStaffLink, editionId: string): StaffLinkDecision {
  if (existing.participation && existing.participation.editionId !== editionId) {
    return { ok: false, error: "Katılım başka etkinliğe ait", status: 400 };
  }
  if (existing.staffRole) {
    return { ok: false, error: "Bu kişi zaten stand personeli", status: 409 };
  }
  return { ok: true, reuseParticipationId: existing.participation?.id ?? null };
}

export interface RemovableParticipation {
  id: string;
  editionId: string;
  source: string;
  personCompany: string | null;
  staffRoleId: string | null;
  confirmedRegistrations: number;
}

export type StaffRemoveDecision = { ok: true } | { ok: false; error: string; status: number };

// çıkarma kararı: sahiplik (edisyon + kaynak + firma) ve kayıt kilidi.
export function decideStaffRemove(p: RemovableParticipation | null, want: { editionId: string; orgName: string }): StaffRemoveDecision {
  if (!p) return { ok: false, error: "Personel kaydı bulunamadı", status: 404 };
  if (p.editionId !== want.editionId) return { ok: false, error: "Personel kaydı bulunamadı", status: 404 };
  if (p.source !== STAFF_SOURCE && p.source !== "EXHIBITOR_PORTAL") {
    return { ok: false, error: "Personel kaydı bulunamadı", status: 404 };
  }
  if (p.personCompany !== want.orgName) return { ok: false, error: "Personel kaydı bulunamadı", status: 404 };
  if (!p.staffRoleId) return { ok: false, error: "Stand personeli rolü yok", status: 404 };
  if (p.confirmedRegistrations > 0) {
    return { ok: false, error: "Onaylı kaydı olan personel çıkarılamaz — önce kayıt iptal edilmeli", status: 409 };
  }
  return { ok: true };
}
