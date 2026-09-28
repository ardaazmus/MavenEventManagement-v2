// ─── P18.2: Edisyon arşivi — engel denetimi + salt-okunur anlık görüntü ────────
// Sözleşme: açık finans (tahsil edilmemiş sipariş/bekleyen ödeme) ya da açık
// iş (kararsız kayıt, zamanlanmış kampanya, bitmemiş görev) varken arşiv 409
// ile engellenir. Başarıda snapshot yazılır + durum ARCHIVED olur (terminal).
// NOT: `@/` takma adı YOK — node --test (tip-sıyırma) uyumu için bağımsız.

export class ArchiveError extends Error {
  status: number;
  blockers: ArchiveBlocker[];
  constructor(message: string, status = 400, blockers: ArchiveBlocker[] = []) {
    super(message);
    this.name = "ArchiveError";
    this.status = status;
    this.blockers = blockers;
  }
}

export interface ArchiveBlocker {
  kind: "OPEN_ORDER" | "PENDING_PAYMENT" | "OPEN_REGISTRATION" | "SCHEDULED_CAMPAIGN" | "OPEN_TASK";
  count: number;
  detail: string;
}

export interface ArchivePrisma {
  eventEdition: {
    findUnique: (args: { where: Record<string, unknown> }) => Promise<Record<string, unknown> | null>;
    update: (args: { where: Record<string, unknown>; data: Record<string, unknown> }) => Promise<Record<string, unknown>>;
  };
  editionArchive: {
    create: (args: { data: Record<string, unknown> }) => Promise<Record<string, unknown>>;
    findUnique: (args: { where: Record<string, unknown> }) => Promise<Record<string, unknown> | null>;
  };
  order: {
    count: (args: { where: Record<string, unknown> }) => Promise<number>;
    groupBy?: (args: Record<string, unknown>) => Promise<Array<Record<string, unknown>>>;
  };
  payment: { count: (args: { where: Record<string, unknown> }) => Promise<number> };
  registration: { count: (args: { where: Record<string, unknown> }) => Promise<number> };
  campaign: { count: (args: { where: Record<string, unknown> }) => Promise<number> };
  task: { count: (args: { where: Record<string, unknown> }) => Promise<number> };
  eventParticipation: { count: (args: { where: Record<string, unknown> }) => Promise<number> };
  mediaAsset: { count: (args: { where: Record<string, unknown> }) => Promise<number> };
  activityLog: { create: (args: { data: Record<string, unknown> }) => Promise<unknown> };
}

async function requireTenantEdition(prisma: ArchivePrisma, tenantId: string, editionId: string): Promise<Record<string, unknown> & { id: string; tenantId: string; name: string; slug: string; status: string }> {
  const edition = (await prisma.eventEdition.findUnique({ where: { id: editionId } })) as unknown as {
    id: string; tenantId: string; name: string; slug: string; status: string;
  } | null;
  if (!edition || edition.tenantId !== tenantId) {
    throw new ArchiveError("Etkinlik bulunamadı", 404);
  }
  return edition;
}

export async function checkArchiveBlockers(
  prisma: ArchivePrisma,
  input: { tenantId: string; editionId: string },
): Promise<ArchiveBlocker[]> {
  await requireTenantEdition(prisma, input.tenantId, input.editionId);
  const { editionId } = input;
  const [openOrders, pendingPayments, openRegistrations, scheduledCampaigns, openTasks] = await Promise.all([
    prisma.order.count({ where: { editionId, status: { in: ["OPEN", "PARTIALLY_PAID"] } } }),
    prisma.payment.count({ where: { status: "PENDING", order: { is: { editionId } } } }),
    prisma.registration.count({
      where: { participation: { is: { editionId } }, status: { in: ["DRAFT", "SUBMITTED", "PENDING_APPROVAL"] } },
    }),
    prisma.campaign.count({ where: { editionId, status: "SCHEDULED" } }),
    prisma.task.count({ where: { editionId, status: { not: "DONE" } } }),
  ]);
  const blockers: ArchiveBlocker[] = [];
  if (openOrders > 0) blockers.push({ kind: "OPEN_ORDER", count: openOrders, detail: `${openOrders} tahsil edilmemiş sipariş` });
  if (pendingPayments > 0) blockers.push({ kind: "PENDING_PAYMENT", count: pendingPayments, detail: `${pendingPayments} bekleyen ödeme` });
  if (openRegistrations > 0) blockers.push({ kind: "OPEN_REGISTRATION", count: openRegistrations, detail: `${openRegistrations} kararsız kayıt` });
  if (scheduledCampaigns > 0) blockers.push({ kind: "SCHEDULED_CAMPAIGN", count: scheduledCampaigns, detail: `${scheduledCampaigns} zamanlanmış kampanya` });
  if (openTasks > 0) blockers.push({ kind: "OPEN_TASK", count: openTasks, detail: `${openTasks} bitmemiş görev` });
  return blockers;
}

