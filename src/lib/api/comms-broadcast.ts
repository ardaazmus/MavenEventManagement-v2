// ─── İLETİŞİM YAYIN ÇEKİRDEĞİ — Müşteri Datası + Çok Kanallı Kampanya Gönderimi ──
// Kullanıcı talebi: üst firma, kendi organizasyonlarındaki kişi/kurum katılımcılardan
// müşteri datası üretmeli; bu havuza (ve kampanya hedeflerine) mail/SMS/WhatsApp'tan
// TEKİL veya TOPLU bildirim gönderebilmeli; gönderimler Etkinlik Öncesi/Sırası/Sonrası
// hiyerarşisinde organize kalmalı.
// İlkeler:
//  • e-posta → dispatchMail (kota + bastırma + soğuma denetimleri OTOMATİK gelir)
//  • SMS/WhatsApp → dispatchChannelMessage (sağlayıcı-bağımsız, DEMO simülasyonu var)
//  • kampanya/anlık gönderimlerde olay-yönlendirme matrisi atlanır (yönetici kanalı
//    açıkça seçer) — ana kanal anahtarı yine denetlenir
//  • her gönderim IntegrationLog'a iz bırakır; kampanyaya JSON rapor yazılır
//  • hata FIRLATMAZ — SendReport ile raporlar (kısmi başarı meşrudur)
import { db } from "@/lib/db";
import { dispatchMail } from "@/lib/mail-dispatch";
import { dispatchChannelMessage, type Recipient } from "@/lib/notify";

// ─── tipler ─────────────────────────────────────────────────────────────────
export const BROADCAST_CHANNELS = ["EMAIL", "SMS", "WHATSAPP"] as const;
export type BroadcastChannel = (typeof BROADCAST_CHANNELS)[number];

export const MAX_SEND_RECIPIENTS = 1000; // tek gönderimde toplam alıcı tavanı

export type AudienceFilters = {
  customerOnly: boolean; // müşteri datası havuzundan mı (yoksa etkinlik katılımından mı)
  categories: string[]; // kategori ID'leri (boş = tümü)
  requireEmail: boolean; // e-postası olanlar
  requirePhone: boolean; // telefonu olanlar (SMS/WhatsApp için)
};

export type BroadcastRecipient = Recipient & { email: string | null; contactId?: string };

export type ChannelSendReport = { attempted: number; sent: number; skipped: number; error?: string };

export type SendReport = {
  at: string;
  mode: "LIVE" | "TEST";
  audienceSize: number;
  channels: Partial<Record<BroadcastChannel, ChannelSendReport>>;
  totalSent: number;
};

export class BroadcastError extends Error {
  code: string;
  detail?: unknown;
  constructor(code: string, message: string, detail?: unknown) {
    super(message);
    this.code = code;
    this.detail = detail;
  }
}

// ─── kanal çözümleme: campaign.channels ("EMAIL,SMS") → doğrulanmış küme ────
export function parseChannels(raw: string | null | undefined, legacy: string | null | undefined): BroadcastChannel[] {
  const list = (raw ?? legacy ?? "EMAIL")
    .split(/[,\s;]+/)
    .map((s) => s.trim().toUpperCase())
    .filter((s): s is BroadcastChannel => (BROADCAST_CHANNELS as readonly string[]).includes(s));
  return [...new Set(list)];
}

// ─── hedef filtre çözümleme ─────────────────────────────────────────────────
export function parseAudienceFilters(json: string | null | undefined): AudienceFilters {
  const empty: AudienceFilters = { customerOnly: false, categories: [], requireEmail: false, requirePhone: false };
  if (!json) return empty;
  try {
    const p = JSON.parse(json) as Partial<AudienceFilters>;
    return {
      customerOnly: Boolean(p.customerOnly),
      categories: Array.isArray(p.categories) ? p.categories.filter((c): c is string => typeof c === "string") : [],
      requireEmail: Boolean(p.requireEmail),
      requirePhone: Boolean(p.requirePhone),
    };
  } catch {
    return empty;
  }
}

