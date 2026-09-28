// ─── P18.5: Geri-yükleme tatbikatı — RPO/RTO ölçümü ───────────────────────────
// Sözleşme: verilen SQLite dosyası salt-okunur kopyalanır, kopya üzerinde
// bütünlük + sayım doğrulaması yapılır; kaynak dosyaya YAZILMAZ.
// RPO = yedek yaşı (ölçüm anı - dosya mtime); RTO = kopyalama+doğrulama süresi.
// Eşikler: RTO_MS_BUDGET (varsayılan 60sn), MIN_TABLES.
// NOT: `@/` takma adı YOK — node --test (tip-sıyırma) uyumu için bağımsız.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

export const RESTORE_RTO_MS_BUDGET = 60_000;
export const RESTORE_MIN_TABLES = 10;

export interface RestoreDrillReport {
  ok: boolean;
  sourceDb: string;
  sourceBytes: number;
  backupAgeSec: number;
  rtoMs: number;
  integrity: string;
  tables: number;
  rows: Record<string, number>;
  withinBudget: boolean;
  error?: string;
}

const COUNT_TABLES = [
  "tenant",
  "person",
  "eventEdition",
  "eventParticipation",
  "registration",
  "order",
  "campaign",
  "mediaAsset",
  "contactConsent",
  "sendDecision",
  "activityLog",
  "kvkkErasureRequest",
] as const;

function tableName(delegate: string): string {
  return delegate.charAt(0).toUpperCase() + delegate.slice(1);
}

export async function runRestoreDrill(sourceDbPath: string, opts: { workDir?: string; rtoBudgetMs?: number } = {}): Promise<RestoreDrillReport> {
  const started = Date.now();
  const budget = opts.rtoBudgetMs ?? RESTORE_RTO_MS_BUDGET;
  const fail = (error: string, extra: Partial<RestoreDrillReport> = {}): RestoreDrillReport => ({
    ok: false,
    sourceDb: sourceDbPath,
    sourceBytes: 0,
    backupAgeSec: -1,
    rtoMs: Date.now() - started,
    integrity: "NOT_CHECKED",
    tables: 0,
    rows: {},
    withinBudget: false,
    error,
    ...extra,
  });
  if (!fs.existsSync(sourceDbPath)) return fail("Kaynak veritabanı yok");
  const stat = fs.statSync(sourceDbPath);
  if (stat.size === 0) return fail("Kaynak veritabanı boş");
  const workDir = opts.workDir ?? fs.mkdtempSync(path.join(os.tmpdir(), "maven-restore-drill-"));
  fs.mkdirSync(workDir, { recursive: true });
  const copyPath = path.join(workDir, "restored.db").replace(/\\/g, "/");
  try {
    fs.copyFileSync(sourceDbPath, copyPath);
    // WAL eşlikçisi varsa kopyalanır (tutarlı görüntü için).
    for (const ext of ["-wal", "-shm", "-journal"]) {
      if (fs.existsSync(sourceDbPath + ext)) {
        try {
          fs.copyFileSync(sourceDbPath + ext, copyPath + ext);
        } catch {
          // kilitli eşlikçi — ana dosya tek başına doğrulanır
        }
      }
    }
  } catch (e) {
    return fail(`Kopyalama başarısız: ${e instanceof Error ? e.message : e}`, { sourceBytes: stat.size });
  }
  const prisma = new PrismaClient({ datasources: { db: { url: `file:${copyPath}` } } });
  try {
    const integrity = (await prisma.$queryRawUnsafe("PRAGMA integrity_check")) as Array<{ integrity_check: string }>;
    const integrityText = integrity.map((r) => r.integrity_check).join(";") || "empty";
    const rows: Record<string, number> = {};
    let tables = 0;
    for (const delegate of COUNT_TABLES) {
      try {
        const quoted = `"${tableName(delegate)}"`;
        const res = (await prisma.$queryRawUnsafe(`SELECT COUNT(*) AS c FROM ${quoted}`)) as Array<{ c: bigint | number }>;
        rows[delegate] = Number(res[0]?.c ?? 0);
        tables++;
      } catch {
        // tablo yoksa sayılmaz (kısmi şema toleransı)
      }
    }
    const rtoMs = Date.now() - started;
    const ok = integrityText === "ok" && tables >= RESTORE_MIN_TABLES;
    return {
      ok,
      sourceDb: sourceDbPath,
      sourceBytes: stat.size,
      backupAgeSec: Math.max(0, Math.round((Date.now() - stat.mtimeMs) / 1000)),
      rtoMs,
      integrity: integrityText.slice(0, 200),
      tables,
      rows,
      withinBudget: rtoMs <= budget,
      ...(ok ? {} : { error: integrityText === "ok" ? `yetersiz tablo (${tables})` : `bütünlük: ${integrityText.slice(0, 120)}` }),
    };
  } catch (e) {
    return fail(`Doğrulama başarısız: ${e instanceof Error ? e.message : e}`, { sourceBytes: stat.size });
  } finally {
    await prisma.$disconnect().catch(() => undefined);
    fs.rmSync(workDir, { recursive: true, force: true });
  }
}
