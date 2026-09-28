// ─── P20.4: Sponsor ROI özeti (canlı agregasyon — önbellek yok) ──────────────
// Harcama (anlaşma + sipariş/ödeme), lead hunisi, görüşme durumu, teslim
// zamanında-tamamlanma, hak tüketimi, stant ve personel sayımları.
// Girdi yalnız sponsorun KENDİ anlaşmalarıdır (kapsamı rota daraltır).
export interface RoiAgreementRow {
  id: string;
  status: string;
  amount: number;
  currency: string;
  tierName: string | null;
  packageName: string | null;
  deliverables: Array<{ status: string; dueDate: Date | null }>;
  boothAllocations: Array<{ status: string; boothUnit: { sizeSqm: number | null } | null }>;
}

export interface RoiPrisma {
  sponsorAgreement: {
    findMany: (args: Record<string, unknown>) => Promise<RoiAgreementRow[]>;
  };
  order: {
    findMany: (args: Record<string, unknown>) => Promise<Array<{
      totalAmount: number;
      payments: Array<{ amount: number; status: string }>;
    }>>;
  };
  leadCapture: {
    findMany: (args: Record<string, unknown>) => Promise<Array<{
      agreementId: string;
      channel: string;
      rating: string | null;
      person: { consentVersion: string | null };
    }>>;
    count: (args: Record<string, unknown>) => Promise<number>;
  };
  portalAnalyticsLog: {
    count: (args: Record<string, unknown>) => Promise<number>;
  };
  sponsorFavorite: {
    count: (args: Record<string, unknown>) => Promise<number>;
  };
  meetingRequest: {
    findMany: (args: Record<string, unknown>) => Promise<Array<{
      agreementId: string;
      status: string;
      slotStart: Date;
      slotEnd: Date;
    }>>;
  };
  entitlement: {
    findMany: (args: Record<string, unknown>) => Promise<Array<{
      quantityGranted: number;
      quantityConsumed: number;
      quantityReserved: number;
    }>>;
  };
  eventRoleAssignment: {
    findMany: (args: Record<string, unknown>) => Promise<Array<{ status: string }>>;
  };
}

export interface AgreementRoi {
  agreementId: string;
  status: string;
  amount: number;
  currency: string;
  tierName: string | null;
  packageName: string | null;
  leads: {
    total: number; consented: number; qualified: number; scans: number;
    byChannel: Record<string, number>; byRating: Record<string, number>;
  };
  meetings: { total: number; confirmed: number; confirmedHours: number; byStatus: Record<string, number> };
  deliverables: { total: number; approved: number; overdue: number; byStatus: Record<string, number> };
  engagement: { profileViews: number; favorites: number };
  booths: { count: number; totalSqm: number };
}

export interface SponsorRoi {
  agreements: AgreementRoi[];
  totals: {
    agreementAmount: number;
    orderTotal: number;
    paidTotal: number;
    leads: number;
    qualifiedLeads: number;
    meetingsConfirmed: number;
    profileViews: number;
    favorites: number;
    entitlements: { granted: number; consumed: number; reserved: number };
    staff: { total: number; active: number; invited: number };
  };
  computedAt: string; // tazelik damgası (P20.4: metrik tazeliği yanıtta)
}

const TERMINAL_DELIVERABLE = ["APPROVED", "COMPLETED", "REJECTED"];

