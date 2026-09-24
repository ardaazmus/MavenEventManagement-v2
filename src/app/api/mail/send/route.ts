// /api/mail/send — İşlemsel e-posta gönderim motoru (S3: istismara kapalı tasarım)
// POST { to | recipients[], subject, text, html?, editionId?, providerId? }
// Kontrol zinciri (hepsi geçilmeden gönderim yapılmaz):
//   1. Oran sınırı: 30 istek/dk/IP (brute-force/istismar)
//   2. Bağlam: provider kiracıya ait olmalı (resolveContext)
//   3. Günlük kota: provider.dailyLimit + bugünkü OUTBOUND MAIL sayısı (IntegrationLog)
//   4. Bastırma listesi: MailSuppression'daki adreslere ASLA gönderim yapılmaz (KVKK çıkış)
//   5. Alıcı başına soğuma: aynı alıcıya 60 sn içinde ikinci gönderim reddedilir
//   6. Denetim: her gönderim IntegrationLog'a düşer (PII'siz özet — alıcı adresi maskeli)
// NOT: Sandbox ortamında gerçek SMTP/API çağrısı yapılmaz (kimlik bilgisi yok);
// motor sağlayıcı ayarlarını doğrular, tüm istismar denetimlerini çalıştırır ve
// gönderim kaydını üretir — gerçek taşıyıcı (nodemailer/API) A4 sonrası bağlanır.
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { resolveContext } from "@/lib/api/tenant-guard";
import { enforceRateLimit } from "@/lib/rate-limit";

const RECIPIENT_COOLDOWN_MS = 60_000;
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

// alıcı adresi logda maskeli: a***@d***.com
const maskEmail = (email: string) => {
  const [local, domain] = email.split("@");
  return `${local.slice(0, 1)}***@${(domain ?? "").split(".")[0].slice(0, 1)}***.${(domain ?? "").split(".").slice(1).join(".") || "com"}`;
};

