// /api/kvkk/erasure — KVKK veri silme talebi (K7)
// POST  (PUBLIC giriş): { email, note? } → PENDING talep + 30 gün SLA (dueAt);
//        kişisel veri döndürmez, oran sınırı 5/saat/IP.
// GET   (iç): talep listesi + SLA durumu + ≤6 ay sweep (eski açık talepler otomatik tamamlanır).
// PATCH (iç): { id, action: "verify"|"preview"|"complete"|"reject", rejectReason?, handledBy? }
// P18.4: preview kuru-çalıştırır; complete bekletme tarar (bekletme → 409 + holds).
//        verify    → kayıt e-posta eşleşmesi (kişi bulunursa personId bağlanır)
//        complete  → ANONİMLEŞTİRME (tombstone): kimlik alanları silinir, katılım/finans
//                    geçmişi yasal saklama için kalır (KVKK m.5 veri azaltma ile uyumlu)
//        reject    → yasal saklama yükümlülüğü (legal hold) gerekçesi ZORUNLU
// Her geçiş ActivityLog'a düşer (3 yıl saklama ilkesi — op log).
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { resolveContext } from "@/lib/api/tenant-guard";
import { enforceRateLimit } from "@/lib/rate-limit";
import { requireStaff } from "@/lib/auth/request-context";
import { detectLegalHolds, executeErasure, previewErasure, ErasureJobError } from "@/lib/compliance/erasure-job";

const SLA_DAYS = 30;
const SWEEP_MONTHS = 6;

// anonimleştirme sabitleri — tombstone: gerçekler ASLA geri çözülemez
const ANON = { firstName: "Silinmiş", lastName: "Kullanıcı", email: null, phone: null, photoUrl: null, bio: null, linkedin: null, title: null };

async function log(tenantId: string | null, editionId: string | null, message: string) {
  await db.activityLog.create({ data: { tenantId, editionId, type: "OTHER", message, entityType: "KvkkErasureRequest", actorName: "KVKK Süreci" } }).catch(() => undefined);
}

export async function POST(req: NextRequest) {
  const denied = enforceRateLimit(req, { key: "kvkk-entry", limit: 5, windowMs: 3_600_000 });
  if (denied) return denied;
  try {
    const body = (await req.json()) as { email?: string; note?: string };
    const email = body.email?.trim().toLowerCase();
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return NextResponse.json({ error: "Geçerli e-posta zorunlu" }, { status: 422 });
    }
    const tenant = await db.tenant.findFirst({ select: { id: true } });
    if (!tenant) return NextResponse.json({ error: "Başvuru alınamadı" }, { status: 404 });
    const dueAt = new Date(Date.now() + SLA_DAYS * 86_400_000);
    const row = await db.kvkkErasureRequest.create({
      data: { tenantId: tenant.id, email, note: body.note?.slice(0, 500) ?? null, dueAt },
      select: { id: true, dueAt: true, status: true },
    });
    await log(tenant.id, null, `KVKK silme talebi alındı (SLA: ${dueAt.toLocaleDateString("tr-TR")})`);
    return NextResponse.json({
      ok: true,
      reference: row.id,
      dueAt: row.dueAt,
      message: "Talebiniz alındı — 30 gün içinde yanıtlanacak.",
    }, { status: 201 });
  } catch (e) {
    console.error("POST /api/kvkk/erasure", e);
    return NextResponse.json({ error: "Talep alınamadı" }, { status: 500 });
  }
}

// ≤6 ay sweep: PENDING/VERIFIED talepler requestedAt + 6 ay geçtiyse otomatik tamamlanır (son çare silme)
async function sweepStale(tenantId: string): Promise<number> {
  const cutoff = new Date(Date.now() - SWEEP_MONTHS * 30 * 86_400_000);
  const stale = await db.kvkkErasureRequest.findMany({
    where: { tenantId, status: { in: ["PENDING", "VERIFIED"] }, requestedAt: { lt: cutoff } },
    select: { id: true, email: true, personId: true },
  });
  for (const r of stale) {
    // P18.4: sweep de bekletmeye saygı duyar — bekletmeli talep açık kalır.
    if (r.personId) {
      const holds = await detectLegalHolds(db as never, { tenantId, personId: r.personId }).catch(() => []);
      if (holds.length > 0) {
        await log(tenantId, null, `KVKK sweep atlandı (yasal bekletme): ${holds.map((h) => h.detail).join(", ")}`);
        continue;
      }
      await db.person.update({ where: { id: r.personId }, data: ANON }).catch(() => undefined);
    }
    await db.kvkkErasureRequest.update({
      where: { id: r.id },
      data: { status: "COMPLETED", completedAt: new Date(), handledBy: "6 ay sweep (otomatik)" },
    });
    await log(tenantId, null, `KVKK sweep: ${SWEEP_MONTHS} ay açık kalan talep otomatik tamamlandı`);
  }
  return stale.length;
}

