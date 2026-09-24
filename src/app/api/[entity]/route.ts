// Generic collection route: /api/[entity]
// Faz A: tüm listeleme/oluşturma istekleri Tenant Guard'dan geçer —
// tenant/edition kapsamı otomatik uygulanır, bağlam çözülemeyen istek 400 alır.
import { NextRequest, NextResponse } from "next/server";
import { registry, sanitize, withTenant } from "@/lib/api/registry";
import { applyListGuard, applyWriteGuard, GuardError } from "@/lib/api/tenant-guard";
import { db } from "@/lib/db";

type Ctx = { params: Promise<{ entity: string }> };

function notFound() {
  return NextResponse.json({ error: "Bilinmeyen varlık" }, { status: 404 });
}

function guardError(e: unknown) {
  if (e instanceof GuardError) return NextResponse.json({ error: e.message }, { status: e.status });
  return null;
}

export async function GET(req: NextRequest, ctx: Ctx) {
  const { entity } = await ctx.params;
  const config = registry[entity];
  if (!config) return notFound();

  const sp = req.nextUrl.searchParams;
  const where: Record<string, unknown> = { ...(config.defaultWhere ?? {}) };

  for (const f of config.filterFields ?? []) {
    const v = sp.get(f);
    if (v !== null && v !== "") {
      where[f] = v === "true" ? true : v === "false" ? false : v;
    }
  }
  const q = sp.get("q");
  if (q && config.searchFields?.length) {
    where.OR = config.searchFields.map((f) => ({ [f]: { contains: q } }));
  }

  const limit = Math.min(parseInt(sp.get("limit") ?? "200"), 500);

  try {
    await applyListGuard(entity, where, sp);
  } catch (e) {
    const ge = guardError(e);
    if (ge) return ge;
    console.error(`GET /api/${entity} [guard]`, e);
    return NextResponse.json({ error: "Kiracı izolasyonu uygulanamadı" }, { status: 500 });
  }

  try {
    const items = await config.delegate.findMany({
      where,
      include: config.include,
      orderBy: config.orderBy,
      take: limit,
    });
    return NextResponse.json({ items });
  } catch (e) {
    console.error(`GET /api/${entity}`, e);
    return NextResponse.json({ error: "Liste alınamadı" }, { status: 500 });
  }
}

export async function POST(req: NextRequest, ctx: Ctx) {
  const { entity } = await ctx.params;
  const config = registry[entity];
  if (!config) return notFound();

  try {
    const body = await req.json();
    let data = await withTenant(entity, sanitize(body));
    try {
      data = await applyWriteGuard(entity, data); // Faz A: tenantId sunucu bağlamından yazılır
    } catch (e) {
      const ge = guardError(e);
      if (ge) return ge;
      throw e;
    }
    const created = await config.delegate.create({ data, include: config.include });

    if (config.auditType) {
      await db.activityLog.create({
        data: {
          type: config.auditType,
          message: config.auditMessage?.(data as Record<string, unknown>, "create") ?? "Kayıt oluşturuldu",
          entityType: entity,
          entityId: (created as { id?: string })?.id ?? null,
          actorName: "Yönetici",
        },
      });
    }
    return NextResponse.json(created, { status: 201 });
  } catch (e) {
    console.error(`POST /api/${entity}`, e);
    const msg = e instanceof Error && e.message.includes("Unique constraint") ? "Bu kayıt zaten mevcut (benzersiz alan çakışması)" : "Kayıt oluşturulamadı";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
