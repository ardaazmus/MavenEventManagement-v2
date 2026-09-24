// TASK-B 25: Portal Blokları — düzenleyici (organizer) yönetim yüzeyi.
// Katılımcı/sponsor portalına duyuru, banner, bilgi, bağlantı ve özel içerik
// blokları eklenir; görünürlük ve sıra düzenleyicinin kontrolündedir.
//
// Güvenlik modeli (TASK-A F1 çizgisi korunur): /api/portal/* auth-kapalı yüzeydir
// (middleware PUBLIC_PREFIXES) — bu yüzey KENDİ kapısıyla korunur:
//   * her metot enforceRateLimit (S3) + resolveEditionContext (kiracı bağlamı)
//   * PATCH/DELETE kaydın kendi editionId'si üzerinden bağlam doğrular (IDOR kapalı)
//   * gövdeler kiracı sırrı ASLA yankılamaz; ActivityLog kayıtları PII içermez
//     (yalnız blok türü/başlık — düzenleyici içeriğidir, kişisel veri değildir).
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { resolveEditionContext, GuardError } from "@/lib/api/tenant-guard";
import { enforceRateLimit } from "@/lib/rate-limit";
import { requireAdmin } from "@/lib/auth/request-context";

const AUDIENCES = new Set(["PARTICIPANT", "SPONSOR", "BOTH"]);
const TYPES = new Set(["ANNOUNCEMENT", "BANNER", "INFO", "LINK", "CUSTOM"]);

function guardJson(e: unknown) {
  if (e instanceof GuardError) return NextResponse.json({ error: e.message }, { status: e.status });
  return null;
}

// payloadJson kabul: JSON dizesi veya nesne — ayrıştırılınca düz nesne OLMALI
// (dizi/skalar red). Depoda JSON dizesi yaşar (PortalBlock.payloadJson String?).
function parsePayload(raw: unknown): { ok: true; value: string | null } | { ok: false } {
  if (raw === undefined || raw === null || raw === "") return { ok: true, value: null };
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return { ok: false };
      return { ok: true, value: raw };
    } catch {
      return { ok: false };
    }
  }
  if (typeof raw === "object" && !Array.isArray(raw)) {
    return { ok: true, value: JSON.stringify(raw) };
  }
  return { ok: false };
}

// günlük yardımcı — PII yok: yalnız blok türü + başlık (düzenleyici içeriği)
function logBlock(editionId: string, message: string, blockId: string) {
  return db.activityLog.create({
    data: { editionId, type: "PORTAL_BLOCK_SAVED", message, entityType: "portal-block", entityId: blockId, actorName: "Yönetici" },
  });
}

const SELECT = { id: true, editionId: true, audience: true, type: true, title: true, payloadJson: true, order: true, isVisible: true, createdAt: true, updatedAt: true } as const;

