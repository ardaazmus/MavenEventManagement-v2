// /api/organizations/[id] — Kurum 360 (§55)
// G0-a: özel rota da kapsam kontrolünden geçer — başka kiracının kurumu 404.
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ensureInScope } from "@/lib/api/tenant-guard";
import { requireStaff } from "@/lib/auth/request-context";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  // N-08 rol kapısı — envanter iddiasıyla uyum (auth-off'ta null, davranış korunur).
  const staffGate = await requireStaff();
  if (staffGate) return staffGate;
  try {
    const { id } = await ctx.params;
    const scoped = await ensureInScope("organizations", id);
    if (!scoped.ok) return NextResponse.json({ error: scoped.error }, { status: scoped.status });
    const org = await db.organization.findUnique({
      where: { id },
      include: {
        eventAssignments: { include: { edition: { select: { name: true } } } },
        sponsorAgreements: {
          include: {
            tier: { select: { name: true } },
            package: { select: { name: true } },
            deliverables: true,
          },
        },
        entitlements: { select: { id: true, label: true, type: true, quantityGranted: true, quantityConsumed: true, quantityReserved: true } },
        boothAllocations: { include: { boothUnit: { select: { code: true, sizeSqm: true } } } },
        orders: { select: { id: true, orderNo: true, totalAmount: true, status: true, currency: true } },
        contacts: true,
      },
    });
    if (!org) return NextResponse.json({ error: "Kurum bulunamadı" }, { status: 404 });
    const { eventAssignments, sponsorAgreements, entitlements, boothAllocations, orders, contacts, ...orgCore } = org;
    return NextResponse.json({ organization: orgCore, eventAssignments, sponsorAgreements, entitlements, boothAllocations, orders, contacts });
  } catch (e) {
    console.error("GET /api/organizations/[id]", e);
    return NextResponse.json({ error: "360 verisi alınamadı" }, { status: 500 });
  }
}
