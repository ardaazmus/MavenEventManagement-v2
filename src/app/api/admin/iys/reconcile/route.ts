// P17.3: POST /api/admin/iys/reconcile — İYS mutabakatı (yönetici, kiracı kapsamlı).
// Sağlayıcı yalnız geri çekme yönünde yereli ezer (fail-closed).
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { GuardError, resolveContext } from "@/lib/api/tenant-guard";
import { requireAdmin } from "@/lib/auth/request-context";
import { enforceRateLimit } from "@/lib/rate-limit";
import { reconcileIys, SandboxIysProvider, type IysProvider } from "@/lib/comms/iys";

function resolveProvider(): IysProvider | null {
  const name = (process.env.IYS_PROVIDER ?? "sandbox").trim().toLowerCase();
  if (name === "sandbox") return new SandboxIysProvider();
  return null;
}

export async function POST(req: NextRequest) {
  const limited = enforceRateLimit(req, { key: "admin-iys", limit: 10, windowMs: 60_000 });
  if (limited) return limited;
  const adminGate = await requireAdmin();
  if (adminGate) return adminGate;
  const provider = resolveProvider();
  if (!provider) {
    return NextResponse.json({ error: "İYS sağlayıcısı yapılandırılmamış (IYS_PROVIDER)" }, { status: 501 });
  }
  let body: Record<string, unknown> = {};
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }
  try {
    const tenantId = await resolveContext(null);
    const channel = body.channel === "SMS" ? "SMS" : body.channel === "EMAIL" ? "EMAIL" : undefined;
    const outcome = await reconcileIys(db as never, provider, { tenantId, channel });
    return NextResponse.json({ provider: provider.name, ...outcome });
  } catch (e) {
    if (e instanceof GuardError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error("POST /api/admin/iys/reconcile", e);
    return NextResponse.json({ error: "İYS mutabakatı başarısız" }, { status: 500 });
  }
}
