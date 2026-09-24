// Generic item route: /api/[entity]/[id]
// Faz A: tek kayıt işlemleri de kiracı kapsamına alınır — başka kiracının kaydına
// id ile erişim 404 döner (IDOR koruması).
import { NextRequest, NextResponse } from "next/server";
import { registry, sanitize } from "@/lib/api/registry";
import { applyWriteGuard, resolveContext, tenantIdOf, tenantSelectFor, GuardError } from "@/lib/api/tenant-guard";
import { db } from "@/lib/db";

type Ctx = { params: Promise<{ entity: string; id: string }> };

function notFound(msg = "Bilinmeyen varlık") {
  return NextResponse.json({ error: msg }, { status: 404 });
}

// kaydı kiracı select'iyle çek, bağlamla karşılaştır (null = bağsız, izinli)
async function ensureInScope(entity: string, id: string): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const config = registry[entity];
  const select = tenantSelectFor(entity);
  if (!config || !select) return { ok: true }; // kapsam haritası dışı — kurallı varlıklar haritalıdır
  if (entity === "tenants") {
    const ctx = await resolveContext(null);
    if (id !== ctx) return { ok: false, status: 404, error: "Kayıt bulunamadı" };
    return { ok: true };
  }
  const record = await config.delegate.findFirst({ where: { id }, ...(select as Record<string, unknown>) });
  if (!record) return { ok: false, status: 404, error: "Kayıt bulunamadı" };
  const owner = tenantIdOf(entity, record);
  if (owner) {
    const ctx = await resolveContext(null);
    if (owner !== ctx) return { ok: false, status: 404, error: "Kayıt bulunamadı" };
  }
  return { ok: true };
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
    return NextResponse.json(item);
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
    const updated = await config.delegate.update({ where: { id }, data, include: config.include });
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
    return NextResponse.json(updated);
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