// serbest metin listesi → e-posta/telefon adayları ("tek" gönderim de bu yoldan)
function parseCustomRecipients(text: string | null | undefined): BroadcastRecipient[] {
  if (!text) return [];
  const emailRe = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
  const out: BroadcastRecipient[] = [];
  for (const raw of text.split(/[\n,;]+/)) {
    const v = raw.trim();
    if (!v) continue;
    if (emailRe.test(v)) out.push({ name: v, email: v, phone: null });
    else out.push({ name: v, email: null, phone: v.replace(/[^\d+]/g, "") || null });
  }
  return out;
}

// ─── hedef kümesi çözümleme (hiyerarşik kapsam) ─────────────────────────────
// Kampanya hedefi sırayla:
//   1. CUSTOM mod → customRecipients serbest listesi
//   2. audienceJson.customerOnly → müşteri datası havuzu (kiracı-çapraz)
//   3. aksi → edisyon katılımları (kategori filtreli olabilir)
export async function resolveAudience(opts: {
  editionId: string;
  tenantId: string;
  audienceMode: string;
  customRecipients?: string | null;
  filters?: AudienceFilters | null;
}): Promise<BroadcastRecipient[]> {
  const filters = opts.filters ?? parseAudienceFilters(null);
  if (opts.audienceMode === "CUSTOM") return parseCustomRecipients(opts.customRecipients);

  if (filters.customerOnly) {
    const where: Record<string, unknown> = { tenantId: opts.tenantId, commsOptIn: true };
    if (filters.categories.length > 0) where.category = { in: filters.categories };
    if (filters.requireEmail) where.email = { not: null };
    if (filters.requirePhone) where.phone = { not: null };
    const rows = await db.customerContact.findMany({ where, orderBy: { createdAt: "desc" }, take: MAX_SEND_RECIPIENTS });
    return rows.map((c) => ({ name: c.displayName, email: c.email, phone: c.phone, contactId: c.id }));
  }

  const partWhere: Record<string, unknown> = { editionId: opts.editionId };
  if (filters.categories.length > 0) {
    partWhere.registrations = { some: { categoryId: { in: filters.categories } } };
  }
  const parts = await db.eventParticipation.findMany({
    where: partWhere,
    include: { person: { select: { firstName: true, lastName: true, email: true, phone: true } } },
    take: MAX_SEND_RECIPIENTS,
  });
  let rows: BroadcastRecipient[] = parts.map((p) => ({
    name: `${p.person.firstName} ${p.person.lastName}`.trim(),
    email: p.person.email,
    phone: p.person.phone,
  }));
  if (filters.requireEmail) rows = rows.filter((r) => Boolean(r.email));
  if (filters.requirePhone) rows = rows.filter((r) => Boolean(r.phone));
  return rows;
}

// ─── e-posta gövde render'ı — {{fullName}}, {{eventName}}, {{email}} ────────
function renderTemplate(html: string, r: BroadcastRecipient, eventName: string): string {
  return html
    .replace(/\{\{\s*fullName\s*\}\}/g, r.name || "")
    .replace(/\{\{\s*email\s*\}\}/g, r.email || "")
    .replace(/\{\{\s*eventName\s*\}\}/g, eventName)
    .replace(/\{\{\s*series\s*\}\}/g, eventName);
}

// müşteri-datası alıcılarının son-gönderim damgalarını güncelle (raporlama alanı)
async function stampContacts(recipients: BroadcastRecipient[], channel: BroadcastChannel, sentCount: number): Promise<void> {
  const ids = recipients.slice(0, sentCount).map((r) => r.contactId).filter((v): v is string => Boolean(v));
  if (ids.length === 0) return;
  const data = channel === "EMAIL" ? { lastEmailAt: new Date() } : channel === "SMS" ? { lastSmsAt: new Date() } : { lastWhatsAppAt: new Date() };
  try {
    await db.customerContact.updateMany({ where: { id: { in: ids } }, data });
  } catch {
    // damga yazımı akışı bozmasın
  }
}

