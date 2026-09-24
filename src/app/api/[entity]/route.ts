// Generic collection route: /api/[entity]
// Faz A: tüm listeleme/oluşturma istekleri Tenant Guard'dan geçer —
// tenant/edition kapsamı otomatik uygulanır, bağlam çözülemeyen istek 400 alır.
// P2: cursor pagination — opak base64 [...sortValues, id]; tüm orderBys benzersiz-olmayan
// olduğundan composite keyset zorunlu (id son halka). Yanıt yalnız devam varsa nextCursor ekler.
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

// keyset koşulu: [v1..vn] imleci için sözlüksel karşılaştırma
// (k1 > v1) VEYA (k1 = v1 VE k2 > v2) VEYA ... — asc:gt / desc:lt
function keysetWhere(order: [string, "asc" | "desc"][], values: unknown[]): Record<string, unknown> {
  const or: Record<string, unknown>[] = [];
  for (let i = 0; i < order.length; i++) {
    const clause: Record<string, unknown> = {};
    for (let j = 0; j < i; j++) clause[order[j][0]] = values[j];
    clause[order[i][0]] = { [order[i][1] === "asc" ? "gt" : "lt"]: values[i] };
    or.push(clause);
  }
  return { OR: or };
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
  } else if (q && config.relationSearch) {
    // P2: ilişki-uzanan serbest arama (ör. registrations: teyit no + kategori + kişi adı)
    Object.assign(where, config.relationSearch(q));
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

  // P2: composite keyset — orderBy (registry) + id son halka (tümü benzersiz-olmayan)
  const order = [
    ...(Object.entries(config.orderBy ?? {}) as [string, "asc" | "desc"][]),
    ["id", "asc"] as [string, "asc" | "desc"],
  ];
  const orderByArg = order.map(([k, d]) => ({ [k]: d }));

  const cursorRaw = sp.get("cursor");
  let cursorValues: unknown[] | null = null;
  if (cursorRaw) {
    try {
      const arr = JSON.parse(Buffer.from(cursorRaw, "base64url").toString("utf8")) as unknown;
      if (!Array.isArray(arr) || arr.length !== order.length) throw new Error("biçim");
      cursorValues = arr;
    } catch {
      return NextResponse.json({ error: "Geçersiz cursor" }, { status: 400 });
    }
  }

  try {
    const items = (await config.delegate.findMany({
      where: cursorValues ? { AND: [where, keysetWhere(order, cursorValues)] } : where,
      include: config.include,
      orderBy: orderByArg as Record<string, "asc" | "desc">[],
      take: limit + 1, // bir fazlası: devam var mı?
    })) as { id: string }[];

    let nextCursor: string | null = null;
    if (items.length > limit) {
      items.pop();
      const last = items[items.length - 1] as Record<string, unknown>;
      const sortValues = order.slice(0, -1).map(([k]) => last[k]);
      nextCursor = Buffer.from(JSON.stringify([...sortValues, last.id]), "utf8").toString("base64url");
    }
    // S3: sır içeren satırlar maskelenir (readMask)
    const safeItems = config.readMask ? (items as Record<string, unknown>[]).map(config.readMask) : items;
    return NextResponse.json(nextCursor ? { items: safeItems, nextCursor } : { items: safeItems });
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
    if (config.writeTransform) data = await config.writeTransform(data, false); // S3: sır şifreleme
    // DÜZELTME (server-side validation): varlık sözleşmesi (ör. editions tarih kuralı) —
    // UI devre dışı butonuna güvenilmez; sunucu 400 ile reddeder.
    if (config.validate) {
      const vErr = config.validate(data, false);
      if (vErr) return NextResponse.json({ error: vErr }, { status: 400 });
    }
    const created = await config.delegate.create({ data, include: config.include });
    // S3: sır içeren yanıt maskelenir
    const safeCreated = config.readMask ? config.readMask(created as Record<string, unknown>) : created;

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
    return NextResponse.json(safeCreated, { status: 201 });
  } catch (e) {
    console.error(`POST /api/${entity}`, e);
    const msg = e instanceof Error && e.message.includes("Unique constraint") ? "Bu kayıt zaten mevcut (benzersiz alan çakışması)" : "Kayıt oluşturulamadı";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
