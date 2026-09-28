import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawnSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";

const prismaCli = path.resolve("node_modules/prisma/build/index.js");

export async function createIsolatedTestDb(workerId = "default") {
  const baseDir = path.join(os.tmpdir(), "maven-test-dbs");
  if (!fs.existsSync(baseDir)) {
    fs.mkdirSync(baseDir, { recursive: true });
  }

  const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const dbFileName = `test-${workerId}-${uniqueSuffix}.db`;
  const dbPath = path.join(baseDir, dbFileName).replace(/\\/g, "/");
  const databaseUrl = `file:${dbPath}`;

  // 1. Apply migrations to fresh isolated database
  const env = {
    ...process.env,
    DATABASE_URL: databaseUrl,
    NODE_ENV: "test",
  };

  const res = spawnSync(process.execPath, [prismaCli, "migrate", "deploy"], {
    env,
    encoding: "utf8",
  });

  if (res.status !== 0) {
    throw new Error(
      `Failed to migrate isolated test DB at ${dbPath}: ${res.stderr || res.stdout}`
    );
  }

  // 2. Instantiate isolated Prisma client
  const prisma = new PrismaClient({
    datasources: {
      db: {
        url: databaseUrl,
      },
    },
  });

  return {
    dbPath,
    databaseUrl,
    prisma,
    async cleanup() {
      try {
        await prisma.$disconnect();
      } catch {}

      for (const ext of ["", "-wal", "-shm", "-journal"]) {
        const file = dbPath + ext;
        if (fs.existsSync(file)) {
          try {
            fs.unlinkSync(file);
          } catch {}
        }
      }
    },
  };
}
