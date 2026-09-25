// ═══ DIŞ BİLDİRİM KANAL ÇEKİRDEĞİ — WhatsApp (şirket mobil telefonu) + SMS ══
// MailProviderConfig/dispatchMail deseniyle birebir aynı yaklaşım:
//  • sağlayıcı-bağımsız gönderim çekirdeği (tek nokta — yeni yüzeyler bu lib'i çağırır)
//  • sırlar AES-256-GCM şifreli (secrets.ts) — loglara sır/PII YAZILMAZ
//  • her gönderim IntegrationLog'a iz bırakır (denetim + günlük kota temeli)
//  • hata FIRLATMAZ — DispatchResult ile raporlar (fire-and-forget güvenli)
// Sandbox/çevrimdışı ortamda DEMO sağlayıcısı ağa çıkmadan akışı doğrular;
// gerçek sağlayıcıda META_CLOUD/TWILIO/ULTRAMSG/WAHA/NETGSM/ILETIMERKEZI/VERIMOR
// uçları aranır (bkz. README-level yorumlar her sender'da).
import { db } from "@/lib/db";
import { decryptSecret } from "@/lib/secrets";

// ─── telefon normalleştirme (E.164) ─────────────────────────────────────────
// TR varsayılanı: 05XX… / 5XX… / 90 5XX… → +905XX…; zaten +'lı ise dokunulmaz.
export function normalizePhone(raw: string | null | undefined, defaultCountry = "TR"): string | null {
  if (!raw) return null;
  const digits = String(raw).replace(/[^\d+]/g, "");
  if (!digits) return null;
  if (digits.startsWith("+")) return digits.length >= 8 && digits.length <= 16 ? digits : null;
  if (defaultCountry === "TR") {
    const d = digits.replace(/^0+/, "");
    if (/^5\d{9}$/.test(d)) return `+90${d}`;
    if (/^90\d{10}$/.test(digits)) return `+${digits}`;
  }
  // başka ülke: 8-15 hane kabul (yeterli doğrulama — sağlayıcı reddederse loglanır)
  return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : null;
}

// ─── tipler ─────────────────────────────────────────────────────────────────
export type ChannelRow = {
  channelsEnabled: boolean;
  waEnabled: boolean; waProvider: string | null; waEndpoint: string | null;
  waPhoneId: string | null; waAccountId: string | null; waFrom: string | null; waTokenCipher: string | null;
  smsEnabled: boolean; smsProvider: string | null; smsEndpoint: string | null;
  smsSenderId: string | null; smsFrom: string | null; smsAccountId: string | null; smsTokenCipher: string | null;
  eventsJson: string | null;
};

export interface ChannelMessage {
  kind: "announcement" | "b2b" | "reminder" | "magicLink"; // eventsJson anahtarlarıyla birebir
  title: string;
  body: string; // WhatsApp/SMS gövdesi (parça bölme sağlayıcıda)
}

export interface Recipient { name: string; phone: string | null }

export interface ChannelDispatchResult {
  ok: boolean; // en az bir kanal en az bir alıcıya gönderdi mi
  wa: { attempted: number; sent: number; provider: string | null; error?: string };
  sms: { attempted: number; sent: number; provider: string | null; error?: string };
  skippedNoPhone: number;
}

const MAX_RECIPIENTS_PER_DISPATCH = 100; // tek duyuruda dış-kanal tavanı (maliyet koruması)
const SEND_TIMEOUT_MS = 10_000;

export function eventRouting(cfg: ChannelRow): Record<string, boolean> {
  const fallback: Record<string, boolean> = { announcement: true, b2b: true, reminder: false, magicLink: false };
  if (!cfg.eventsJson) return fallback;
  try {
    const p = JSON.parse(cfg.eventsJson) as Record<string, unknown>;
    return { ...fallback, ...Object.fromEntries(Object.entries(p).map(([k, v]) => [k, Boolean(v)])) };
  } catch {
    return fallback;
  }
}

