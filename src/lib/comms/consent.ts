// ─── P17.2: Amaç-bazlı rıza ve gönderim kararı ────────────────────────────────
// Sözleşme: COMMERCIAL gönderim, o kanal+adres için GRANTED ticari rıza ister;
// TRANSACTIONAL rıza istemez. Bastırma listesi (S3) HER amacı engeller. Her
// karar SendDecision'a değişmez kayıt düşer. Ticari rıza hareketleri İYS
// kuyruğuna yazılır (P17.3); işlemsel hareketler kuyruğa girmez.
// NOT: `@/` takma adı YOK — node --test (tip-sıyırma) uyumu için bağımsız.

export class ConsentError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = "ConsentError";
    this.status = status;
  }
}

export const CONSENT_CHANNELS = ["EMAIL", "SMS", "WHATSAPP"] as const;
export const CONSENT_PURPOSES = ["TRANSACTIONAL", "COMMERCIAL"] as const;
export const CONSENT_SOURCES = ["FORM", "IMPORT", "API", "IYS", "IYS_RECONCILE", "MANUAL"] as const;

export function normalizeConsentAddress(channel: string, raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  if (channel === "EMAIL") {
    const v = raw.trim().toLowerCase();
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? v : null;
  }
  let digits = raw.replace(/\D/g, "");
  // Baştaki trunk-0 atılır (E.164'te baştaki 0 olmaz): 0532… → 90532… ile birleşir.
  // Not: trunk'suz 10 hane olduğu gibi saklanır (ülke belirsiz — tam form önerilir).
  if (digits.length === 11 && digits.startsWith("0")) digits = `90${digits.slice(1)}`;
  return digits.length >= 10 && digits.length <= 15 ? digits : null;
}

export function sanitizeChannel(raw: unknown): string | null {
  const v = typeof raw === "string" ? raw.trim().toUpperCase() : "";
  return (CONSENT_CHANNELS as readonly string[]).includes(v) ? v : null;
}

export function sanitizePurpose(raw: unknown): string | null {
  const v = typeof raw === "string" ? raw.trim().toUpperCase() : "";
  return (CONSENT_PURPOSES as readonly string[]).includes(v) ? v : null;
}

export interface ConsentPrisma {
  contactConsent: {
    upsert: (args: { where: Record<string, unknown>; create: Record<string, unknown>; update: Record<string, unknown> }) => Promise<Record<string, unknown>>;
    findUnique: (args: { where: Record<string, unknown> }) => Promise<Record<string, unknown> | null>;
    findMany: (args: { where: Record<string, unknown>; take?: number; orderBy?: unknown }) => Promise<Array<Record<string, unknown>>>;
  };
  mailSuppression: {
    findUnique: (args: { where: Record<string, unknown> }) => Promise<Record<string, unknown> | null>;
  };
  sendDecision: {
    create: (args: { data: Record<string, unknown> }) => Promise<Record<string, unknown>>;
  };
  iysOutbox: {
    create: (args: { data: Record<string, unknown> }) => Promise<Record<string, unknown>>;
  };
}

export interface RecordConsentInput {
  tenantId: string;
  channel: string;
  address: string;
  purpose: string;
  status: "GRANTED" | "WITHDRAWN";
  source?: string;
  proof?: string | null;
}

