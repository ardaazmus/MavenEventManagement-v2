// TASK-A F1: Yönetici önizleme belirteci — YÖNETİCİ YÜZEYİ İÇİNDİR (kiracı bağlamı zorunlu).
// Dış portal ekranı (portals.tsx) gerçek portal verisini gerçek kapıyla görüntüler:
// bu uç yöneticiye KISA ÖMÜRLÜ (varsayılan 30 dk, en çok 4 saat) bir önizleme
// yetenek belirteci çıkarır; ham değer yanıtta BİR KEZ döner, istemci belleğinde
// tutulur (ekranda gösterilmez, saklanmaz). Kalıcı katılımcı/sponsor belirteçleri
// registration-approval kanalında çıkarılır (flows: registration.decide).
// Belirteçler sha256-hash ile PortalToken tablosunda yaşar — burada düzyazı yok.
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { resolveEditionContext, GuardError } from "@/lib/api/tenant-guard";
import { issuePortalToken } from "@/lib/api/portal-tokens";
import { enforceRateLimit } from "@/lib/rate-limit";
import { requireAdmin } from "@/lib/auth/request-context";

export async function POST(req: NextRequest) {
  // P1 (yeni-fazlar 4): önizleme belirteci çıkarımı YETKİLİ YÖNETİCİ işlemidir — katılımcı/
  // sponsor portalları kendi kalıcı token'larını registration-approval kanalından alır.
  const gate = await requireAdmin();
  if (gate) return gate;
  try {
    // S3 kapısı: belirteç çıkarımı istismar edilemez — 20/dk/IP
    const denied = enforceRateLimit(req, { key: "portal-preview", limit: 20, windowMs: 60_000 });
    if (denied) return denied;

    const body = (await req.json()) as { editionId?: string; personId?: string; organizationId?: string; ttlMinutes?: number };
    const { editionId, personId, organizationId, ttlMinutes } = body;
    if (!editionId || (!personId && !organizationId) || (personId && organizationId)) {
      return NextResponse.json({ error: "editionId ve (personId XOR organizationId) zorunlu" }, { status: 400 });
    }
    // kiracı bağlamı: edisyon çözülemiyorsa çıkarım yok (bogus/yabancı → 404)
    try {
      await resolveEditionContext(editionId);
    } catch (e) {
      if (e instanceof GuardError) return NextResponse.json({ error: e.message }, { status: e.status });
      throw e;
    }

    const ttlMs = Math.min(Math.max((ttlMinutes ?? 30) * 60_000, 60_000), 4 * 3_600_000); // 1dk..4sa
    if (personId) {
      // kişi bu edisyonda mı? (yabancı kişiye belirteç çıkarılmaz)
      const participation = await db.eventParticipation.findUnique({
        where: { editionId_personId: { editionId, personId } },
        select: { id: true },
      });
      if (!participation) return NextResponse.json({ error: "Kişi bu etkinlikte katılımcı değil" }, { status: 404 });
      const { token, expiresAt } = await issuePortalToken({
        scope: "PARTICIPANT", editionId, personId, ttlMs, issuedBy: "PREVIEW",
      });
      return NextResponse.json({ token, expiresAt: expiresAt.toISOString(), scope: "PARTICIPANT" });
    }

    const organization = await db.organization.findFirst({
      where: { id: organizationId!, sponsorAgreements: { some: { editionId } } },
      select: { id: true },
    });
    if (!organization) return NextResponse.json({ error: "Kurumun bu etkinlikte sponsor sözleşmesi yok" }, { status: 404 });
    const { token, expiresAt } = await issuePortalToken({
      scope: "SPONSOR", editionId, organizationId, ttlMs, issuedBy: "PREVIEW",
    });
    return NextResponse.json({ token, expiresAt: expiresAt.toISOString(), scope: "SPONSOR" });
  } catch (e) {
    console.error("portal/preview-token:", e);
    return NextResponse.json({ error: "Önizleme belirteci çıkarılamadı" }, { status: 500 });
  }
}

// yönetici: belirteç yaşam döngüsü denetimi — ham değer ASLA dönmez (yalnız hash ön eki + durum)
export async function GET(req: NextRequest) {
  const gate = await requireAdmin(); // P1: belirteç yaşam-döngüsü listesi yönetici yüzeyi
  if (gate) return gate;
  try {
    const editionId = req.nextUrl.searchParams.get("editionId");
    if (!editionId) return NextResponse.json({ error: "editionId zorunlu" }, { status: 400 });
    await resolveEditionContext(editionId);
    const rows = await db.portalToken.findMany({
      where: { editionId },
      orderBy: { issuedAt: "desc" },
      take: 50,
      select: {
        id: true, scope: true, personId: true, organizationId: true,
        issuedAt: true, issuedBy: true, expiresAt: true, revokedAt: true, lastUsedAt: true, tokenHash: true,
      },
    });
    const now = Date.now();
    return NextResponse.json({
      items: rows.map((r) => ({
        id: r.id, scope: r.scope, personId: r.personId, organizationId: r.organizationId,
        issuedAt: r.issuedAt, issuedBy: r.issuedBy, expiresAt: r.expiresAt,
        revokedAt: r.revokedAt, lastUsedAt: r.lastUsedAt,
        hashPrefix: r.tokenHash.slice(0, 8), // denetim için yalnız ön ek — ham değer/hash tam hali dönmez
        state: r.revokedAt ? "REVOKED" : r.expiresAt.getTime() <= now ? "EXPIRED" : "ACTIVE",
      })),
    });
  } catch (e) {
    if (e instanceof GuardError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("portal/preview-token GET:", e);
    return NextResponse.json({ error: "Belirteç listesi alınamadı" }, { status: 500 });
  }
}

// iptal (revokedAt yolu) — gövde { id }
export async function PATCH(req: NextRequest) {
  const gate = await requireAdmin(); // P1: iptal yetkili yönetici işlemidir
  if (gate) return gate;
  try {
    const body = (await req.json()) as { id?: string };
    const id = body.id ?? req.nextUrl.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id zorunlu" }, { status: 400 });
    const row = await db.portalToken.findUnique({ where: { id }, select: { editionId: true, revokedAt: true } });
    if (!row) return NextResponse.json({ error: "Belirteç bulunamadı" }, { status: 404 });
    await resolveEditionContext(row.editionId);
    if (row.revokedAt) return NextResponse.json({ ok: true, alreadyRevoked: true });
    const updated = await db.portalToken.update({ where: { id }, data: { revokedAt: new Date() } });
    return NextResponse.json({ ok: true, revokedAt: updated.revokedAt?.toISOString() ?? null });
  } catch (e) {
    if (e instanceof GuardError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("portal/preview-token PATCH:", e);
    return NextResponse.json({ error: "Belirteç iptal edilemedi" }, { status: 500 });
  }
}