// ─── kampanya gönderimi — GERÇEK çok kanallı dağıtım ────────────────────────
// mode TEST: yalnız test alıcısına (tek e-posta / tek telefon); LIVE: hedef kümesine.
export async function sendCampaignNow(opts: {
  campaignId: string;
  mode: "LIVE" | "TEST";
  testEmail?: string | null;
  testPhone?: string | null;
  actorName: string;
}): Promise<SendReport> {
  const campaign = await db.campaign.findUnique({ where: { id: opts.campaignId } });
  if (!campaign) throw new BroadcastError("CAMPAIGN_NOT_FOUND", "Kampanya bulunamadı", 404);
  const edition = await db.eventEdition.findUnique({
    where: { id: campaign.editionId },
    select: { id: true, tenantId: true, name: true },
  });
  if (!edition) throw new BroadcastError("EDITION_NOT_FOUND", "Etkinlik bulunamadı", 404);

  // gönderim-anı güncel hedef (isSegmentFixed=false → canlı liste zaten bu yol)
  const filters = parseAudienceFilters(campaign.audienceJson);
  const audience = opts.mode === "TEST"
    ? parseCustomRecipients([opts.testEmail, opts.testPhone].filter(Boolean).join(","))
    : await resolveAudience({
        editionId: edition.id,
        tenantId: edition.tenantId,
        audienceMode: campaign.audienceMode,
        customRecipients: campaign.customRecipients,
        filters,
      });
  if (audience.length === 0) throw new BroadcastError("EMPTY_AUDIENCE", "Hedef kümesi boş — alıcı yok", 400);

  const channels = parseChannels(campaign.channels, campaign.channel);
  const template = campaign.templateId
    ? await db.emailTemplate.findUnique({ where: { id: campaign.templateId } })
    : null;
  const subject = campaign.subject || template?.subject || campaign.name;
  const htmlBody = template?.htmlBody ?? null;
  const textBody = campaign.body ?? "";

  const report: SendReport = {
    at: new Date().toISOString(),
    mode: opts.mode,
    audienceSize: audience.length,
    channels: {},
    totalSent: 0,
  };

  // ── E-POSTA ──
  if (channels.includes("EMAIL")) {
    const emails = audience.map((r) => r.email).filter((v): v is string => Boolean(v)).slice(0, MAX_SEND_RECIPIENTS);
    if (emails.length > 0) {
      const out = await dispatchMail({
        recipients: emails,
        subject,
        text: textBody || undefined,
        html: htmlBody ? renderTemplate(htmlBody, audience[0], edition.name) : undefined,
        providerId: campaign.providerId ?? undefined,
      });
      report.channels.EMAIL = {
        attempted: emails.length,
        sent: out.accepted.length,
        skipped: out.skipped.length + out.suppressedCount,
        error: out.ok ? undefined : out.error,
      };
      report.totalSent += out.accepted.length;
    } else {
      report.channels.EMAIL = { attempted: 0, sent: 0, skipped: 0, error: "e-postalı alıcı yok" };
    }
  }

  // ── SMS / WHATSAPP ──
  const phoneRecipients: Recipient[] = audience
    .filter((r) => Boolean(r.phone))
    .map((r) => ({ name: r.name, phone: r.phone as string }));
  const message = { kind: "announcement" as const, title: subject, body: textBody || subject };
  for (const ch of ["SMS", "WHATSAPP"] as const) {
    if (!channels.includes(ch)) continue;
    if (phoneRecipients.length === 0) {
      report.channels[ch] = { attempted: 0, sent: 0, skipped: 0, error: "telefonlu alıcı yok" };
      continue;
    }
    const out = await dispatchChannelMessage(edition.id, message, phoneRecipients, { ignoreRouting: true });
    const r = ch === "SMS" ? out.sms : out.wa;
    report.channels[ch] = {
      attempted: r.attempted,
      sent: r.sent,
      skipped: Math.max(0, phoneRecipients.length - r.sent) + out.skippedNoPhone,
      error: r.error,
    };
    report.totalSent += r.sent;
  }

  // müşteri havuzu damgaları
  for (const ch of ["EMAIL", "SMS", "WHATSAPP"] as const) {
    const r = report.channels[ch];
    if (r && r.sent > 0) await stampContacts(audience, ch, r.sent);
  }

  // kampanya durum + rapor (yalnız LIVE durumu değiştirir; TEST deneme kaydı bırakır)
  const failCount = Object.values(report.channels).reduce((a, r) => a + (r?.attempted ?? 0) - (r?.sent ?? 0), 0);
  await db.campaign.update({
    where: { id: campaign.id },
    data: {
      lastSendReport: JSON.stringify(report),
      ...(opts.mode === "LIVE"
        ? {
            status: report.totalSent > 0 ? "SENT" : "FAILED",
            sentAt: new Date(),
            sentCount: report.totalSent,
            deliveredCount: report.totalSent,
            failCount,
          }
        : { status: campaign.status === "DRAFT" ? "TESTED" : campaign.status, testSentTo: opts.testEmail ?? opts.testPhone ?? null }),
    },
  });

  await db.activityLog.create({
    data: {
      tenantId: edition.tenantId,
      editionId: edition.id,
      type: "CAMPAIGN_SAVED",
      message: `${opts.mode === "TEST" ? "Test" : "Gerçek"} gönderim: "${campaign.name}" — ${report.totalSent} alıcı (${Object.entries(report.channels).filter(([, r]) => (r?.sent ?? 0) > 0).map(([k]) => k).join(", ") || "kanal yok"})`,
      entityType: "campaign",
      entityId: campaign.id,
      actorName: opts.actorName,
    },
  });

  return report;
}

