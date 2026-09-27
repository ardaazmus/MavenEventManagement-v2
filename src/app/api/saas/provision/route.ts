// ─── TASK-B 21: SaaS provizyon (POST) — süper-yönetici kapılı ───────────────────
// Kapı: x-super-admin-key başlığı; MAVEN_SUPERADMIN_KEY env YOKSA 503, YANLIŞSA 404
// (timing-safe; bkz. src/lib/api/super-admin.ts). Hız sınırı 5 istek/10 dk/IP.
// Gövde: { tenantName, adminEmail, adminName, plan? } — atomik çoklu-create +
// tazminatlı geri alma (bkz. provision-core.ts). Yanıt: {tenantId, userId,
// subscriptionId} — SIR/PII yok. Oran: 5/10dk/IP (brute-force + istismar denetimi).
import { NextRequest, NextResponse } from "next/server";
import { enforceRateLimit } from "@/lib/rate-limit";
import { requireSuperAdmin } from "@/lib/api/super-admin";
import { provisionTenant, ProvisionError } from "@/lib/api/provision-core";

export async function POST(req: NextRequest) {
  const gate = requireSuperAdmin(req);
  if (!gate.ok) return gate.response;

  const limited = enforceRateLimit(req, { key: "saas-provision", limit: 5, windowMs: 600_000 });
  if (limited) return limited;

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Geçersiz JSON gövdesi" }, { status: 400 });
  }

  try {
    const result = await provisionTenant({
      tenantName: typeof body.tenantName === "string" ? body.tenantName : "",
      adminEmail: typeof body.adminEmail === "string" ? body.adminEmail : "",
      adminName: typeof body.adminName === "string" ? body.adminName : "",
      plan: typeof body.plan === "string" ? body.plan : undefined,
    });
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    if (err instanceof ProvisionError) {
      return NextResponse.json({ error: err.message, failedStep: err.step }, { status: err.status });
    }
    return NextResponse.json({ error: "Provizyon başarısız" }, { status: 500 });
  }
}
