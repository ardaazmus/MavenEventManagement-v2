// /api/health — TASK-B 23: izleme uç noktası (public; SIFIR PII/sır)
// { ok, uptime sn, db gecikmesi ms, sürüm, bayrak durumları } — uptime izleyici
// (dış monitor) buraya ping atar; erişim denetimi /api/saas/access-review'de (kapalı).
// P03.2: ?probe=liveness destekler (DB sorgusuz hafif süreç kontrolü).
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { AUTH_ENABLED } from "@/lib/auth-flag";

const STARTED_AT = Date.now();

export async function GET(req?: NextRequest) {
  const probe = req?.nextUrl?.searchParams?.get("probe") || req?.nextUrl?.searchParams?.get("type");

  if (probe === "liveness") {
    return NextResponse.json(
      {
        alive: true,
        uptimeSec: Math.floor((Date.now() - STARTED_AT) / 1000),
        version: "task-b",
        timestamp: new Date().toISOString(),
      },
      { status: 200 },
    );
  }

  const t0 = Date.now();
  let dbOk = false;
  let dbLatencyMs: number | null = null;
  try {
    await db.$queryRaw`SELECT 1`;
    dbOk = true;
    dbLatencyMs = Date.now() - t0;
  } catch {
    dbOk = false; // db hatası 503 — monitor alarm kurar
  }
  return NextResponse.json(
    {
      ok: dbOk,
      uptimeSec: Math.floor((Date.now() - STARTED_AT) / 1000),
      db: { ok: dbOk, latencyMs: dbLatencyMs },
      version: "task-b",
      authEnabled: AUTH_ENABLED, // bayrak görünürlüğü (sır değil)
      checkedAt: new Date().toISOString(),
    },
    { status: dbOk ? 200 : 503 },
  );
}
