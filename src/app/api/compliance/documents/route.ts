// /api/compliance/documents — Belge Sicili (TASK-B 20)
// GET  : tüm sürümler — kind asc, version desc; asset {id,name} minimal include.
// POST : yeni sürüm — { kind, title, notes?, externalUrl?, mediaAssetId?, content?, createdBy? }
//        content verilirse sha256 (hex 64, node:crypto) hesaplanır; verilmezse "LINKED".
//        TEK AKTİF güvencesi TRANSACTION içinde: aynı kind'ın önceki aktifleri active=false +
//        supersededBy=<yeni id>; yeni kayıt version = prevMax + 1.
// PATCH: { id, action: "ACTIVATE" | "ARCHIVE" } — ACTIVATE tek-aktifi devret (kardeşler supersededBy),
//        ARCHIVE yalnız devre dışı bırak.
import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { db } from "@/lib/db";
import { resolveContext, GuardError } from "@/lib/api/tenant-guard";

const KINDS = ["AYDINLATMA", "ACIK_RIZA", "VERI_SAKLAMA", "DST", "KVKK_POLITIKA", "E_FATURA", "VERBIS", "OTHER"] as const;
type DocKind = (typeof KINDS)[number];

const ASSET_SELECT = { select: { id: true, name: true } } as const;

interface CreateBody {
  kind?: string;
  title?: string;
  notes?: string;
  externalUrl?: string;
  mediaAssetId?: string;
  content?: string;
  createdBy?: string;
}

function fail(message: string): NextResponse {
  return NextResponse.json({ error: message }, { status: 422 });
}

export async function GET() {
  try {
    const tenantId = await resolveContext(null);
    const items = await db.documentRecord.findMany({
      where: { tenantId },
      orderBy: [{ kind: "asc" }, { version: "desc" }],
      take: 500,
      include: { asset: ASSET_SELECT },
    });
    return NextResponse.json({ items });
  } catch (e) {
    if (e instanceof GuardError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("GET /api/compliance/documents", e);
    return NextResponse.json({ error: "Belge sicili okunamadı" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const tenantId = await resolveContext(null);
    const body = (await req.json().catch(() => null)) as CreateBody | null;
    if (!body) return fail("Geçersiz istek gövdesi");

    const kind = body.kind;
    if (!kind || !(KINDS as readonly string[]).includes(kind)) {
      return fail(`kind zorunlu — şu değerlerden biri: ${KINDS.join(", ")}`);
    }
    const title = body.title?.trim() ?? "";
    if (!title) return fail("title zorunlu");
    if (title.length > 200) return fail("title en fazla 200 karakter");

    const notes = body.notes?.trim() ? body.notes.trim().slice(0, 1000) : null;
    const externalUrl = body.externalUrl?.trim() ? body.externalUrl.trim().slice(0, 500) : null;
    const createdBy = body.createdBy?.trim() ? body.createdBy.trim().slice(0, 80) : "Uyumluluk Modülü";

    const mediaAssetId = body.mediaAssetId?.trim() ? body.mediaAssetId.trim() : null;
    if (mediaAssetId) {
      const asset = await db.mediaAsset.findUnique({ where: { id: mediaAssetId }, select: { id: true } });
      if (!asset) return fail("Belirtilen medya varlığı bulunamadı");
    }

    // içerik bütünlüğü: metin verildiyse sha256 hex 64; bağlantı/boş ise "LINKED"
    const content = typeof body.content === "string" && body.content.length > 0 ? body.content : null;
    if (content && content.length > 200_000) return fail("content en fazla 200.000 karakter");
    const sha256 = content ? createHash("sha256").update(content, "utf8").digest("hex") : "LINKED";

    const created = await db.$transaction(async (tx) => {
      const prevMax = await tx.documentRecord.aggregate({
        where: { tenantId, kind },
        _max: { version: true },
      });
      const row = await tx.documentRecord.create({
        data: {
          tenantId,
          kind,
          version: (prevMax._max.version ?? 0) + 1,
          title,
          sha256,
          notes,
          externalUrl,
          mediaAssetId,
          createdBy,
          active: true,
        },
        include: { asset: ASSET_SELECT },
      });
      // TEK AKTİF: aynı kind'ın diğer aktiflerini arşivle ve yerini alan sürümü işaretle
      await tx.documentRecord.updateMany({
        where: { tenantId, kind, active: true, id: { not: row.id } },
        data: { active: false, supersededBy: row.id },
      });
      return row;
    });

    await db.activityLog
      .create({
        data: {
          tenantId,
          type: "OTHER",
          message: `Belge siciline sürüm eklendi: ${kind} v${created.version}`,
          entityType: "DocumentRecord",
          entityId: created.id,
          actorName: createdBy,
        },
      })
      .catch(() => undefined);

    return NextResponse.json(created, { status: 201 });
  } catch (e) {
    if (e instanceof GuardError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("POST /api/compliance/documents", e);
    return NextResponse.json({ error: "Belge kaydedilemedi" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const tenantId = await resolveContext(null);
    const body = (await req.json().catch(() => null)) as { id?: string; action?: string } | null;
    if (!body?.id || !body?.action) return NextResponse.json({ error: "id ve action zorunlu" }, { status: 400 });

    const row = await db.documentRecord.findFirst({ where: { id: body.id, tenantId } });
    if (!row) return NextResponse.json({ error: "Belge bulunamadı" }, { status: 404 });

    if (body.action === "ACTIVATE") {
      const updated = await db.$transaction(async (tx) => {
        // tek-aktif devri: kardeş sürümler arşivlenir + supersededBy bu sürümü gösterir
        await tx.documentRecord.updateMany({
          where: { tenantId, kind: row.kind, active: true, id: { not: row.id } },
          data: { active: false, supersededBy: row.id },
        });
        return tx.documentRecord.update({
          where: { id: row.id },
          data: { active: true, supersededBy: null },
          include: { asset: ASSET_SELECT },
        });
      });
      await db.activityLog
        .create({
          data: {
            tenantId,
            type: "OTHER",
            message: `Belge aktif sürüm yapıldı: ${row.kind} v${row.version}`,
            entityType: "DocumentRecord",
            entityId: row.id,
            actorName: "Uyumluluk Modülü",
          },
        })
        .catch(() => undefined);
      return NextResponse.json(updated);
    }

    if (body.action === "ARCHIVE") {
      const updated = await db.documentRecord.update({
        where: { id: row.id },
        data: { active: false },
        include: { asset: ASSET_SELECT },
      });
      await db.activityLog
        .create({
          data: {
            tenantId,
            type: "OTHER",
            message: `Belge arşivlendi: ${row.kind} v${row.version}`,
            entityType: "DocumentRecord",
            entityId: row.id,
            actorName: "Uyumluluk Modülü",
          },
        })
        .catch(() => undefined);
      return NextResponse.json(updated);
    }

    return NextResponse.json({ error: "Bilinmeyen aksiyon (ACTIVATE|ARCHIVE)" }, { status: 400 });
  } catch (e) {
    if (e instanceof GuardError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("PATCH /api/compliance/documents", e);
    return NextResponse.json({ error: "Belge güncellenemedi" }, { status: 500 });
  }
}
