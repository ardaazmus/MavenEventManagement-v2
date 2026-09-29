// POST /api/tenant/ensure — sıfır-veri onboarding'i: ilk kuruluşu sağlar.
// Sözleşme: kuruluş varsa {created:false, ...mevcut} (ZARARSIZ, idempotent);
// yoksa {name} ile yaratır {created:true} (201). Sihirbaz sıfır-tennant'ta
// önce burayı çağırır — "önce demo verisi" çıkmazını kapatır (ONBOARD-1).
// Kök kayıt olduğu için tenant-guard YOK (guard'ın kendisi tenant ister);
// koruma: requireAdmin (auth-on) + 10 çağrı/dk/IP.
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { enforceRateLimit } from "@/lib/rate-limit";
import { requireAdmin } from "@/lib/auth/request-context";
import { slugifyTenant, validateTenantName } from "@/lib/tenant-slug";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const denied = enforceRateLimit(req, { key: "tenant-ensure", limit: 10, windowMs: 60_000 });
  if (denied) return denied;
  const adminGate = await requireAdmin();
  if (adminGate) return adminGate;

  let body: { name?: unknown } = {};
  try {
    body = (await req.json()) as { name?: unknown };
  } catch {
    body = {};
  }

  try {
    const existing = await db.tenant.findFirst({ select: { id: true, name: true, slug: true } });
    if (existing) {
      return NextResponse.json({ ...existing, created: false }, { status: 200 });
    }
    const v = validateTenantName(body.name);
    if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });

    // slug çakışmasında kısa ek dene (en fazla 3) — deterministik değil, güvenli
    let slug = slugifyTenant(v.value);
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const created = await db.tenant.create({
          data: { name: v.value, slug },
          select: { id: true, name: true, slug: true },
        });
        return NextResponse.json({ ...created, created: true }, { status: 201 });
      } catch (e) {
        const msg = e instanceof Error ? e.message : "";
        if (!msg.includes("Unique constraint") || attempt === 2) throw e;
        // Eşzamanlı çift-gönderim: slug çakışması = başka istek az önce kurdu →
        // yeniden oku, varsa onu döndür (idempotent), yoksa ekli slug dene.
        const raced = await db.tenant.findFirst({ select: { id: true, name: true, slug: true } });
        if (raced) return NextResponse.json({ ...raced, created: false }, { status: 200 });
        slug = `${slugifyTenant(v.value)}-${Math.random().toString(36).slice(2, 6)}`;
      }
    }
    return NextResponse.json({ error: "Kuruluş oluşturulamadı" }, { status: 500 });
  } catch (e) {
    console.error("POST /api/tenant/ensure", e);
    return NextResponse.json({ error: "Kuruluş sağlanamadı" }, { status: 500 });
  }
}
