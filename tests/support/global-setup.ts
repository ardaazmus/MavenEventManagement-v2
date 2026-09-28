import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import { spawnSync } from "node:child_process";

export default async function globalSetup() {
  const isTest = process.env.NODE_ENV === "test";
  const currentDb = process.env.DATABASE_URL || "";

  // U2: modül spec'leri hem HTTP (sunucu DB'si) hem Prisma (worker DB'si) kullanır —
  // tutarlılık için ikisi AYNI DB'yi görmelidir. E2E_SHARED_DEV_DB=1 bu koşuda
  // izolasyonu kapatır (spec'ler dev DB'yi okur/yazar; UI yazımları zaten oraya
  // gidiyordu). Varsayılan davranış değişmez; CI etkilenmez (ci-test.db).
  if (process.env.E2E_SHARED_DEV_DB === "1") {
    console.log(`[e2e] paylaşımlı dev DB modu — izolasyon kapalı (${currentDb || ".env"})`);
    return;
  }

  // If running tests and DATABASE_URL is not set or points to custom.db, create isolated DB
  if (!currentDb || currentDb.includes("custom.db") || isTest) {
    const baseDir = path.join(os.tmpdir(), "maven-test-dbs");
    if (!fs.existsSync(baseDir)) {
      fs.mkdirSync(baseDir, { recursive: true });
    }

    const testDbPath = path.join(baseDir, `playwright-run-${Date.now()}.db`).replace(/\\/g, "/");
    process.env.DATABASE_URL = `file:${testDbPath}`;

    const prismaCli = path.resolve("node_modules/prisma/build/index.js");
    const res = spawnSync(process.execPath, [prismaCli, "migrate", "deploy"], {
      env: {
        ...process.env,
        DATABASE_URL: `file:${testDbPath}`,
      },
      encoding: "utf8",
    });

    if (res.status !== 0) {
      console.warn(`[WARN] Failed to migrate test DB in globalSetup: ${res.stderr || res.stdout}`);
    }
  }
}