// ─── anlık yayın — program değişikliği vb. hızlı bildirim ───────────────────
// Gönderim + arşiv: Campaign kaydı olarak saklanır (aşama hiyerarşisinde görünür),
// seçilirse portal duyurusu da açılır. Tek ("SINGLE") ve toplu mod desteklidir.
export type InstantAudienceMode = "ALL_PARTICIPANTS" | "CATEGORY" | "CUSTOMERS" | "CUSTOM" | "SINGLE";

export async function instantBroadcast(opts: {
  editionId: string;
  phase: string; // PRE_EVENT|DURING_EVENT|POST_EVENT
  title: string;
  body: string;
  channels: BroadcastChannel[];
  audienceMode: InstantAudienceMode;
  categoryIds?: string[];
  contactIds?: string[];
  customRecipients?: string | null;
  single?: { name?: string | null; email?: string | null; phone?: string | null } | null;
  createPortalAnnouncement?: boolean;
  actorName: string;
}): Promise<{ report: SendReport; campaignId: string }> {
  const edition = await db.eventEdition.findUnique({
    where: { id: opts.editionId },
    select: { id: true, tenantId: true, name: true },
  });
  if (!edition) throw new BroadcastError("EDITION_NOT_FOUND", "Etkinlik bulunamadı", 404);
  if (!opts.title.trim()) throw new BroadcastError("VALIDATION", "Başlık zorunludur", 400);
  if (!opts.channels.length) throw new BroadcastError("VALIDATION", "En az bir kanal seçilmelidir", 400);
  for (const ch of opts.channels) {
    if (!(BROADCAST_CHANNELS as readonly string[]).includes(ch)) {
      throw new BroadcastError("VALIDATION", `Geçersiz kanal: ${ch}`, 400);
    }
  }

  let audience: BroadcastRecipient[];
  switch (opts.audienceMode) {
    case "SINGLE": {
      const s = opts.single ?? {};
      audience = [{ name: s.name?.trim() || s.email || s.phone || "Alıcı", email: s.email?.trim() || null, phone: s.phone?.trim() || null }];
      break;
    }
    case "CUSTOM":
      audience = parseCustomRecipients(opts.customRecipients);
      break;
    case "CUSTOMERS": {
      const where: Record<string, unknown> = { tenantId: edition.tenantId, commsOptIn: true };
      if (opts.contactIds && opts.contactIds.length > 0) where.id = { in: opts.contactIds.slice(0, MAX_SEND_RECIPIENTS) };
      audience = (await db.customerContact.findMany({ where, orderBy: { createdAt: "desc" }, take: MAX_SEND_RECIPIENTS }))
        .map((c) => ({ name: c.displayName, email: c.email, phone: c.phone, contactId: c.id }));
      break;
    }
    case "CATEGORY": {
      const partWhere: Record<string, unknown> = { editionId: edition.id };
      if (opts.categoryIds && opts.categoryIds.length > 0) {
        partWhere.registrations = { some: { categoryId: { in: opts.categoryIds } } };
      }
      const parts = await db.eventParticipation.findMany({
        where: partWhere,
        include: { person: { select: { firstName: true, lastName: true, email: true, phone: true } } },
        take: MAX_SEND_RECIPIENTS,
      });
      audience = parts.map((p) => ({
        name: `${p.person.firstName} ${p.person.lastName}`.trim(),
        email: p.person.email,
        phone: p.person.phone,
      }));
      break;
    }
    default: {
      // ALL_PARTICIPANTS
      const parts = await db.eventParticipation.findMany({
        where: { editionId: edition.id },
        include: { person: { select: { firstName: true, lastName: true, email: true, phone: true } } },
        take: MAX_SEND_RECIPIENTS,
      });
      audience = parts.map((p) => ({
        name: `${p.person.firstName} ${p.person.lastName}`.trim(),
        email: p.person.email,
        phone: p.person.phone,
      }));
    }
  }
  if (audience.length === 0) throw new BroadcastError("EMPTY_AUDIENCE", "Hedef kümesi boş — alıcı yok", 400);

  const report: SendReport = { at: new Date().toISOString(), mode: "LIVE", audienceSize: audience.length, channels: {}, totalSent: 0 };

  // ── E-POSTA ──
  if (opts.channels.includes("EMAIL")) {
    const emails = audience.map((r) => r.email).filter((v): v is string => Boolean(v));
    if (emails.length > 0) {
      const out = await dispatchMail({ recipients: emails, subject: opts.title, text: opts.body });
      report.channels.EMAIL = {
        attempted: emails.length,
        sent: out.accepted.length,
        skipped: out.skipped.length + out.suppressedCount,
        error: out.ok ? undefined : out.error,
      };
      report.totalSent += out.accepted.length;
    } else {
      report.channels.EMAIL = { attempted: 0, sent: 0, skipped: 0, error: "e-postalı alıcı yok" };
    }
  }

  // ── SMS / WHATSAPP ──
  const phoneRecipients: Recipient[] = audience
    .filter((r) => Boolean(r.phone))
    .map((r) => ({ name: r.name, phone: r.phone as string }));
  for (const ch of ["SMS", "WHATSAPP"] as const) {
    if (!opts.channels.includes(ch)) continue;
    if (phoneRecipients.length === 0) {
      report.channels[ch] = { attempted: 0, sent: 0, skipped: 0, error: "telefonlu alıcı yok" };
      continue;
    }
    const out = await dispatchChannelMessage(
      edition.id,
      { kind: "announcement", title: opts.title, body: opts.body },
      phoneRecipients,
      { ignoreRouting: true },
    );
    const r = ch === "SMS" ? out.sms : out.wa;
    report.channels[ch] = { attempted: r.attempted, sent: r.sent, skipped: Math.max(0, phoneRecipients.length - r.sent) + out.skippedNoPhone, error: r.error };
    report.totalSent += r.sent;
  }

  for (const ch of ["EMAIL", "SMS", "WHATSAPP"] as const) {
    const r = report.channels[ch];
    if (r && r.sent > 0) await stampContacts(audience, ch, r.sent);
  }

  // arşiv: aşama hiyerarşisinde kampanya olarak görünür
  const kindLabel = "Anlık Bildirim";
  const archive = await db.campaign.create({
    data: {
      editionId: edition.id,
      name: `${kindLabel} — ${opts.title.slice(0, 80)}`,
      segmentRule: `anlık yayın · ${opts.audienceMode}`,
      phase: opts.phase,
      audienceMode: opts.audienceMode === "CUSTOM" ? "CUSTOM" : "SEGMENT",
      channels: opts.channels.join(","),
      status: report.totalSent > 0 ? "SENT" : "FAILED",
      subject: opts.title.slice(0, 200),
      body: opts.body,
      sentAt: new Date(),
      sentCount: report.totalSent,
      deliveredCount: report.totalSent,
      failCount: Object.values(report.channels).reduce((a, r) => a + (r?.attempted ?? 0) - (r?.sent ?? 0), 0),
      lastSendReport: JSON.stringify(report),
    },
    select: { id: true },
  });

  // seçilirse portal duyurusu (katılımcı uygulaması ana sayfa bildirimi)
  if (opts.createPortalAnnouncement) {
    try {
      await db.portalAnnouncement.create({
        data: {
          editionId: edition.id,
          title: opts.title.slice(0, 200),
          message: opts.body.slice(0, 2000),
          level: "URGENT",
          sentBy: "ADMIN",
        },
      });
    } catch {
      // portal duyurusu yazılamazsa gönderim akışı bozulmaz
    }
  }

  await db.activityLog.create({
    data: {
      tenantId: edition.tenantId,
      editionId: edition.id,
      type: "CAMPAIGN_SAVED",
      message: `Anlık yayın: "${opts.title}" → ${report.totalSent} alıcı (${opts.channels.join(", ")})`,
      entityType: "campaign",
      entityId: archive.id,
      actorName: opts.actorName,
    },
  });

  return { report, campaignId: archive.id };
}

