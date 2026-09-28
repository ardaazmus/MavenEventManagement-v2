// P17.2: POST /api/comms/consents — rıza kaydı/geri çekme; GET — adres sorgusu.
// Kadro kapılı + kiracı kapsamlı; ticari hareketler İYS kuyruğuna düşer.
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { GuardError, resolveContext } from "@/lib/api/tenant-guard";
import { requireStaff } from "@/lib/auth/request-context";
import { enforceRateLimit } from "@/lib/rate-limit";
import {
  ConsentError,
  getConsent,
  normalizeConsentAddress,
  recordConsent,
  sanitizeChannel,
  sanitizePurpose,
} from "@/lib/comms/consent";

export async function GET(req: NextRequest) {
  const limited = enforceRateLimit(req, { key: "comms-consents", limit: 60, windowMs: 60_000 });
  if (limited) return limited;
  const staffGate = await requireStaff();
  if (staffGate) return staffGate;
  try {
    const tenantId = await resolveContext(null);
    const sp = req.nextUrl.searchParams;
    const channel = sanitizeChannel(sp.get("channel"));
    const purpose = sanitizePurpose(sp.get("purpose"));
    if (!channel) return NextResponse.json({ error: "channel zorunludur" }, { status: 422 });
    const address = normalizeConsentAddress(channel, sp.get("address"));
    if (!address) return NextResponse.json({ error: "address zorunludur" }, { status: 422 });
    if (purpose) {
      const row = await getConsent(db as never, { tenantId, channel, address, purpose });
      if (!row) return NextResponse.json({ error: "Rıza kaydı yok" }, { status: 404 });
      return NextResponse.json(row);
    }
    const rows = await db.contactConsent.findMany({
      where: { tenantId, channel, address },
      orderBy: { updatedAt: "desc" },
    });
    return NextResponse.json({ items: rows });
  } catch (e) {
    if (e instanceof GuardError) return NextResponse.json({ error: e.message }, { status: e.status });
    if (e instanceof ConsentError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("GET /api/comms/consents", e);
    return NextResponse.json({ error: "Rıza okunamadı" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const limited = enforceRateLimit(req, { key: "comms-consents", limit: 60, windowMs: 60_000 });
  if (limited) return limited;
  const staffGate = await requireStaff();
  if (staffGate) return staffGate;
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Geçersiz istek gövdesi" }, { status: 400 });
  }
  try {
    const tenantId = await resolveContext(null);
    const status = typeof body.status === "string" ? body.status.toUpperCase() : "";
    const { consent, iysQueued } = await recordConsent(db as never, {
      tenantId,
      channel: typeof body.channel === "string" ? body.channel : "",
      address: typeof body.address === "string" ? body.address : "",
      purpose: typeof body.purpose === "string" ? body.purpose : "",
      status: status as "GRANTED" | "WITHDRAWN",
      source: typeof body.source === "string" ? body.source : undefined,
      proof: typeof body.proof === "string" ? body.proof : null,
    });
    return NextResponse.json({ consent, iysQueued }, { status: 201 });
  } catch (e) {
    if (e instanceof GuardError) return NextResponse.json({ error: e.message }, { status: e.status });
    if (e instanceof ConsentError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("POST /api/comms/consents", e);
    return NextResponse.json({ error: "Rıza kaydedilemedi" }, { status: 500 });
  }
}
