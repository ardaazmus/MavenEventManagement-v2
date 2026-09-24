// ─── TASK-B 23: SaaS operatör uptime raporu (GET) — süper-yönetici kapılı ──────
// Kapı provision ile AYNI desen (super-admin.ts): env yok 503, yanlış anahtar 404.
// Yanıt: süreç uptime + bellek + nodeEnv + SELECT 1 gecikmesi + kiracı/edisyon sayımı.
// SIFIR PII — sayım ve süreç metrikleri dışında hiçbir şey döndürülmez.
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { requireSuperAdmin } from "@/lib/api/super-admin";

export async function GET(req: NextRequest) {
  const gate = requireSuperAdmin(req);
  if (!gate.ok) return gate.response;

  const t0 = Date.now();
  try {
    await db.$queryRaw`SELECT 1`;
    const dbLatencyMs = Date.now() - t0;

    const [tenants, editions] = await Promise.all([db.tenant.count(), db.eventEdition.count()]);
    const mem = process.memoryUsage();

    return NextResponse.json({
      uptimeSec: Math.floor(process.uptime()),
      memoryMB: Math.round((mem.rss / 1024 / 1024) * 10) / 10,
      nodeEnv: process.env.NODE_ENV ?? "development",
      dbLatencyMs,
      tenants,
      editions,
      generatedAt: new Date().toISOString(),
    });
  } catch {
    return NextResponse.json(
      { error: "Veritabanı erişilemiyor — uptime raporu üretilemedi" },
      { status: 503 },
    );
  }
}
