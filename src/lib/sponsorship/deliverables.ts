// ─── P13: Teslim durum makinesi + yayın kontrol listesi ────────────────────────
// Akış: NOT_STARTED → WAITING_SPONSOR → SUBMITTED → UNDER_REVIEW → APPROVED → COMPLETED
//        REJECTED döngüsü: UNDER_REVIEW → REJECTED → SUBMITTED (yeniden işleme).
//  * SUBMITTED kanıt ister: proofUrl veya notes (birleştirilmiş değer).
//  * APPROVED/REJECTED yayıncı yetkisi ister (rütbe ≥ 50); REJECTED gerekçe ister.
// Yayın kontrol listesi: imza + teslimler + haklar + ödeme(manuel — bağlantı yok,
// muhasebe onayı gerekir; ASLA otomatik "ok" üretilmez).
export const DELIVERABLE_STATUSES = [
  "NOT_STARTED",
  "WAITING_SPONSOR",
  "SUBMITTED",
  "UNDER_REVIEW",
  "APPROVED",
  "REJECTED",
  "COMPLETED",
] as const;

const NEXT: Record<string, readonly string[]> = {
  NOT_STARTED: ["WAITING_SPONSOR", "SUBMITTED"],
  WAITING_SPONSOR: ["SUBMITTED", "NOT_STARTED"],
  SUBMITTED: ["UNDER_REVIEW", "NOT_STARTED"],
  UNDER_REVIEW: ["APPROVED", "REJECTED"],
  REJECTED: ["SUBMITTED"],
  APPROVED: ["COMPLETED"],
  COMPLETED: [],
};

const PUBLISHER_MIN_RANK = 50;

export interface DeliverablePrisma {
  deliverable: {
    findUnique: (args: { where: Record<string, unknown> }) => Promise<{
      id: string;
      status: string;
      notes: string | null;
      proofUrl: string | null;
    } | null>;
  };
}

export interface DecideDeliverableInput {
  actorMaxRank: number;
  deliverableId: string;
  data: Record<string, unknown>;
}

export type DecideDeliverableResult =
  | { ok: true }
  | { ok: false; error: string; status: number };

function nonEmpty(v: unknown): boolean {
  return typeof v === "string" && v.trim().length > 0;
}

export async function decideDeliverableChange(
  prisma: DeliverablePrisma,
  input: DecideDeliverableInput,
): Promise<DecideDeliverableResult> {
  const to = input.data.status;
  if (typeof to !== "string") return { ok: true };
  if (!(DELIVERABLE_STATUSES as readonly string[]).includes(to)) {
    return { ok: false, error: `Geçersiz teslim durumu: ${to}`, status: 400 };
  }
  const existing = await prisma.deliverable.findUnique({ where: { id: input.deliverableId } });
  if (!existing) return { ok: true }; // item-route 400'e düşer
  if (existing.status === to) return { ok: true };
  const allowed = NEXT[existing.status] ?? [];
  if (!(allowed as readonly string[]).includes(to)) {
    return { ok: false, error: `Geçişe izin yok: ${existing.status} → ${to}`, status: 400 };
  }
  if (to === "SUBMITTED") {
    const proofUrl = ("proofUrl" in input.data ? input.data.proofUrl : existing.proofUrl) as unknown;
    const notes = ("notes" in input.data ? input.data.notes : existing.notes) as unknown;
    if (!nonEmpty(proofUrl) && !nonEmpty(notes)) {
      return { ok: false, error: "Gönderim kanıt ister: proofUrl ya da notes doldurun", status: 400 };
    }
  }
  if (to === "APPROVED" || to === "REJECTED") {
    if (input.actorMaxRank < PUBLISHER_MIN_RANK) {
      return { ok: false, error: "Onay/red yayıncı yetkisi ister (rütbe ≥ 50)", status: 403 };
    }
    if (to === "REJECTED") {
      const notes = ("notes" in input.data ? input.data.notes : existing.notes) as unknown;
      if (!nonEmpty(notes)) {
        return { ok: false, error: "Red için gerekçe zorunludur (notes)", status: 400 };
      }
    }
  }
  return { ok: true };
}

export interface ReadinessPrisma {
  sponsorAgreement: {
    findUnique: (args: { where: Record<string, unknown>; include?: unknown }) => Promise<{
      id: string;
      signedAt: Date | string | null;
      organizationId: string;
      editionId: string;
      deliverables: Array<{ status: string }>;
    } | null>;
  };
  entitlement: {
    findMany: (args: { where: Record<string, unknown>; select?: unknown }) => Promise<Array<{ approvalStatus: string }>>;
  };
}

export interface ReadinessItem {
  key: "signature" | "deliverables" | "rights" | "payment";
  label: string;
  status: "ok" | "pending" | "manual";
  detail?: string;
}

export interface AgreementReadiness {
  items: ReadinessItem[];
  blocked: boolean;
}

export async function getAgreementReadiness(prisma: ReadinessPrisma, agreementId: string): Promise<AgreementReadiness> {
  const agreement = await prisma.sponsorAgreement.findUnique({
    where: { id: agreementId },
    include: { deliverables: { select: { status: true } } },
  });
  if (!agreement) {
    return {
      items: [
        { key: "signature", label: "Sözleşme imzası", status: "pending", detail: "Anlaşma bulunamadı" },
        { key: "deliverables", label: "Teslimler", status: "pending" },
        { key: "rights", label: "Hak onayları", status: "pending" },
        { key: "payment", label: "Ödeme", status: "manual", detail: "Bağlantı yok — muhasebe onayı gerekli" },
      ],
      blocked: true,
    };
  }
  const items: ReadinessItem[] = [];
  items.push(
    agreement.signedAt
      ? { key: "signature", label: "Sözleşme imzası", status: "ok" }
      : { key: "signature", label: "Sözleşme imzası", status: "pending", detail: "signedAt yok" },
  );
  const ds = agreement.deliverables.map((d) => d.status);
  if (ds.length === 0) {
    items.push({ key: "deliverables", label: "Teslimler", status: "manual", detail: "Teslim takibi yok" });
  } else if (ds.some((s) => s === "REJECTED")) {
    items.push({ key: "deliverables", label: "Teslimler", status: "pending", detail: "Reddedilmiş teslim var" });
  } else if (ds.every((s) => s === "APPROVED" || s === "COMPLETED")) {
    items.push({ key: "deliverables", label: "Teslimler", status: "ok", detail: `${ds.length}/${ds.length} onaylı` });
  } else {
    items.push({ key: "deliverables", label: "Teslimler", status: "pending", detail: "Onay bekleyen teslim var" });
  }
  const ents = await prisma.entitlement.findMany({
    where: { ownerOrganizationId: agreement.organizationId, editionId: agreement.editionId },
    select: { approvalStatus: true },
  });
  if (ents.some((e) => e.approvalStatus === "REJECTED")) {
    items.push({ key: "rights", label: "Hak onayları", status: "pending", detail: "Reddedilmiş hak var" });
  } else if (ents.some((e) => e.approvalStatus === "PROPOSED")) {
    items.push({ key: "rights", label: "Hak onayları", status: "pending", detail: "Onay bekleyen hak var" });
  } else {
    items.push({ key: "rights", label: "Hak onayları", status: "ok" });
  }
  items.push({ key: "payment", label: "Ödeme", status: "manual", detail: "Bağlantı yok — muhasebe onayı gerekli" });
  return { items, blocked: items.some((i) => i.status === "pending") };
}