// ─── alt düzey göndericiler — her biri {ok,status,detail} döner ─────────────
type SenderOutcome = { ok: boolean; status: number; detail: string };

async function httpSend(url: string, init: RequestInit): Promise<SenderOutcome> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), SEND_TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal });
    const text = (await res.text()).slice(0, 300);
    return { ok: res.ok, status: res.status, detail: text || "(boş yanıt)" };
  } catch (e) {
    return { ok: false, status: 0, detail: e instanceof Error ? e.message : "ağ hatası" };
  } finally {
    clearTimeout(timer);
  }
}

// WhatsApp gönderimi — sağlayıcı sözleşmeleri:
//  META_CLOUD: POST graph.facebook.com/v20.0/{phoneId}/messages (Bearer token, type=text)
//  TWILIO:     POST api.twilio.com/2010-04-01/Accounts/{sid}/Messages.json (Basic, From=whatsapp:+…)
//  ULTRAMSG:   POST api.ultramsg.com/{instance}/messages/chat (token, to, body)
//  WAHA:       POST {endpoint}/api/sendText ({session, chatId, text}) — şirket telefonu WAHA köprüsü
//  GENERIC_WEBHOOK: POST {endpoint} {phone, text, title} — kendi köprüsü olan kurumlar
//  DEMO:       ağa çıkmaz — akış doğrulaması için simulated ok
async function sendWhatsAppOne(cfg: ChannelRow, to: string, text: string): Promise<SenderOutcome> {
  const token = decryptSecret(cfg.waTokenCipher) ?? "";
  const provider = cfg.waProvider ?? "";
  const toWs = provider === "TWILIO" ? `whatsapp:${to}` : to;
  switch (provider) {
    case "DEMO":
      return { ok: true, status: 200, detail: `SIMULATED: WhatsApp → ${to} (${text.length} krk)` };
    case "META_CLOUD": {
      const phoneId = cfg.waPhoneId ?? "";
      return httpSend(`https://graph.facebook.com/v20.0/${encodeURIComponent(phoneId)}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ messaging_product: "whatsapp", to: to.replace(/^\+/, ""), type: "text", text: { preview_url: false, body: text } }),
      });
    }
    case "TWILIO": {
      const sid = cfg.waAccountId ?? ""; // Twilio Account SID
      const form = new URLSearchParams({ To: toWs, From: `whatsapp:${cfg.waFrom ?? ""}`, Body: text });
      return httpSend(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/Messages.json`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}` },
        body: form.toString(),
      });
    }
    case "ULTRAMSG": {
      const instance = cfg.waPhoneId ?? "";
      return httpSend(`https://api.ultramsg.com/${encodeURIComponent(instance)}/messages/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ token, to, body: text }).toString(),
      });
    }
    case "WAHA": {
      const base = (cfg.waEndpoint ?? "").replace(/\/+$/, "");
      return httpSend(`${base}/api/sendText`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { "X-Api-Key": token } : {}) },
        body: JSON.stringify({ session: cfg.waPhoneId ?? "default", chatId: `${to.replace(/^\+/, "")}@c.us`, text }),
      });
    }
    case "GENERIC_WEBHOOK": {
      const base = (cfg.waEndpoint ?? "").replace(/\/+$/, "");
      if (!base) return { ok: false, status: 0, detail: "Webhook adresi tanımsız" };
      return httpSend(base, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ phone: to, text }),
      });
    }
    default:
      return { ok: false, status: 0, detail: "Sağlayıcı tanımsız" };
  }
}

