import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";

// F0-c′ — TEST DB ŞABLON KOPYASI (her DB için migrate deploy yerine)
// ÖNCE: her createIsolatedTestDb() çağrısı kendi "prisma migrate deploy"'unu koşardı
// (Windows'ta DB başına ~45 sn; süit başına 70+ çağrı → dakikalar). ŞİMDİ: migration'lar
// tüm süit için BİR KEZ "şablon" DB'ye uygulanır; her çağrı şablonun bayt kopyasıdır.
// İzolasyon korunur (her worker kendi dosyası). Şablon adı, migration listesi + schema
// içeriğinden türetilen anahtarla sabitlenir → şema değişince otomatik tazelenir.

const prismaCli = path.resolve("node_modules/prisma/build/index.js");
const migrationsDir = path.resolve("prisma/migrations");
const schemaPath = path.resolve("prisma/schema.prisma");

function templateKey() {
  const names = fs.existsSync(migrationsDir)
    ? fs.readdirSync(migrationsDir).filter((n) => !n.startsWith(".")).sort().join("|")
    : "";
  const schema = fs.existsSync(schemaPath) ? fs.readFileSync(schemaPath, "utf8") : "";
  return crypto.createHash("sha256").update(names + "||" + schema).digest("hex").slice(0, 16);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildTemplate(baseDir, key, templatePath) {
  const tmpPath = path.join(baseDir, `_template-${key}-${process.pid}-${Date.now()}.db`);
  const env = {
    ...process.env,
    DATABASE_URL: `file:${tmpPath.replace(/\\/g, "/")}`,
    NODE_ENV: "test",
  };
  const res = spawnSync(process.execPath, [prismaCli, "migrate", "deploy"], { env, encoding: "utf8" });
  if (res.status !== 0) {
    throw new Error(`Failed to migrate template test DB: ${res.stderr || res.stdout}`);
  }
  for (const ext of ["-wal", "-shm", "-journal"]) {
    const f = tmpPath + ext;
    if (fs.existsSync(f)) {
      try { fs.unlinkSync(f); } catch {}
    }
  }
  try {
    fs.renameSync(tmpPath, templatePath);
  } catch {
    try { fs.unlinkSync(tmpPath); } catch {}
  }
}

async function getTemplatePath(baseDir) {
  const key = templateKey();
  const templatePath = path.join(baseDir, `_template-${key}.db`);
  if (fs.existsSync(templatePath)) return templatePath;

  const lockDir = path.join(baseDir, `_template-${key}.lock`);
  let locked = false;
  try {
    fs.mkdirSync(lockDir);
    locked = true;
  } catch {
    // kilit başka süreçte — bekleyeceğiz
  }

  if (locked) {
    try {
      if (!fs.existsSync(templatePath)) buildTemplate(baseDir, key, templatePath);
    } finally {
      try { fs.rmdirSync(lockDir); } catch {}
    }
    return templatePath;
  }

  // Kilit sahibini bekle (en fazla ~120 sn); bayat kilit (10 dk) varsa düşür.
  for (let i = 0; i < 240; i++) {
    if (fs.existsSync(templatePath)) return templatePath;
    try {
      const st = fs.statSync(lockDir);
      if (Date.now() - st.mtimeMs > 10 * 60 * 1000) {
        fs.rmdirSync(lockDir);
        return getTemplatePath(baseDir);
      }
    } catch {}
    await sleep(500);
  }
  buildTemplate(baseDir, key, templatePath);
  return templatePath;
}

export async function createIsolatedTestDb(workerId = "default") {
  const baseDir = path.join(os.tmpdir(), "maven-test-dbs");
  if (!fs.existsSync(baseDir)) {
    fs.mkdirSync(baseDir, { recursive: true });
  }

  const uniqueSuffix = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const dbFileName = `test-${workerId}-${uniqueSuffix}.db`;
  const dbPath = path.join(baseDir, dbFileName).replace(/\\/g, "/");
  const databaseUrl = `file:${dbPath}`;

  // 1. Şablondan bayt kopyası (migration'lar zaten uygulanmış)
  const templatePath = await getTemplatePath(baseDir);
  fs.copyFileSync(templatePath, dbPath);

  // 2. İzole Prisma client
  const prisma = new PrismaClient({
    datasources: {
      db: { url: databaseUrl },
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
