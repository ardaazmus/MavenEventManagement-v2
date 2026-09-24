// Generic item route: /api/[entity]/[id]
// Faz A + G0-a: tek kayıt işlemleri kiracı kapsamına alınır — başka kiracının kaydına
// id ile erişim 404 döner (IDOR koruması). ensureInScope artık tenant-guard'ta ortak:
// özel rotalar (people/[id], form-submissions/[id], payments/[id]/process…) aynı fonksiyonu kullanır.
import { NextRequest, NextResponse } from "next/server";
import { registry, sanitize } from "@/lib/api/registry";
import { applyWriteGuard, ensureInScope, GuardError } from "@/lib/api/tenant-guard";
import { issuePortalToken } from "@/lib/api/portal-tokens";
import { db } from "@/lib/db";

type Ctx = { params: Promise<{ entity: string; id: string }> };

function notFound(msg = "Bilinmeyen varlık") {
  return NextResponse.json({ error: msg }, { status: 404 });
}

export async function GET(_req: NextRequest, ctx: Ctx) {
  const { entity, id } = await ctx.params;
  const config = registry[entity];
  if (!config) return notFound();
  try {
    const scoped = await ensureInScope(entity, id);
    if (!scoped.ok) return NextResponse.json({ error: scoped.error }, { status: scoped.status });
    const item = await config.delegate.findUnique({ where: { id }, include: config.include });
    if (!item) return notFound("Kayıt bulunamadı");
    // S3: sır içeren yanıt maskelenir
    const safeItem = config.readMask ? config.readMask(item as Record<string, unknown>) : item;
    return NextResponse.json(safeItem);
  } catch (e) {
    if (e instanceof GuardError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error(`GET /api/${entity}/${id}`, e);
    return NextResponse.json({ error: "Kayıt alınamadı" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, ctx: Ctx) {
  const { entity, id } = await ctx.params;
  const config = registry[entity];
  if (!config) return notFound();
  try {
    const scoped = await ensureInScope(entity, id);
    if (!scoped.ok) return NextResponse.json({ error: scoped.error }, { status: scoped.status });

    const body = await req.json();
    let data = sanitize(body);
    data = await applyWriteGuard(entity, data, { isUpdate: true });
    if (config.writeTransform) data = await config.writeTransform(data, true); // S3: sır şifreleme
    // TASK-A F1: sponsor sözleşmesi AKTİF'e geçerken (ilk geçiş) portal yetenek
    // belirteci çıkarılır — ham değer bu yanıtta BİR KEZ döner (tek görünlük).
    let beforeStatus: string | null = null;
    if (entity === "sponsor-agreements" && data.status === "ACTIVE") {
      const cur = await config.delegate.findUnique({ where: { id }, select: { status: true, editionId: true, organizationId: true } }) as { status: string; editionId: string; organizationId: string | null } | null;
      beforeStatus = cur?.status ?? null;
    }
    const updated = await config.delegate.update({ where: { id }, data, include: config.include });
    let issuedPortalToken: { token: string; expiresAt: string; scope: string } | null = null;
    if (entity === "sponsor-agreements" && data.status === "ACTIVE" && beforeStatus !== "ACTIVE") {
      const row = updated as unknown as { editionId: string; organizationId: string | null };
      if (row.organizationId) {
        const issued = await issuePortalToken({ scope: "SPONSOR", editionId: row.editionId, organizationId: row.organizationId, issuedBy: "AGREEMENT_ACTIVATION" });
        issuedPortalToken = { token: issued.token, expiresAt: issued.expiresAt.toISOString(), scope: "SPONSOR" };
      }
    }
    if (config.auditType) {
      await db.activityLog.create({
        data: {
          type: config.auditType,
          message: config.auditMessage?.(data as Record<string, unknown>, "update") ?? "Kayıt güncellendi",
          entityType: entity,
          entityId: id,
          actorName: "Yönetici",
        },
      });
    }
    // S3: sır içeren yanıt maskelenir · TASK-A F1: tek görünlük belirteç eki
    const safeUpdated = config.readMask ? config.readMask(updated as Record<string, unknown>) : updated;
    return NextResponse.json(issuedPortalToken ? { ...(safeUpdated as Record<string, unknown>), issuedPortalToken } : safeUpdated);
  } catch (e) {
    if (e instanceof GuardError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error(`PUT /api/${entity}/${id}`, e);
    return NextResponse.json({ error: "Güncelleme başarısız" }, { status: 400 });
  }
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const { entity, id } = await ctx.params;
  const config = registry[entity];
  if (!config) return notFound();
  try {
    if (entity === "tenants") return NextResponse.json({ error: "Kiracı kaydı silinemez" }, { status: 400 });
    const scoped = await ensureInScope(entity, id);
    if (!scoped.ok) return NextResponse.json({ error: scoped.error }, { status: scoped.status });
    await config.delegate.delete({ where: { id } });
    if (config.auditType) {
      await db.activityLog.create({
        data: {
          type: config.auditType,
          message: config.auditMessage?.({}, "delete") ?? "Kayıt silindi",
          entityType: entity,
          entityId: id,
          actorName: "Yönetici",
        },
      });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof GuardError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error(`DELETE /api/${entity}/${id}`, e);
    return NextResponse.json({ error: "Silme başarısız — bağlantılı kayıtlar olabilir" }, { status: 400 });
  }
}