export interface ArchiveSnapshot {
  edition: { id: string; name: string; slug: string; statusBefore: string };
  counts: Record<string, number>;
  archivedAt: string;
  archivedBy: string | null;
}

export async function archiveEdition(
  prisma: ArchivePrisma,
  input: { tenantId: string; editionId: string; archivedBy?: string | null },
): Promise<{ archive: Record<string, unknown>; snapshot: ArchiveSnapshot }> {
  const edition = await requireTenantEdition(prisma, input.tenantId, input.editionId);
  if (edition.status === "ARCHIVED") {
    throw new ArchiveError("Etkinlik zaten arşivde", 409);
  }
  const existing = await prisma.editionArchive.findUnique({ where: { editionId: input.editionId } });
  if (existing) {
    throw new ArchiveError("Bu etkinliğin arşiv görüntüsü zaten var", 409);
  }
  const blockers = await checkArchiveBlockers(prisma, input);
  if (blockers.length > 0) {
    throw new ArchiveError(`Arşiv engellendi: ${blockers.map((b) => b.detail).join(", ")}`, 409, blockers);
  }
  const [participations, registrations, orders, campaigns, tasks, mediaAssets] = await Promise.all([
    prisma.eventParticipation.count({ where: { editionId: input.editionId } }),
    prisma.registration.count({ where: { participation: { is: { editionId: input.editionId } } } }),
    prisma.order.count({ where: { editionId: input.editionId } }),
    prisma.campaign.count({ where: { editionId: input.editionId } }),
    prisma.task.count({ where: { editionId: input.editionId } }),
    prisma.mediaAsset.count({ where: { editionId: input.editionId } }),
  ]);
  const snapshot: ArchiveSnapshot = {
    edition: { id: edition.id, name: edition.name, slug: edition.slug, statusBefore: edition.status },
    counts: { participations, registrations, orders, campaigns, tasks, mediaAssets },
    archivedAt: new Date().toISOString(),
    archivedBy: input.archivedBy ?? null,
  };
  const archive = await prisma.editionArchive.create({
    data: {
      tenantId: input.tenantId,
      editionId: input.editionId,
      snapshotJson: JSON.stringify(snapshot),
      createdBy: input.archivedBy ?? null,
    },
  });
  await prisma.eventEdition.update({ where: { id: input.editionId }, data: { status: "ARCHIVED" } });
  await prisma.activityLog.create({
    data: {
      type: "EDITION_SAVED",
      message: `Etkinlik arşivlendi: ${edition.name} (${participations} katılım, ${orders} sipariş)`,
      tenantId: input.tenantId,
      editionId: input.editionId,
      entityType: "EventEdition",
      entityId: input.editionId,
      actorName: input.archivedBy ?? "Bilinmeyen",
    },
  });
  return { archive, snapshot };
}

export async function getEditionArchive(
  prisma: ArchivePrisma,
  input: { tenantId: string; editionId: string },
): Promise<{ archive: Record<string, unknown>; snapshot: ArchiveSnapshot } | null> {
  await requireTenantEdition(prisma, input.tenantId, input.editionId);
  const archive = (await prisma.editionArchive.findUnique({ where: { editionId: input.editionId } })) as unknown as {
    snapshotJson: string;
  } | null;
  if (!archive) return null;
  return { archive, snapshot: JSON.parse(archive.snapshotJson) as ArchiveSnapshot };
}
