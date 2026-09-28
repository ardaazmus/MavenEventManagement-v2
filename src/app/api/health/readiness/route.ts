// ─── P03.2: Readiness Route ───────────────────────────────────────────────────
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { checkReadiness } from "@/lib/readiness";
import type { PrismaClient } from "@prisma/client";

export async function GET() {
  const result = await checkReadiness(db as unknown as PrismaClient);
  return NextResponse.json(
    {
      ready: result.ready,
      db: result.db,
      migrations: result.migrations,
      config: result.config,
      uptimeSec: result.uptimeSec,
      latencyMs: result.dbLatencyMs,
      checkedAt: result.checkedAt,
    },
    { status: result.status },
  );
}
