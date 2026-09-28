// ─── P19.3: Kampanya onay akışı ──────────────────────────────────────────────
// Sözleşme: NONE → request → PENDING → approve/reject → APPROVED/REJECTED.
// Ticari LIVE gönderim APPROVED ister (yayın kancası); işlemsel amaç muaftır.
// Onaylayıcı yönetici olmalı; aynı kişi isteyip onaylayamaz (dört-göz).
// Reddedilen kampanya yeniden isteyebilir (→PENDING). Kullanım işlenir.
// NOT: `@/` takma adı YOK — node --test (tip-sıyırma) uyumu için bağımsız.

export class ApprovalError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = "ApprovalError";
    this.status = status;
  }
}

export interface ApprovalPrisma {
  campaign: {
    findUnique: (args: { where: Record<string, unknown> }) => Promise<Record<string, unknown> | null>;
    update: (args: { where: Record<string, unknown>; data: Record<string, unknown> }) => Promise<Record<string, unknown>>;
  };
  eventEdition: {
    findUnique: (args: { where: Record<string, unknown> }) => Promise<{ id: string; tenantId: string } | null>;
  };
  activityLog: {
    create: (args: { data: Record<string, unknown> }) => Promise<unknown>;
  };
  promoUsage: {
    create: (args: { data: Record<string, unknown> }) => Promise<Record<string, unknown>>;
  };
}

interface CampaignRow {
  id: string;
  editionId: string;
  name: string;
  purpose: string;
  approvalStatus: string;
  approvedBy: string | null;
  approvalRequestedBy: string | null;
}

async function requireTenantCampaign(prisma: ApprovalPrisma, tenantId: string, campaignId: string): Promise<CampaignRow> {
  const row = (await prisma.campaign.findUnique({ where: { id: campaignId } })) as unknown as CampaignRow | null;
  if (!row) throw new ApprovalError("Kampanya bulunamadı", 404);
  const edition = await prisma.eventEdition.findUnique({ where: { id: row.editionId } });
  if (!edition || edition.tenantId !== tenantId) {
    throw new ApprovalError("Kampanya bulunamadı", 404);
  }
  return row;
}

async function log(prisma: ApprovalPrisma, tenantId: string, row: CampaignRow, message: string, actor: string | null): Promise<void> {
  await prisma.activityLog.create({
    data: {
      type: "CAMPAIGN_SAVED",
      message,
      tenantId,
      editionId: row.editionId,
      entityType: "campaign",
      entityId: row.id,
      actorName: actor ?? "Bilinmeyen",
    },
  });
}

export async function requestCampaignApproval(
  prisma: ApprovalPrisma,
  input: { tenantId: string; campaignId: string; requestedBy?: string | null; note?: string | null },
): Promise<Record<string, unknown>> {
  const row = await requireTenantCampaign(prisma, input.tenantId, input.campaignId);
  if (row.approvalStatus === "PENDING") {
    throw new ApprovalError("Onay zaten beklemede", 409);
  }
  if (row.approvalStatus === "APPROVED") {
    throw new ApprovalError("Kampanya zaten onaylı", 409);
  }
  const updated = await prisma.campaign.update({
    where: { id: row.id },
    data: {
      approvalStatus: "PENDING",
      approvedBy: null,
      approvedAt: null,
      approvalNote: input.note?.trim() || null,
      approvalRequestedBy: input.requestedBy ?? null,
    },
  });
  await log(prisma, input.tenantId, row, `Kampanya onaya gönderildi: "${row.name}"`, input.requestedBy ?? null);
  return updated;
}

export interface DecideApprovalInput {
  tenantId: string;
  campaignId: string;
  approve: boolean;
  decidedBy?: string | null;
  actorIsAdmin: boolean;
  note?: string | null;
}

export async function decideCampaignApproval(prisma: ApprovalPrisma, input: DecideApprovalInput): Promise<Record<string, unknown>> {
  if (!input.actorIsAdmin) {
    throw new ApprovalError("Kampanya onayı yönetici yetkisi ister", 403);
  }
  const row = await requireTenantCampaign(prisma, input.tenantId, input.campaignId);
  if (row.approvalStatus !== "PENDING") {
    throw new ApprovalError(`Yalnız bekleyen kampanya karara bağlanır (${row.approvalStatus})`, 409);
  }
  if (input.decidedBy && row.approvalRequestedBy && input.decidedBy === row.approvalRequestedBy) {
    throw new ApprovalError("Aynı kişi isteyip onaylayamaz (dört-göz)", 409);
  }
  const updated = await prisma.campaign.update({
    where: { id: row.id },
    data: {
      approvalStatus: input.approve ? "APPROVED" : "REJECTED",
      approvedBy: input.decidedBy ?? null,
      approvedAt: new Date(),
      approvalNote: input.note?.trim() || null,
    },
  });
  await log(
    prisma,
    input.tenantId,
    row,
    input.approve ? `Kampanya onaylandı: "${row.name}"` : `Kampanya reddedildi: "${row.name}"${input.note ? ` — ${input.note.trim().slice(0, 120)}` : ""}`,
    input.decidedBy ?? null,
  );
  await prisma.promoUsage.create({
    data: {
      tenantId: input.tenantId,
      kind: "CAMPAIGN_SEND",
      campaignId: row.id,
      editionId: row.editionId,
      detail: input.approve ? "approved" : "rejected",
    },
  });
  return updated;
}

// Yayın kancası: ticari LIVE gönderim onaysız yapılamaz.
export function assertSendable(campaign: { purpose?: string | null; approvalStatus?: string | null }): void {
  const purpose = campaign.purpose === "TRANSACTIONAL" ? "TRANSACTIONAL" : "COMMERCIAL";
  if (purpose === "TRANSACTIONAL") return;
  if (campaign.approvalStatus !== "APPROVED") {
    throw new ApprovalError(`Ticari gönderim onay ister (durum: ${campaign.approvalStatus ?? "NONE"})`, 409);
  }
}
