// ─── P14.1: Merkezi maskeleme kararları (VERIFY/BADGE/SCAN) ────────────────────
// Kural: kimliksiz/cihaz bağlamında kişi verisi MASKELİ döner; tam kimlik yalnız
// doğrulanmış kadro oturumuna verilir. Maskeleme deterministiktir (testli) ve
// yanıtta `masked` bayrağıyla işaretlenir — UI ayrı kart gösterir.
export function maskName(firstName: string, lastName: string): string {
  if (!firstName && !lastName) return "—";
  if (!lastName) return firstName;
  return `${firstName} ${lastName.charAt(0)}.`;
}

export function maskEmail(email: string | null | undefined): string {
  if (!email || !email.includes("@")) return "—";
  const [local, domain] = email.split("@");
  return `${local.charAt(0)}•••@${domain}`;
}

export function maskPhone(phone: string | null | undefined): string {
  if (!phone) return "—";
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 4) return "••• ••• •• ••";
  const last4 = digits.slice(-4);
  return `••• ••• ${last4.slice(0, 2)} ${last4.slice(2)}`;
}

export function maskCompany(company: string | null | undefined): string {
  if (!company || !company.trim()) return "—";
  const words = company.trim().split(/\s+/);
  if (words.length === 1) return `${words[0].charAt(0)}•••`;
  return `${words[0].charAt(0)}••• ${words[words.length - 1]}`;
}

export interface ScanPersonInput {
  id: string;
  firstName: string;
  lastName: string;
  company?: string | null;
  title?: string | null;
}

export interface MaskedScanPerson {
  id: string;
  name: string;
  company: string | null;
  title?: string | null;
  masked: boolean;
}

export function maskScanPerson(person: ScanPersonInput, ctx: { staffVerified: boolean }): MaskedScanPerson {
  if (ctx.staffVerified) {
    return {
      id: person.id,
      name: `${person.firstName} ${person.lastName}`,
      company: person.company ?? null,
      title: person.title ?? null,
      masked: false,
    };
  }
  return {
    id: person.id,
    name: maskName(person.firstName, person.lastName),
    company: person.company ? maskCompany(person.company) : null,
    masked: true,
  };
}
