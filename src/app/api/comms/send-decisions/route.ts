// P17.2: GET /api/comms/send-decisions — gönderim kararı denetimi (salt okunur).
// Kayıtlar değişmezdir: güncelleme/silme ucu YOK.
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { GuardError, resolveContext } from "@/lib/api/tenant-guard";
import { requireStaff } from "@/lib/auth/request-context";
import { enforceRateLimit } from "@/lib/rate-limit";

export async function GET(req: NextRequest) {
  const limited = enforceRateLimit(req, { key: "comms-decisions", limit: 60, windowMs: 60_000 });
  if (limited) return limited;
  const staffGate = await requireStaff();
  if (staffGate) return staffGate;
  try {
    const tenantId = await resolveContext(null);
    const sp = req.nextUrl.searchParams;
    const campaignId = sp.get("campaignId");
    const decision = sp.get("decision");
    const items = await db.sendDecision.findMany({
      where: {
        tenantId,
        ...(campaignId ? { campaignId } : {}),
        ...(decision === "ALLOW" || decision === "BLOCK" ? { decision } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    return NextResponse.json({ items });
  } catch (e) {
    if (e instanceof GuardError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("GET /api/comms/send-decisions", e);
    return NextResponse.json({ error: "Denetim okunamadı" }, { status: 500 });
  }
}
