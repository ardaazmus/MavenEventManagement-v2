// FORM-EXP2 — İşlemsel e-posta gönderim çekirdeği (paylaşımlı motor).
// /api/mail/send (manuel gönderim arayüzü) ve public-register (form gönderim bildirimi)
// AYNI motoru kullanır: günlük kota + bastırma listesi + alıcı soğuması + IntegrationLog
// denetimleri tek noktada — bir yüzeye eklenen koruma diğerine otomatik gelir.
// NOT: Sandbox'ta gerçek SMTP taşıyıcısı yoktur; motor sağlayıcıyı doğrular ve
// gönderim kaydını üretir (A4 sonrası nodemailer/API bağlanır).
// P3.13 dersi: iç HTTP self-request YASAK (auth-on'da 401) — bu yüzden lib'e çıkarıldı.
import { db } from "@/lib/db";
import { resolveContext } from "@/lib/api/tenant-guard";

export const RECIPIENT_COOLDOWN_MS = 60_000;
export const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

// alıcı adresi logda maskeli: a***@d***.com
export const maskEmail = (email: string) => {
  const [local, domain] = email.split("@");
  return `${local.slice(0, 1)}***@${(domain ?? "").split(".")[0].slice(0, 1)}***.${(domain ?? "").split(".").slice(1).join(".") || "com"}`;
};

export interface DispatchInput {
  recipients: string[]; // normalize edilmiş (trim+lowercase), benzersiz
  subject: string;
  text?: string;
  html?: string;
  providerId?: string; // belirli sağlayıcı (boşsa varsayılan/ilk aktif)
}

export interface DispatchResult {
  ok: boolean;
  accepted: string[]; // maskesiz — çağıran gerektiğinde maskeler
  skipped: { email: string; reason: string }[]; // email maskeli
  suppressedCount: number;
  quota: { used: number; dailyLimit: number };
  provider: { id: string; name: string; kind: string } | null;
  error?: string; // ok=false iken insan-okur neden (mevcut route mesajlarıyla birebir)
}

/**
 * Gönderim çekirdeği: bağlam → sağlayıcı → günlük kota → bastırma → soğuma → kayıt.
 * Hata fırlatmaz — result.error ile raporlar (fire-and-forget çağıranlar için güvenli).
 */
export async function dispatchMail(input: DispatchInput): Promise<DispatchResult> {
  const empty: DispatchResult = {
    ok: false, accepted: [], skipped: [], suppressedCount: 0,
    quota: { used: 0, dailyLimit: 0 }, provider: null,
  };
  const recipients = [...new Set(input.recipients.map((e) => e.trim().toLowerCase()).filter(Boolean))];
  if (recipients.length === 0) return { ...empty, error: "En az bir alıcı (to/recipients) zorunlu" };

  try {
    // 1) bağlam + sağlayıcı
    const ctx = await resolveContext(null);
    const provider = input.providerId
      ? await db.mailProviderConfig.findFirst({ where: { id: input.providerId, tenantId: ctx } })
      : await db.mailProviderConfig.findFirst({ where: { tenantId: ctx, status: "ACTIVE", isDefault: true } })
        ?? await db.mailProviderConfig.findFirst({ where: { tenantId: ctx, status: "ACTIVE" } });
    if (!provider) {
      return { ...empty, error: "Aktif mail sağlayıcısı yok — Ayarlar → Entegrasyonlardan tanımlayın" };
    }

    // 2) günlük kota
    const dayStart = new Date(); dayStart.setHours(0, 0, 0, 0);
    const sentToday = await db.integrationLog.count({
      where: { direction: "OUTBOUND", method: "MAIL", ok: true, createdAt: { gte: dayStart } },
    });
    const dailyLimit = provider.dailyLimit ?? 1000;
    if (sentToday + recipients.length > dailyLimit) {
      return { ...empty, provider: { id: provider.id, name: provider.name, kind: provider.kind },
        error: `Günlük kota aşıldı (${sentToday}/${dailyLimit}) — gönderim reddedildi` };
    }

    // 3) bastırma listesi — liste'dekilere ASLA gönderim
    const suppressed = await db.mailSuppression.findMany({
      where: { tenantId: ctx, email: { in: recipients } },
      select: { email: true, reason: true },
    });
    const suppressedMap = new Map(suppressed.map((s) => [s.email, s.reason]));
    const deliverable = recipients.filter((e) => !suppressedMap.has(e));

    // 4) alıcı soğuması — son 60 sn içinde gönderim yapılan adresler
    const recentLogs = await db.integrationLog.findMany({
      where: { direction: "OUTBOUND", method: "MAIL", createdAt: { gte: new Date(Date.now() - RECIPIENT_COOLDOWN_MS) } },
      select: { payload: true },
      take: 500,
    });
    const cooled = new Set<string>();
    for (const log of recentLogs) {
      try {
        const payload = JSON.parse(log.payload ?? "{}") as { recipients?: string[] };
        for (const r of payload.recipients ?? []) cooled.add(r);
      } catch { /* bozuk payload yoksayılır */ }
    }

    const accepted: string[] = [];
    const skipped: { email: string; reason: string }[] = [];
    for (const email of deliverable) {
      if (cooled.has(email)) skipped.push({ email: maskEmail(email), reason: "COOLDOWN" });
      else accepted.push(email);
    }

    // 5) gönderim kaydı (simülasyon) — payload yalnız adres kümesi (soğuma denetimi için)
    const durationMs = 1; // taşıyıcı bağlandığında gerçek süre yazılır
    await db.integrationLog.create({
      data: {
        direction: "OUTBOUND", method: "MAIL",
        endpoint: `${provider.kind}:${provider.host ?? provider.kind}`,
        statusCode: accepted.length > 0 ? 250 : 550,
        ok: accepted.length > 0,
        durationMs,
        summary: `Gönderim: ${accepted.length} kabul, ${skipped.length + suppressedMap.size} atlandı (bastırma: ${suppressedMap.size}, soğuma: ${skipped.length}) — "${input.subject.slice(0, 80)}"`,
        payload: JSON.stringify({ recipients: accepted, subject: input.subject.slice(0, 120) }),
      },
    });

    return {
      ok: accepted.length > 0,
      accepted, skipped, suppressedCount: suppressedMap.size,
      quota: { used: sentToday + accepted.length, dailyLimit },
      provider: { id: provider.id, name: provider.name, kind: provider.kind },
    };
  } catch (e) {
    console.error("dispatchMail", e instanceof Error ? e.message : e);
    return { ...empty, error: e instanceof Error ? e.message : "Gönderim başarısız" };
  }
}
