// Generic item route: /api/[entity]/[id]
import { NextRequest, NextResponse } from "next/server";
import { registry, sanitize } from "@/lib/api/registry";
import { db } from "@/lib/db";

type Ctx = { params: Promise<{ entity: string; id: string }> };

export async function GET(_req: NextRequest, ctx: Ctx) {
  const { entity, id } = await ctx.params;
  const config = registry[entity];
  if (!config) return NextResponse.json({ error: "Bilinmeyen varlık" }, { status: 404 });
  try {
    const item = await config.delegate.findUnique({ where: { id }, include: config.include });
    if (!item) return NextResponse.json({ error: "Kayıt bulunamadı" }, { status: 404 });
    return NextResponse.json(item);
  } catch (e) {
    console.error(`GET /api/${entity}/${id}`, e);
    return NextResponse.json({ error: "Kayıt alınamadı" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, ctx: Ctx) {
  const { entity, id } = await ctx.params;
  const config = registry[entity];
  if (!config) return NextResponse.json({ error: "Bilinmeyen varlık" }, { status: 404 });
  try {
    const body = await req.json();
    const data = sanitize(body);
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
    console.error(`PUT /api/${entity}/${id}`, e);
    return NextResponse.json({ error: "Güncelleme başarısız" }, { status: 400 });
  }
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const { entity, id } = await ctx.params;
  const config = registry[entity];
  if (!config) return NextResponse.json({ error: "Bilinmeyen varlık" }, { status: 404 });
  try {
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
    console.error(`DELETE /api/${entity}/${id}`, e);
    return NextResponse.json({ error: "Silme başarısız — bağlantılı kayıtlar olabilir" }, { status: 400 });
  }
}