export async function getSponsorRoi(
  prisma: RoiPrisma,
  scope: { editionId: string; organizationId: string; orgName: string; agreementId?: string | null },
  nowMs = Date.now(),
): Promise<SponsorRoi> {
  const agreementWhere = {
    editionId: scope.editionId,
    organizationId: scope.organizationId,
    ...(scope.agreementId ? { id: scope.agreementId } : {}),
  };
  const now = new Date(nowMs);
  const liveLead = { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] };
  const [agreements, orders, leads, meetings, entitlements, staffRoles, profileViews, favorites] = await Promise.all([
    prisma.sponsorAgreement.findMany({
      where: agreementWhere,
      include: {
        tier: { select: { name: true } },
        package: { select: { name: true } },
        deliverables: { select: { status: true, dueDate: true } },
        boothAllocations: { select: { status: true, boothUnit: { select: { sizeSqm: true } } } },
      },
      orderBy: { createdAt: "desc" },
    }) as Promise<Array<RoiAgreementRow & { tier: { name: string } | null; package: { name: string } | null }>>,
    prisma.order.findMany({
      where: { editionId: scope.editionId, buyerOrganizationId: scope.organizationId },
      select: { totalAmount: true, payments: { select: { amount: true, status: true } } },
    }),
    prisma.leadCapture.findMany({
      where: { editionId: scope.editionId, agreement: agreementWhere, ...liveLead },
      select: { agreementId: true, channel: true, rating: true, person: { select: { consentVersion: true } } },
    }),
    prisma.meetingRequest.findMany({
      where: { editionId: scope.editionId, agreement: agreementWhere },
      select: { agreementId: true, status: true, slotStart: true, slotEnd: true },
    }),
    prisma.entitlement.findMany({
      where: { editionId: scope.editionId, ownerOrganizationId: scope.organizationId },
      select: { quantityGranted: true, quantityConsumed: true, quantityReserved: true },
    }),
    prisma.eventRoleAssignment.findMany({
      where: {
        role: "EXHIBITOR_STAFF",
        participation: { editionId: scope.editionId, person: { company: scope.orgName } },
      },
      select: { status: true },
    }),
    prisma.portalAnalyticsLog.count({
      where: { editionId: scope.editionId, kind: "SPONSOR_VIEW", meta: scope.organizationId },
    }),
    prisma.sponsorFavorite.count({
      where: { editionId: scope.editionId, organizationId: scope.organizationId },
    }),
  ]);

  const byAgreement = new Map<string, AgreementRoi>();
  for (const a of agreements) {
    const byStatus: Record<string, number> = {};
    let approved = 0;
    let overdue = 0;
    for (const d of a.deliverables) {
      byStatus[d.status] = (byStatus[d.status] ?? 0) + 1;
      if (d.status === "APPROVED" || d.status === "COMPLETED") approved += 1;
      if (d.dueDate && d.dueDate.getTime() < nowMs && !TERMINAL_DELIVERABLE.includes(d.status)) overdue += 1;
    }
    let totalSqm = 0;
    for (const b of a.boothAllocations) totalSqm += b.boothUnit?.sizeSqm ?? 0;
    byAgreement.set(a.id, {
      agreementId: a.id,
      status: a.status,
      amount: a.amount,
      currency: a.currency,
      tierName: a.tier?.name ?? null,
      packageName: a.package?.name ?? null,
      leads: { total: 0, consented: 0, qualified: 0, scans: 0, byChannel: {}, byRating: {} },
      meetings: { total: 0, confirmed: 0, confirmedHours: 0, byStatus: {} },
      deliverables: { total: a.deliverables.length, approved, overdue, byStatus },
      engagement: { profileViews: 0, favorites: 0 },
      booths: { count: a.boothAllocations.length, totalSqm },
    });
  }

  for (const l of leads) {
    const r = byAgreement.get(l.agreementId);
    if (!r) continue;
    r.leads.total += 1;
    if (l.person.consentVersion) r.leads.consented += 1;
    if (l.rating === "HOT" || l.rating === "WARM") r.leads.qualified += 1;
    if (l.channel === "BADGE_SCAN") r.leads.scans += 1;
    r.leads.byChannel[l.channel] = (r.leads.byChannel[l.channel] ?? 0) + 1;
    if (l.rating) r.leads.byRating[l.rating] = (r.leads.byRating[l.rating] ?? 0) + 1;
  }

  for (const m of meetings) {
    const r = byAgreement.get(m.agreementId);
    if (!r) continue;
    r.meetings.total += 1;
    r.meetings.byStatus[m.status] = (r.meetings.byStatus[m.status] ?? 0) + 1;
    if (m.status === "CONFIRMED" || m.status === "COMPLETED") {
      r.meetings.confirmed += 1;
      r.meetings.confirmedHours += (m.slotEnd.getTime() - m.slotStart.getTime()) / 3_600_000;
    }
  }
  for (const r of byAgreement.values()) {
    r.meetings.confirmedHours = Math.round(r.meetings.confirmedHours * 100) / 100;
  }

  let orderTotal = 0;
  let paidTotal = 0;
  for (const o of orders) {
    orderTotal += o.totalAmount;
    for (const p of o.payments) if (p.status === "SUCCEEDED") paidTotal += p.amount;
  }
  const ent = { granted: 0, consumed: 0, reserved: 0 };
  for (const e of entitlements) {
    ent.granted += e.quantityGranted;
    ent.consumed += e.quantityConsumed;
    ent.reserved += e.quantityReserved;
  }
  const staff = { total: staffRoles.length, active: 0, invited: 0 };
  for (const s of staffRoles) {
    if (s.status === "ACTIVE") staff.active += 1;
    if (s.status === "INVITED") staff.invited += 1;
  }

  const list = [...byAgreement.values()];
  // etkileşim kurum-bazlıdır: kapsamda TEK anlaşma varsa ona yazılır,
  // çok anlaşmada yalnız toplamlarda taşınır (yanlış atıf yasak).
  if (list.length === 1) {
    list[0].engagement = { profileViews, favorites };
  }
  return {
    agreements: list,
    totals: {
      agreementAmount: list.reduce((s, a) => s + a.amount, 0),
      orderTotal,
      paidTotal,
      leads: list.reduce((s, a) => s + a.leads.total, 0),
      qualifiedLeads: list.reduce((s, a) => s + a.leads.qualified, 0),
      meetingsConfirmed: list.reduce((s, a) => s + a.meetings.confirmed, 0),
      profileViews,
      favorites,
      entitlements: ent,
      staff,
    },
    computedAt: now.toISOString(),
  };
}
