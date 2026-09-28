// P17.3: POST /api/admin/iys/drain — İYS kuyruk tarama (yönetici).
// Sağlayıcı: IYS_PROVIDER=sandbox (varsayılan); gerçek sağlayıcı P22'de bağlanır.
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/request-context";
import { enforceRateLimit } from "@/lib/rate-limit";
import { drainIysOutbox, SandboxIysProvider, type IysProvider } from "@/lib/comms/iys";

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
  try {
    const outcome = await drainIysOutbox(db as never, provider);
    return NextResponse.json({ provider: provider.name, ...outcome });
  } catch (e) {
    console.error("POST /api/admin/iys/drain", e);
    return NextResponse.json({ error: "İYS taraması başarısız" }, { status: 500 });
  }
}
