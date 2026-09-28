// ─── P03.2: Readiness Doğrulama Mantığı ──────────────────────────────────────
// Sistemin kullanıcı trafiğini kabul etmeye hazır olup olmadığını doğrular:
//   1. Konfigürasyon doğrulaması (fail-closed)
//   2. Veritabanı bağlantısı
//   3. Migration deployment kontrolü (_prisma_migrations tablosu)
// SIFIR sır / SIFIR PII sızıntısı.
import type { PrismaClient } from "@prisma/client";
import { getConfig } from "./config.ts";

export interface ReadinessCheckResult {
  ready: boolean;
  status: 200 | 503;
  db: boolean;
  migrations: boolean;
  config: boolean;
  dbLatencyMs: number | null;
  uptimeSec: number;
  checkedAt: string;
}

const STARTED_AT = Date.now();

export async function checkReadiness(client: PrismaClient): Promise<ReadinessCheckResult> {
  const t0 = Date.now();
  let dbOk = false;
  let migrationsOk = false;
  let configOk = false;
  let dbLatencyMs: number | null = null;

  // 1. Config validation check
  try {
    const cfg = getConfig();
    configOk = Boolean(cfg && cfg.databaseUrl);
  } catch {
    configOk = false;
  }

  // 2. Database query check
  try {
    await client.$queryRaw`SELECT 1`;
    dbOk = true;
    dbLatencyMs = Date.now() - t0;
  } catch {
    dbOk = false;
  }

  // 3. Migration table check (_prisma_migrations)
  if (dbOk) {
    try {
      const rows = await client.$queryRaw<Array<{ count: number | bigint }>>`
        SELECT count(*) as count FROM _prisma_migrations WHERE rolled_back_at IS NULL
      `;
      const count = Number(rows[0]?.count ?? 0);
      migrationsOk = count > 0;
    } catch {
      // no such table: _prisma_migrations
      migrationsOk = false;
    }
  }

  const ready = dbOk && migrationsOk && configOk;
  return {
    ready,
    status: ready ? 200 : 503,
    db: dbOk,
    migrations: migrationsOk,
    config: configOk,
    dbLatencyMs,
    uptimeSec: Math.floor((Date.now() - STARTED_AT) / 1000),
    checkedAt: new Date().toISOString(),
  };
}