// SMS gönderimi — sağlayıcı sözleşmeleri:
//  TWILIO:        Messages.json (From = sayısal/alfebetik gönderici)
//  NETGSM:        REST v2 send (Basic usercode:password)
//  ILETIMERKEZI:  v1 send-sms (key+hash form)
//  VERIMOR:       v2/send.json (token query)
//  GENERIC_WEBHOOK: POST {endpoint} {phone, text, sender}
//  DEMO:          simulated ok
async function sendSmsOne(cfg: ChannelRow, to: string, text: string): Promise<SenderOutcome> {
  const token = decryptSecret(cfg.smsTokenCipher) ?? "";
  const provider = cfg.smsProvider ?? "";
  const sender = cfg.smsSenderId ?? cfg.smsFrom ?? "";
  switch (provider) {
    case "DEMO":
      return { ok: true, status: 200, detail: `SIMULATED: SMS → ${to} (${text.length} krk)` };
    case "TWILIO": {
      const sid = cfg.smsAccountId ?? ""; // Twilio Account SID
      const form = new URLSearchParams({ To: to, From: sender || (cfg.smsFrom ?? ""), Body: text });
      return httpSend(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/Messages.json`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded", Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}` },
        body: form.toString(),
      });
    }
    case "NETGSM": {
      const base = (cfg.smsEndpoint ?? "https://api.netgsm.com.tr").replace(/\/+$/, "");
      return httpSend(`${base}/sms/rest/v2/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Basic ${Buffer.from(`${cfg.smsAccountId ?? ""}:${token}`).toString("base64")}` },
        body: JSON.stringify({ msgheader: sender, messages: [{ msg: text, no: to.replace(/^\+/, "") }], encoding: "turkish" }),
      });
    }
    case "ILETIMERKEZI": {
      const [key, hash] = token.split("::");
      return httpSend("https://api.iletimerkezi.com/v1/send-sms", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          key: key ?? "", hash: hash ?? "", sender,
          message: text, numbers: to.replace(/^\+/, ""),
        }).toString(),
      });
    }
    case "VERIMOR": {
      const base = (cfg.smsEndpoint ?? "https://sms.verimor.com.tr/api/v2").replace(/\/+$/, "");
      return httpSend(`${base}/send.json?username=${encodeURIComponent(sender)}&password=${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: sender, text, data: { sender }, to: [to.replace(/^\+/, "")] }),
      });
    }
    case "GENERIC_WEBHOOK": {
      const base = (cfg.smsEndpoint ?? "").replace(/\/+$/, "");
      if (!base) return { ok: false, status: 0, detail: "Webhook adresi tanımsız" };
      return httpSend(base, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ phone: to, text, sender }),
      });
    }
    default:
      return { ok: false, status: 0, detail: "Sağlayıcı tanımsız" };
  }
}

export async function logChannelBatch(
  editionId: string | null,
  method: "WHATSAPP" | "SMS",
  ok: boolean,
  summary: string,
): Promise<void> {
  try {
    await db.integrationLog.create({
      data: {
        editionId,
        direction: "OUTBOUND",
        method,
        endpoint: `channel:${method.toLowerCase()}`,
        ok,
        summary: summary.slice(0, 500),
      },
    });
  } catch {
    // log yazımı akışı bozmasın
  }
}

// ─── ana giriş: tek mesajı etkin kanallara dağıt ────────────────────────────
// Hata fırlatmaz; her kanal ayrı raporlanır. Alıcı tavanı maliyet korumasıdır.
export async function dispatchChannelMessage(
  editionId: string,
  message: ChannelMessage,
  recipients: Recipient[],
): Promise<ChannelDispatchResult> {
  const empty: ChannelDispatchResult = {
    ok: false,
    wa: { attempted: 0, sent: 0, provider: null },
    sms: { attempted: 0, sent: 0, provider: null },
    skippedNoPhone: 0,
  };
  try {
    const cfg = await db.notificationChannelConfig.findUnique({ where: { editionId } });
    if (!cfg || !cfg.channelsEnabled) return { ...empty, wa: { ...empty.wa, error: "kanal kapalı" } };
    const routing = eventRouting(cfg);
    if (!routing[message.kind]) return { ...empty, wa: { ...empty.wa, error: "olay yönlendirilmiyor" }, sms: { ...empty.sms, error: "olay yönlendirilmiyor" } };

    // telefonu çözülemeyen alıcılar atlanır (web-push/app-içi yine alır)
    const resolved: { name: string; phone: string }[] = [];
    let skippedNoPhone = 0;
    for (const r of recipients.slice(0, MAX_RECIPIENTS_PER_DISPATCH)) {
      const p = normalizePhone(r.phone);
      if (p) resolved.push({ name: r.name, phone: p });
      else skippedNoPhone += 1;
    }
    const text = message.title ? `${message.title}\n${message.body}` : message.body;

    const result: ChannelDispatchResult = { ...empty, skippedNoPhone };

    // ── WhatsApp ──
    if (cfg.waEnabled && resolved.length > 0) {
      result.wa.provider = cfg.waProvider ?? null;
      result.wa.attempted = resolved.length;
      let sent = 0;
      let firstErr: string | undefined;
      for (const r of resolved) {
        const out = await sendWhatsAppOne(cfg, r.phone, text);
        if (out.ok) sent += 1;
        else if (!firstErr) firstErr = `${out.status}: ${out.detail}`;
      }
      result.wa.sent = sent;
      result.wa.error = sent < resolved.length ? (firstErr ?? "kısmi hata") : undefined;
      await logChannelBatch(editionId, "WHATSAPP", sent > 0, `duyuru "${message.title}" → ${sent}/${resolved.length} WhatsApp gönderimi${firstErr ? ` · ${firstErr}` : ""}`);
    }

    // ── SMS ──
    if (cfg.smsEnabled && resolved.length > 0) {
      result.sms.provider = cfg.smsProvider ?? null;
      result.sms.attempted = resolved.length;
      let sent = 0;
      let firstErr: string | undefined;
      for (const r of resolved) {
        const out = await sendSmsOne(cfg, r.phone, text);
        if (out.ok) sent += 1;
        else if (!firstErr) firstErr = `${out.status}: ${out.detail}`;
      }
      result.sms.sent = sent;
      result.sms.error = sent < resolved.length ? (firstErr ?? "kısmi hata") : undefined;
      await logChannelBatch(editionId, "SMS", sent > 0, `duyuru "${message.title}" → ${sent}/${resolved.length} SMS gönderimi${firstErr ? ` · ${firstErr}` : ""}`);
    }

    result.ok = result.wa.sent > 0 || result.sms.sent > 0;
    return result;
  } catch (e) {
    return { ...empty, wa: { ...empty.wa, error: e instanceof Error ? e.message : "kanal hatası" } };
  }
}

// Tek-numara test gönderimi (admin "Test Gönder") — kanal yapılandırmasını doğrular.
export async function sendChannelTest(
  editionId: string,
  channel: "WHATSAPP" | "SMS",
  toPhone: string,
): Promise<{ ok: boolean; provider: string | null; status: number; detail: string }> {
  const cfg = await db.notificationChannelConfig.findUnique({ where: { editionId } });
  if (!cfg) return { ok: false, provider: null, status: 0, detail: "Kanal yapılandırması yok" };
  const phone = normalizePhone(toPhone);
  if (!phone) return { ok: false, provider: null, status: 0, detail: "Geçersiz telefon numarası" };
  const text = "Maven test mesajı — bu bir doğrulama gönderimidir.";
  const out = channel === "WHATSAPP"
    ? await sendWhatsAppOne(cfg as unknown as ChannelRow, phone, text)
    : await sendSmsOne(cfg as unknown as ChannelRow, phone, text);
  await logChannelBatch(editionId, channel, out.ok, `test → ${out.ok ? "başarılı" : "başarısız"} (${out.status}) ${out.detail}`);
  return { ok: out.ok, provider: channel === "WHATSAPP" ? cfg.waProvider : cfg.smsProvider, status: out.status, detail: out.detail };
}
