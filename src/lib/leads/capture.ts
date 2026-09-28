// ─── P20.2: Lead yakalama kararları ──────────────────────────────────────────
// Rozet tarama (BADGE_SCAN) / manuel kartvizit (MANUAL) / toplu içe aktarım
// (IMPORT) kanallarıyla kişi→anlaşma lead'i. Anlaşma başına kişiden TEK lead
// (tekrar tarama not/derece günceller). KVKK: rızasız kişinin iletişim bilgisi
// sponsor yüzeyinde MASKELENİR (maskLeadContact), dışa aktarımda satır düşer
// (bkz. export-guard personConsentWhere + LEADS denetim tipi).
export const LEAD_CHANNELS = ["BADGE_SCAN", "MANUAL", "IMPORT"] as const;
export const LEAD_RATINGS = ["HOT", "WARM", "COLD"] as const;
// P20.2: açık rıza amacı — lead hangi amaçla işleniyor (KVKK m.4 amaçla bağlılık)
export const LEAD_PURPOSES = ["SPONSOR_FOLLOWUP", "EVENT_NETWORKING"] as const;
// PII saklama süresi — dolan lead okuma yüzeylerinden düşer (liste/export/ROI)
export const LEAD_RETENTION_DAYS = 365;

export interface LeadInput {
  channel?: string;
  note?: string | null;
  rating?: string | null;
  purpose?: string;
  clientKey?: string | null;
}

export type LeadInputCheck =
  | { ok: true; channel: string; note: string | null; rating: string | null; purpose: string; clientKey: string | null }
  | { ok: false; error: string };

export function validateLeadInput(input: LeadInput): LeadInputCheck {
  const channel = input.channel ?? "BADGE_SCAN";
  if (!(LEAD_CHANNELS as readonly string[]).includes(channel)) {
    return { ok: false, error: `Geçersiz kanal: ${channel}` };
  }
  const purpose = input.purpose ?? "SPONSOR_FOLLOWUP";
  if (!(LEAD_PURPOSES as readonly string[]).includes(purpose)) {
    return { ok: false, error: `Geçersiz amaç: ${purpose}` };
  }
  let clientKey: string | null = null;
  if (input.clientKey !== undefined && input.clientKey !== null) {
    if (typeof input.clientKey !== "string") return { ok: false, error: "clientKey metin olmalı" };
    clientKey = input.clientKey.trim();
    if (clientKey.length === 0) clientKey = null;
    else if (clientKey.length > 80) return { ok: false, error: "clientKey çok uzun (en fazla 80 karakter)" };
  }
  let note: string | null = null;
  if (input.note !== undefined && input.note !== null) {
    if (typeof input.note !== "string") return { ok: false, error: "Not metin olmalı" };
    note = input.note.trim();
    if (note.length > 1000) return { ok: false, error: "Not çok uzun (en fazla 1000 karakter)" };
    if (note.length === 0) note = null;
  }
  let rating: string | null = null;
  if (input.rating !== undefined && input.rating !== null) {
    if (!(LEAD_RATINGS as readonly string[]).includes(input.rating)) {
      return { ok: false, error: `Geçersiz derece: ${input.rating}` };
    }
    rating = input.rating;
  }
  return { ok: true, channel, note, rating, purpose, clientKey };
}

// canlı lead filtresi — süresi dolan (expiresAt geçmiş) okuma dışı
export function leadLiveWhere(now = new Date()): { OR: Array<Record<string, unknown>> } {
  return { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] };
}

export function leadExpiryFrom(nowMs = Date.now()): Date {
  return new Date(nowMs + LEAD_RETENTION_DAYS * 86_400_000);
}

export interface LeadPersonView {
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  title: string | null;
  consentVersion: string | null;
}

// rızasız kişide iletişim maskelenir; kimlik (ad/firma/unvan) tarama bağlamında görünür
export function maskLeadContact(p: LeadPersonView): LeadPersonView {
  if (p.consentVersion) return p;
  return {
    ...p,
    email: p.email ? maskedEmail(p.email) : null,
    phone: p.phone ? "••••••" : null,
  };
}

function maskedEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!domain) return "••••";
  const head = (local ?? "").slice(0, 1) || "•";
  return `${head}••••@${domain}`;
}
