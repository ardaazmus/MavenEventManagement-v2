import { db } from "@/lib/db";

// Floor Studio paylaşımlı plan anlık görünümü (§20: ortak kimlik = boothUnitId)
// Hem /api/floor-studio/plan hem /api/floor-studio/sync (GET) bu snapshot'ı döner.
export async function buildPlanSnapshot(editionId: string) {
  const edition = await db.eventEdition.findUnique({
    where: { id: editionId },
    select: { id: true, name: true, venueName: true },
  });

  const booths = await db.boothUnit.findMany({
    where: { editionId },
    orderBy: { code: "asc" },
    include: {
      allocation: { include: { organization: { select: { id: true, name: true } } } },
      floorObject: true,
    },
  });

  // dekor/servis objeleri — Floor Studio sahipli (boothUnitId null), Maven yalnızca görüntüler
  const decor = await db.floorPlanObject.findMany({ where: { boothUnitId: null } });

  const byStatus: Record<string, number> = {};
  let placedSqm = 0;
  let contractedRevenue = 0;
  let potentialRevenue = 0;
  let placed = 0;
  for (const b of booths) {
    byStatus[b.status] = (byStatus[b.status] ?? 0) + 1;
    if (b.floorObject) {
      placed++;
      placedSqm += b.sizeSqm;
    }
    if (["CONTRACTED", "RESERVED", "OCCUPIED"].includes(b.status)) contractedRevenue += b.price;
    if (b.status !== "BLOCKED") potentialRevenue += b.price;
  }

  return {
    edition,
    generatedAt: new Date().toISOString(),
    booths: booths.map((b) => ({
      id: b.id,
      code: b.code,
      sizeSqm: b.sizeSqm,
      type: b.type,
      status: b.status,
      price: b.price,
      currency: b.currency,
      optionExpiresAt: b.optionExpiresAt,
      allocation: b.allocation
        ? {
            id: b.allocation.id,
            status: b.allocation.status,
            organization: b.allocation.organization,
            agreementId: b.allocation.agreementId,
          }
        : null,
      floorObject: b.floorObject
        ? {
            id: b.floorObject.id,
            label: b.floorObject.label,
            x: b.floorObject.x,
            y: b.floorObject.y,
            width: b.floorObject.width,
            height: b.floorObject.height,
            rotation: b.floorObject.rotation,
          }
        : null,
    })),
    decor: decor.map((d) => ({
      id: d.id,
      label: d.label,
      x: d.x,
      y: d.y,
      width: d.width,
      height: d.height,
      rotation: d.rotation,
      layer: d.layer,
    })),
    summary: {
      total: booths.length,
      placed,
      unplaced: booths.length - placed,
      byStatus,
      totalSqm: booths.reduce((s, b) => s + b.sizeSqm, 0),
      placedSqm,
      contractedRevenue,
      potentialRevenue,
    },
  };
}
