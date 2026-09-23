import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { buildPlanSnapshot } from "@/lib/api/floor";

export const dynamic = "force-dynamic";

// GET /api/floor-studio/sync?editionId=...
// Floor Studio uygulamasının "çek" (pull) ucu — plan anlık görünümünü döner.
export async function GET(req: NextRequest) {
  const editionId = req.nextUrl.searchParams.get("editionId");
  if (!editionId) {
    return NextResponse.json({ error: "editionId zorunlu" }, { status: 400 });
  }
  const snapshot = await buildPlanSnapshot(editionId);
  if (!snapshot.edition) {
    return NextResponse.json({ error: "Edisyon bulunamadı" }, { status: 404 });
  }
  return NextResponse.json({ ...snapshot, direction: "PULL" });
}

// POST /api/floor-studio/sync
// Floor Studio uygulamasının "it" (push) ucu — geometri upsert + durum değişikliği.
// Body: {
//   editionId, source?: string,
//   changes: [{ boothUnitId, x?, y?, width?, height?, rotation?, label? }],
//   statusChanges?: [{ boothUnitId, status }]
// }
const BOOTH_STATUSES = ["AVAILABLE", "HELD", "OPTION", "RESERVED", "CONTRACTED", "BLOCKED", "OCCUPIED", "RELEASED"];

export async function POST(req: NextRequest) {
  let body: {
    editionId?: string;
    source?: string;
    changes?: { boothUnitId: string; x?: number; y?: number; width?: number; height?: number; rotation?: number; label?: string }[];
    statusChanges?: { boothUnitId: string; status: string }[];
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Geçersiz JSON" }, { status: 400 });
  }

  const { editionId, source = "floor-studio-app", changes = [], statusChanges = [] } = body;
  if (!editionId) {
    return NextResponse.json({ error: "editionId zorunlu" }, { status: 400 });
  }

  // tüm booth'lar bu edisyona ait mi? (ortak kimlik bütünlüğü — §20)
  const ids = [...new Set([...changes.map((c) => c.boothUnitId), ...statusChanges.map((s) => s.boothUnitId)])];
  const owned = await db.boothUnit.findMany({ where: { id: { in: ids }, editionId }, select: { id: true, code: true } });
  const ownedIds = new Set(owned.map((o) => o.id));
  const foreign = ids.filter((id) => !ownedIds.has(id));
  if (foreign.length > 0) {
    return NextResponse.json({ error: `${foreign.length} stant bu edisyona ait değil (ortak kimlik ihlali)` }, { status: 409 });
  }

  let geometryUpdated = 0;
  for (const c of changes) {
    const data: Record<string, number | string> = {};
    for (const k of ["x", "y", "width", "height", "rotation"] as const) {
      if (typeof c[k] === "number" && Number.isFinite(c[k])) data[k] = c[k]!;
    }
    if (typeof c.label === "string") data.label = c.label;
    await db.floorPlanObject.upsert({
      where: { boothUnitId: c.boothUnitId },
      create: { boothUnitId: c.boothUnitId, ...data },
      update: data,
    });
    geometryUpdated++;
  }

  let statusesChanged = 0;
  const statusErrors: string[] = [];
  for (const s of statusChanges) {
    if (!BOOTH_STATUSES.includes(s.status)) {
      statusErrors.push(`${s.boothUnitId}: bilinmeyen durum ${s.status}`);
      continue;
    }
    await db.boothUnit.update({ where: { id: s.boothUnitId }, data: { status: s.status } });
    statusesChanged++;
  }

  const codeOf = (id: string) => owned.find((o) => o.id === id)?.code ?? id;
  const summaryBits: string[] = [];
  if (geometryUpdated) summaryBits.push(`${geometryUpdated} geometri`);
  if (statusesChanged) summaryBits.push(`${statusesChanged} durum`);
  await db.activityLog.create({
    data: {
      editionId,
      type: "BOOTHS_SAVED",
      message: `Floor Studio senkronizasyonu (${source}): ${summaryBits.join(" + ") || "değişiklik yok"}${statusesChanged ? ` — ${statusChanges.slice(0, 3).map((s) => codeOf(s.boothUnitId)).join(", ")}${statusChanges.length > 3 ? "…" : ""}` : ""}`,
      entityType: "FloorPlanObject",
      actorName: source === "maven" ? "Maven Plan Editörü" : "Floor Studio",
    },
  });

  return NextResponse.json({
    ok: true,
    geometryUpdated,
    statusesChanged,
    statusErrors,
    syncedAt: new Date().toISOString(),
  });
}