export async function GET(req: NextRequest) {
  // P1 (yeni-fazlar 4): portal blok editörü CRUD yetkili yönetici yüzeyidir;
  // katılımcı/sponsor okuması token-korumalı portal/participant + portal/sponsor uçlarındadır.
  const gate = await requireAdmin();
  if (gate) return gate;
  try {
    // S3: yönetim listesi istismar edilemez — 60/dk/IP
    const denied = enforceRateLimit(req, { key: "portal-blocks-read", limit: 60, windowMs: 60_000 });
    if (denied) return denied;
    const editionId = req.nextUrl.searchParams.get("editionId");
    // düzenleyici yüzeyi: edisyon kiracı bağlamında ÇÖZÜLMELİ (bogus/yabancı → 404)
    const ctx = await resolveEditionContext(editionId, { required: true });
    const editionIdResolved = ctx.editionId as string; // required:true → edisyon ÇÖZÜMLÜ
    const items = await db.portalBlock.findMany({
      where: { editionId: editionIdResolved },
      orderBy: [{ order: "asc" }, { createdAt: "asc" }],
      select: SELECT,
    });
    return NextResponse.json({ items });
  } catch (e) {
    const ge = guardJson(e);
    if (ge) return ge;
    console.error("portal/blocks GET:", e);
    return NextResponse.json({ error: "Portal blokları alınamadı" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  // P1 (yeni-fazlar 4): portal blok editörü CRUD yetkili yönetici yüzeyidir;
  // katılımcı/sponsor okuması token-korumalı portal/participant + portal/sponsor uçlarındadır.
  const gate = await requireAdmin();
  if (gate) return gate;
  try {
    // S3: içerik yazımı istismar edilemez — 30/dk/IP
    const denied = enforceRateLimit(req, { key: "portal-blocks-write", limit: 30, windowMs: 60_000 });
    if (denied) return denied;
    const body = (await req.json()) as {
      editionId?: string; audience?: string; type?: string; title?: string;
      payloadJson?: unknown; order?: number; isVisible?: boolean;
    };
    if (!body.editionId) return NextResponse.json({ error: "editionId zorunlu" }, { status: 400 });
    const ctx = await resolveEditionContext(body.editionId, { required: true });
    const editionIdResolved = ctx.editionId as string; // required:true → edisyon ÇÖZÜMLÜ
    if (!body.audience || !AUDIENCES.has(body.audience)) {
      return NextResponse.json({ error: "audience PARTICIPANT|SPONSOR|BOTH olmalı" }, { status: 400 });
    }
    if (!body.type || !TYPES.has(body.type)) {
      return NextResponse.json({ error: "type ANNOUNCEMENT|BANNER|INFO|LINK|CUSTOM olmalı" }, { status: 400 });
    }
    const title = typeof body.title === "string" ? body.title.trim() : "";
    if (!title) return NextResponse.json({ error: "Başlık zorunlu" }, { status: 400 });
    const payload = parsePayload(body.payloadJson);
    if (!payload.ok) return NextResponse.json({ error: "payloadJson nesne biçiminde olmalı" }, { status: 400 });
    const order = Number.isFinite(Number(body.order)) ? Math.max(0, Math.round(Number(body.order))) : 0;

    const created = await db.portalBlock.create({
      data: {
        editionId: editionIdResolved,
        audience: body.audience,
        type: body.type,
        title,
        payloadJson: payload.value,
        order,
        isVisible: body.isVisible === undefined ? true : Boolean(body.isVisible),
      },
      select: SELECT,
    });
    await logBlock(editionIdResolved, `Portal bloğu oluşturuldu: ${created.type} — "${title}" (${created.audience})`, created.id);
    return NextResponse.json(created, { status: 201 });
  } catch (e) {
    const ge = guardJson(e);
    if (ge) return ge;
    console.error("portal/blocks POST:", e);
    return NextResponse.json({ error: "Portal bloğu oluşturulamadı" }, { status: 400 });
  }
}

export async function PATCH(req: NextRequest) {
  // P1 (yeni-fazlar 4): portal blok editörü CRUD yetkili yönetici yüzeyidir;
  // katılımcı/sponsor okuması token-korumalı portal/participant + portal/sponsor uçlarındadır.
  const gate = await requireAdmin();
  if (gate) return gate;
  try {
    const denied = enforceRateLimit(req, { key: "portal-blocks-write", limit: 30, windowMs: 60_000 });
    if (denied) return denied;
    const body = (await req.json()) as {
      id?: string; editionId?: string; audience?: string; type?: string; title?: string;
      payloadJson?: unknown; order?: number; isVisible?: boolean;
    };
    if (!body.id) return NextResponse.json({ error: "id zorunlu" }, { status: 400 });
    const row = await db.portalBlock.findUnique({ where: { id: body.id }, select: { editionId: true, title: true } });
    if (!row) return NextResponse.json({ error: "Portal bloğu bulunamadı" }, { status: 404 });
    // IDOR kapısı: kaydın kendi edisyonu bağlamla çözülmeli (body.editionId YOK SAYILIR)
    const ctx = await resolveEditionContext(row.editionId, { required: true });
    const editionIdResolved = ctx.editionId as string; // required:true → edisyon ÇÖZÜMLÜ

    const data: Record<string, unknown> = {};
    if (body.audience !== undefined) {
      if (!AUDIENCES.has(body.audience)) return NextResponse.json({ error: "audience PARTICIPANT|SPONSOR|BOTH olmalı" }, { status: 400 });
      data.audience = body.audience;
    }
    if (body.type !== undefined) {
      if (!TYPES.has(body.type)) return NextResponse.json({ error: "type ANNOUNCEMENT|BANNER|INFO|LINK|CUSTOM olmalı" }, { status: 400 });
      data.type = body.type;
    }
    if (body.title !== undefined) {
      const title = typeof body.title === "string" ? body.title.trim() : "";
      if (!title) return NextResponse.json({ error: "Başlık boş olamaz" }, { status: 400 });
      data.title = title;
    }
    if (body.payloadJson !== undefined) {
      const payload = parsePayload(body.payloadJson);
      if (!payload.ok) return NextResponse.json({ error: "payloadJson nesne biçiminde olmalı" }, { status: 400 });
      data.payloadJson = payload.value;
    }
    if (body.order !== undefined) {
      if (!Number.isFinite(Number(body.order))) return NextResponse.json({ error: "order sayısal olmalı" }, { status: 400 });
      data.order = Math.max(0, Math.round(Number(body.order)));
    }
    if (body.isVisible !== undefined) data.isVisible = Boolean(body.isVisible);

    const updated = await db.portalBlock.update({ where: { id: body.id }, data, select: SELECT });
    const flags = [
      data.audience !== undefined ? `audience=${updated.audience}` : null,
      data.order !== undefined ? `sıra=${updated.order}` : null,
      data.isVisible !== undefined ? (updated.isVisible ? "görünür" : "gizli") : null,
    ].filter(Boolean).join(" · ");
    await logBlock(editionIdResolved, `Portal bloğu güncellendi: "${updated.title}"${flags ? ` (${flags})` : ""}`, updated.id);
    return NextResponse.json(updated);
  } catch (e) {
    const ge = guardJson(e);
    if (ge) return ge;
    console.error("portal/blocks PATCH:", e);
    return NextResponse.json({ error: "Portal bloğu güncellenemedi" }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest) {
  // P1 (yeni-fazlar 4): portal blok editörü CRUD yetkili yönetici yüzeyidir;
  // katılımcı/sponsor okuması token-korumalı portal/participant + portal/sponsor uçlarındadır.
  const gate = await requireAdmin();
  if (gate) return gate;
  try {
    const denied = enforceRateLimit(req, { key: "portal-blocks-write", limit: 30, windowMs: 60_000 });
    if (denied) return denied;
    const id = req.nextUrl.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id zorunlu" }, { status: 400 });
    const row = await db.portalBlock.findUnique({ where: { id }, select: { editionId: true, title: true } });
    if (!row) return NextResponse.json({ error: "Portal bloğu bulunamadı" }, { status: 404 });
    const ctx = await resolveEditionContext(row.editionId, { required: true });
    const editionIdResolved = ctx.editionId as string; // required:true → edisyon ÇÖZÜMLÜ
    await db.portalBlock.delete({ where: { id } });
    await logBlock(editionIdResolved, `Portal bloğu silindi: "${row.title}"`, id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const ge = guardJson(e);
    if (ge) return ge;
    console.error("portal/blocks DELETE:", e);
    return NextResponse.json({ error: "Portal bloğu silinemedi" }, { status: 400 });
  }
}