export async function POST(req: NextRequest) {
  // 1) oran sınırı
  const denied = enforceRateLimit(req, { key: "mail-send", limit: 30, windowMs: 60_000 });
  if (denied) return denied;

  try {
    const body = (await req.json()) as {
      to?: string; recipients?: string[]; subject?: string; text?: string; html?: string;
      editionId?: string; providerId?: string;
    };

    const recipients = [...new Set([...(body.recipients ?? []), ...(body.to ? [body.to] : [])]
      .map((e) => (e ?? "").trim().toLowerCase())
      .filter(Boolean))];
    if (recipients.length === 0) return NextResponse.json({ error: "En az bir alıcı (to/recipients) zorunlu" }, { status: 400 });
    if (recipients.length > 200) return NextResponse.json({ error: "Tek istekte en fazla 200 alıcı" }, { status: 422 });
    if (!body.subject?.trim() || (!body.text?.trim() && !body.html?.trim())) {
      return NextResponse.json({ error: "subject ve (text | html) zorunlu" }, { status: 422 });
    }
    const bad = recipients.filter((e) => !EMAIL_RE.test(e));
    if (bad.length > 0) return NextResponse.json({ error: `Geçersiz adres: ${bad.length} adet` }, { status: 422 });

    // 2) bağlam + sağlayıcı
    const ctx = await resolveContext(null);
    const provider = body.providerId
      ? await db.mailProviderConfig.findFirst({ where: { id: body.providerId, tenantId: ctx } })
      : await db.mailProviderConfig.findFirst({ where: { tenantId: ctx, status: "ACTIVE", isDefault: true } })
        ?? await db.mailProviderConfig.findFirst({ where: { tenantId: ctx, status: "ACTIVE" } });
    if (!provider) return NextResponse.json({ error: "Aktif mail sağlayıcısı yok — Ayarlar → Entegrasyonlardan tanımlayın" }, { status: 404 });

    // 3) günlük kota
    const dayStart = new Date(); dayStart.setHours(0, 0, 0, 0);
    const sentToday = await db.integrationLog.count({
      where: { direction: "OUTBOUND", method: "MAIL", ok: true, createdAt: { gte: dayStart } },
    });
    const dailyLimit = provider.dailyLimit ?? 1000;
    if (sentToday + recipients.length > dailyLimit) {
      return NextResponse.json(
        { error: `Günlük kota aşıldı (${sentToday}/${dailyLimit}) — gönderim reddedildi` },
        { status: 429 },
      );
    }

    // 4) bastırma listesi — liste'dekilere ASLA gönderim
    const suppressed = await db.mailSuppression.findMany({
      where: { tenantId: ctx, email: { in: recipients } },
      select: { email: true, reason: true },
    });
    const suppressedMap = new Map(suppressed.map((s) => [s.email, s.reason]));
    const deliverable = recipients.filter((e) => !suppressedMap.has(e));

    // 5) alıcı soğuması — son 60 sn içinde gönderim yapılan adresler
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

    // 6) gönderim kaydı (simülasyon) — payload yalnız adres kümesi (soğuma denetimi için)
    const durationMs = 1; // taşıyıcı bağlandığında gerçek süre yazılır
    await db.integrationLog.create({
      data: {
        direction: "OUTBOUND", method: "MAIL",
        endpoint: `${provider.kind}:${provider.host ?? provider.kind}`,
        statusCode: accepted.length > 0 ? 250 : 550,
        ok: accepted.length > 0,
        durationMs,
        summary: `Gönderim: ${accepted.length} kabul, ${skipped.length + suppressedMap.size} atlandı (bastırma: ${suppressedMap.size}, soğuma: ${skipped.length}) — "${body.subject.slice(0, 80)}"`,
        payload: JSON.stringify({ recipients: accepted, subject: body.subject.slice(0, 120) }),
      },
    });

    return NextResponse.json({
      ok: true,
      accepted: accepted.map(maskEmail),
      skipped,
      suppressedCount: suppressedMap.size,
      quota: { used: sentToday + accepted.length, dailyLimit },
      provider: { id: provider.id, name: provider.name, kind: provider.kind },
    });
  } catch (e) {
    console.error("POST /api/mail/send", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "Gönderim başarısız" }, { status: 500 });
  }
}

// Bastırma listesi yönetimi — GET: liste; PUT: ekle/güncelle (unsubscribe/bounce/şikayet/manuel)
export async function GET(req: NextRequest) {
  try {
    await resolveContext(null);
    const sp = req.nextUrl.searchParams;
    const q = sp.get("q")?.trim().toLowerCase();
    const rows = await db.mailSuppression.findMany({
      where: q ? { email: { contains: q } } : {},
      orderBy: { createdAt: "desc" },
      take: 500,
      select: { id: true, email: true, reason: true, note: true, createdAt: true },
    });
    return NextResponse.json({ items: rows });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Bastırma listesi okunamadı" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const denied = enforceRateLimit(req, { key: "mail-suppress", limit: 60, windowMs: 60_000 });
  if (denied) return denied;
  try {
    const ctx = await resolveContext(null);
    const body = (await req.json()) as { email?: string; reason?: string; note?: string };
    const email = body.email?.trim().toLowerCase();
    if (!email || !EMAIL_RE.test(email)) return NextResponse.json({ error: "Geçerli email zorunlu" }, { status: 400 });
    const reason = ["UNSUBSCRIBE", "BOUNCE", "COMPLAINT", "MANUAL"].includes(body.reason ?? "") ? body.reason! : "MANUAL";
    const row = await db.mailSuppression.upsert({
      where: { tenantId_email: { tenantId: ctx, email } },
      create: { tenantId: ctx, email, reason, note: body.note ?? null },
      update: { reason, note: body.note ?? null },
    });
    return NextResponse.json(row, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Bastırma eklenemedi" }, { status: 500 });
  }
}