export async function GET(req: NextRequest) {
  // P1 (yeni-fazlar 4): KVKK liste/sweep YETKİLİ PERSONEL yüzeyidir — public giriş POST'tan
  // ayrıdır. auth-on: oturum + staff rolü zorunlu; auth-off demo davranışı korunur.
  const gate = await requireStaff();
  if (gate) return gate;
  try {
    const ctx = await resolveContext(null);
    const swept = await sweepStale(ctx);
    const items = await db.kvkkErasureRequest.findMany({
      where: { tenantId: ctx },
      orderBy: { requestedAt: "desc" },
      take: 200,
      select: { id: true, email: true, personId: true, status: true, note: true, rejectReason: true, requestedAt: true, dueAt: true, completedAt: true, handledBy: true },
    });
    const now = Date.now();
    return NextResponse.json({
      items: items.map((r) => ({
        ...r,
        slaBreached: (r.status === "PENDING" || r.status === "VERIFIED") ? now > r.dueAt.getTime() : false,
        daysLeft: (r.status === "PENDING" || r.status === "VERIFIED") ? Math.ceil((r.dueAt.getTime() - now) / 86_400_000) : null,
      })),
      swept,
      retentionNote: "Silme işlemleri anonimleştirmedir: katılım ve finans geçmişi yasal saklama süresince korunur. İşlem günlükleri 3 yıl saklanır.",
    });
  } catch (e) {
    console.error("GET /api/kvkk/erasure", e);
    return NextResponse.json({ error: "Talepler okunamadı" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  // P1 (yeni-fazlar 4): verify/complete/reject YETKİLİ PERSONEL işlemidir (anonimleştirme
  // geri-dönülemez — kimlik denetimi zorunlu). auth-off demo davranışı korunur.
  const gate = await requireStaff();
  if (gate) return gate;
  const denied = enforceRateLimit(req, { key: "kvkk-handle", limit: 30, windowMs: 60_000 });
  if (denied) return denied;
  try {
    const ctx = await resolveContext(null);
    const body = (await req.json()) as { id?: string; action?: string; rejectReason?: string; handledBy?: string };
    if (!body.id || !body.action) return NextResponse.json({ error: "id ve action zorunlu" }, { status: 400 });
    const row = await db.kvkkErasureRequest.findFirst({ where: { id: body.id, tenantId: ctx } });
    if (!row) return NextResponse.json({ error: "Talep bulunamadı" }, { status: 404 });
    const by = body.handledBy ?? "KVKK Sorumlusu";

    if (body.action === "verify") {
      const person = await db.person.findFirst({ where: { email: row.email, tenantId: ctx, status: { not: "MERGED" } }, select: { id: true } });
      const updated = await db.kvkkErasureRequest.update({
        where: { id: row.id },
        data: { status: "VERIFIED", verifiedAt: new Date(), personId: person?.id ?? null, handledBy: by },
      });
      await log(ctx, null, `KVKK talebi doğrulandı: ${row.email.slice(0, 2)}*** ${person ? "(kişi eşleşti)" : "(kişi bulunamadı — manuel inceleme)"}`);
      return NextResponse.json(updated);
    }

    if (body.action === "preview") {
      // P18.4: kuru-çalıştırma — yazmaz, etkilenim + bekletme raporlar.
      if (!row.personId) return NextResponse.json({ error: "Kişi eşleşmesi yok — önce verify" }, { status: 409 });
      try {
        const preview = await previewErasure(db as never, { tenantId: ctx, personId: row.personId });
        return NextResponse.json({ requestId: row.id, ...preview });
      } catch (e) {
        if (e instanceof ErasureJobError) return NextResponse.json({ error: e.message }, { status: e.status });
        throw e;
      }
    }

    if (body.action === "complete") {
      // P18.4: bekletme taramalı yürütme (tombstone + rıza geri çekme + denetim).
      try {
        const { personId, preview } = await executeErasure(db as never, { tenantId: ctx, requestId: row.id, handledBy: by });
        const updated = await db.kvkkErasureRequest.findUnique({ where: { id: row.id } });
        return NextResponse.json({ ...updated, personId, preservedCounts: preview.preservedCounts });
      } catch (e) {
        if (e instanceof ErasureJobError) {
          return NextResponse.json({ error: e.message, holds: e.holds }, { status: e.status });
        }
        throw e;
      }
    }

    if (body.action === "reject") {
      const reason = body.rejectReason?.trim();
      if (!reason || reason.length < 10) {
        return NextResponse.json({ error: "Yasal saklama gerekçesi zorunlu (legal hold) — en az 10 karakter" }, { status: 422 });
      }
      const updated = await db.kvkkErasureRequest.update({
        where: { id: row.id },
        data: { status: "REJECTED", rejectReason: reason, handledBy: by },
      });
      await log(ctx, null, `KVKK talebi REDDEDİLDİ (legal hold): ${reason.slice(0, 80)}`);
      return NextResponse.json(updated);
    }

    return NextResponse.json({ error: "Bilinmeyen aksiyon (verify|preview|complete|reject)" }, { status: 400 });
  } catch (e) {
    console.error("PATCH /api/kvkk/erasure", e);
    return NextResponse.json({ error: e instanceof Error ? e.message : "İşlem başarısız" }, { status: 500 });
  }
}