export async function recordConsent(prisma: ConsentPrisma, input: RecordConsentInput): Promise<{ consent: Record<string, unknown>; iysQueued: boolean }> {
  if (!input.tenantId) throw new ConsentError("tenantId zorunludur", 422);
  const channel = sanitizeChannel(input.channel);
  const purpose = sanitizePurpose(input.purpose);
  if (!channel) throw new ConsentError("channel EMAIL|SMS|WHATSAPP olmalı", 422);
  if (!purpose) throw new ConsentError("purpose TRANSACTIONAL|COMMERCIAL olmalı", 422);
  const address = normalizeConsentAddress(channel, input.address);
  if (!address) throw new ConsentError("Adres biçimi geçersiz", 422);
  if (input.status !== "GRANTED" && input.status !== "WITHDRAWN") {
    throw new ConsentError("status GRANTED|WITHDRAWN olmalı", 422);
  }
  const source = (CONSENT_SOURCES as readonly string[]).includes((input.source ?? "MANUAL").toUpperCase())
    ? (input.source ?? "MANUAL").toUpperCase()
    : "MANUAL";
  const now = new Date();
  const consent = await prisma.contactConsent.upsert({
    where: { tenantId_channel_address_purpose: { tenantId: input.tenantId, channel, address, purpose } },
    create: {
      tenantId: input.tenantId,
      channel,
      address,
      purpose,
      status: input.status,
      source,
      proof: input.proof ?? null,
      grantedAt: input.status === "GRANTED" ? now : null,
      withdrawnAt: input.status === "WITHDRAWN" ? now : null,
    },
    update: {
      status: input.status,
      source,
      proof: input.proof ?? null,
      grantedAt: input.status === "GRANTED" ? now : undefined,
      withdrawnAt: input.status === "WITHDRAWN" ? now : undefined,
    },
  });
  // İYS yalnız ticari elektronik iletileri yönetir.
  let iysQueued = false;
  if (purpose === "COMMERCIAL" && (channel === "EMAIL" || channel === "SMS")) {
    await prisma.iysOutbox.create({
      data: {
        tenantId: input.tenantId,
        channel,
        address,
        purpose,
        action: input.status === "GRANTED" ? "GRANT" : "WITHDRAW",
        payload: JSON.stringify({ source, proof: input.proof ?? null, at: now.toISOString() }),
      },
    });
    iysQueued = true;
  }
  return { consent, iysQueued };
}

export interface DecideSendInput {
  tenantId: string;
  channel: string;
  recipient: string;
  purpose: string;
  campaignId?: string | null;
}

export interface SendVerdict {
  decision: "ALLOW" | "BLOCK";
  reasons: string[];
  auditId: string;
}

export async function decideSend(prisma: ConsentPrisma, input: DecideSendInput): Promise<SendVerdict> {
  if (!input.tenantId) throw new ConsentError("tenantId zorunludur", 422);
  const channel = sanitizeChannel(input.channel) ?? "EMAIL";
  const purpose = sanitizePurpose(input.purpose) ?? "COMMERCIAL";
  const address = normalizeConsentAddress(channel, input.recipient) ?? String(input.recipient ?? "").trim().toLowerCase();
  const reasons: string[] = [];

  // 1) Bastırma listesi her amacı engeller (S3).
  if (channel === "EMAIL" && address.includes("@")) {
    const hit = await prisma.mailSuppression.findUnique({
      where: { tenantId_email: { tenantId: input.tenantId, email: address } },
    });
    if (hit) reasons.push("SUPPRESSED");
  }
  // 2) Ticari amaç kanal+adres rızası ister.
  if (purpose === "COMMERCIAL") {
    const consent = await prisma.contactConsent.findUnique({
      where: { tenantId_channel_address_purpose: { tenantId: input.tenantId, channel, address, purpose } },
    });
    if (!consent || (consent as { status: string }).status !== "GRANTED") {
      reasons.push("NO_CONSENT");
    }
  }
  const decision = reasons.length > 0 ? "BLOCK" : "ALLOW";
  const row = (await prisma.sendDecision.create({
    data: {
      tenantId: input.tenantId,
      campaignId: input.campaignId ?? null,
      channel,
      recipient: address,
      purpose,
      decision,
      reasons: JSON.stringify(reasons),
    },
  })) as { id: string };
  return { decision, reasons, auditId: row.id };
}

export async function getConsent(prisma: ConsentPrisma, input: { tenantId: string; channel: string; address: string; purpose: string }): Promise<Record<string, unknown> | null> {
  const channel = sanitizeChannel(input.channel);
  const purpose = sanitizePurpose(input.purpose);
  if (!channel || !purpose) return null;
  const address = normalizeConsentAddress(channel, input.address);
  if (!address) return null;
  return prisma.contactConsent.findUnique({
    where: { tenantId_channel_address_purpose: { tenantId: input.tenantId, channel, address, purpose } },
  });
}
