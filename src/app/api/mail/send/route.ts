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
import { dispatchMail, maskEmail, EMAIL_RE } from "@/lib/mail-dispatch";
import { enforceRateLimit } from "@/lib/rate-limit";
import { db } from "@/lib/db";
import { resolveContext } from "@/lib/api/tenant-guard";

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

    // 2-6) motor: bağlam + sağlayıcı + kota + bastırma + soğuma + denetim kaydı
    // (FORM-EXP2: çekirdek src/lib/mail-dispatch.ts'e taşındı — form gönderim bildirimi
    // aynı motoru kullanır; davranış ve yanıt sözleşmesi birebir korunur)
    const result = await dispatchMail({
      recipients,
      subject: body.subject.trim(),
      text: body.text,
      html: body.html,
      providerId: body.providerId,
    });
    if (result.error && !result.provider) {
      // sağlayıcı yok → 404 (mevcut sözleşme)
      return NextResponse.json({ error: result.error }, { status: 404 });
    }
    if (result.error) {
      // kota aşıldı → 429 (mevcut sözleşme)
      return NextResponse.json({ error: result.error }, { status: 429 });
    }

    return NextResponse.json({
      ok: true,
      accepted: result.accepted.map(maskEmail),
      skipped: result.skipped,
      suppressedCount: result.suppressedCount,
      quota: result.quota,
      provider: result.provider,
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