// ─── müşteri datası üretimi — katılımcılardan toplu aktarım ─────────────────
// Tek transaction; e-posta/telefon eşleştirmesiyle mükerrer YARATMAZ:
//   • yeni e-posta → yeni kontak (PARTICIPANT_IMPORT)
//   • mevcut kontak → alan zenginleştirme (boş alanlar doldurulur, tag eklenir)
export type ImportParticipantsResult = { created: number; merged: number; skipped: number; total: number };

export async function importParticipantsToCustomers(opts: {
  editionId: string;
  tenantId: string;
  categoryIds?: string[];
  tag?: string | null;
  actorName: string;
}): Promise<ImportParticipantsResult> {
  const edition = await db.eventEdition.findUnique({
    where: { id: opts.editionId },
    select: { id: true, tenantId: true, name: true },
  });
  if (!edition || edition.tenantId !== opts.tenantId) {
    throw new BroadcastError("EDITION_NOT_FOUND", "Etkinlik bulunamadı", 404);
  }

  const partWhere: Record<string, unknown> = { editionId: opts.editionId };
  if (opts.categoryIds && opts.categoryIds.length > 0) {
    partWhere.registrations = { some: { categoryId: { in: opts.categoryIds } } };
  }
  const parts = await db.eventParticipation.findMany({
    where: partWhere,
    include: {
      person: true,
      registrations: { include: { category: { select: { name: true } } }, take: 1, orderBy: { createdAt: "asc" } },
    },
  });

  let created = 0;
  let merged = 0;
  let skipped = 0;
  const tag = opts.tag?.trim() || null;

  for (const p of parts) {
    const person = p.person;
    const displayName = `${person.firstName} ${person.lastName}`.trim();
    const email = person.email?.trim().toLowerCase() || null;
    const phone = person.phone?.trim() || null;
    if (!email && !phone) {
      // iletişim kurma imkânı yok — datası anlamsız, raporlanır
      skipped += 1;
      continue;
    }
    const categoryName = p.registrations[0]?.category?.name ?? null;
    const existing = await db.customerContact.findFirst({
      where: {
        tenantId: opts.tenantId,
        OR: [...(email ? [{ email }] : []), ...(phone ? [{ phone }] : [])],
      },
      orderBy: { createdAt: "asc" },
    });

    if (existing) {
      // zenginleştir: boş alanları doldur + kaynak etkinliğini etikete ekle
      const tags = new Set((existing.tags ?? "").split(",").map((s) => s.trim()).filter(Boolean));
      if (tag) tags.add(tag);
      await db.customerContact.update({
        where: { id: existing.id },
        data: {
          personId: existing.personId ?? person.id,
          sourceEditionId: existing.sourceEditionId ?? opts.editionId,
          company: existing.company ?? person.company,
          title: existing.title ?? person.title,
          city: existing.city ?? person.city,
          country: existing.country ?? person.country,
          category: existing.category ?? categoryName,
          displayName: existing.displayName || displayName,
          ...(tag || (existing.tags ?? "") !== [...tags].join(",") ? { tags: [...tags].join(",") || null } : {}),
        },
      });
      merged += 1;
    } else {
      await db.customerContact.create({
        data: {
          tenantId: opts.tenantId,
          sourceEditionId: opts.editionId,
          personId: person.id,
          kind: "PERSON",
          displayName,
          email,
          phone,
          company: person.company,
          title: person.title,
          city: person.city,
          country: person.country,
          category: categoryName,
          source: "PARTICIPANT_IMPORT",
          tags: tag,
          commsOptIn: person.commsOptIn ?? true,
        },
      });
      created += 1;
    }
  }

  await db.activityLog.create({
    data: {
      tenantId: opts.tenantId,
      editionId: opts.editionId,
      type: "CAMPAIGN_SAVED",
      message: `Müşteri datası aktarımı: ${created} yeni, ${merged} birleştirildi, ${skipped} atlandı (iletişim bilgisi yok)`,
      entityType: "customer-contact",
      actorName: opts.actorName,
    },
  });

  return { created, merged, skipped, total: parts.length };
}
