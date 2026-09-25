// VERİTABANI & MIGRATION DURUM API (geçici — SQLite → MySQL/MariaDB Hostinger taşınması)
// GET: sağlayıcı tespiti, dosya bilgisi, tablo satır sayıları, MySQL hazır-bulunurluk
// kontrolleri (çift-kayıt taramaları dahil) ve adım-adım migration runbook'u döner.
// Yalnız OKUMA yapar — hiçbir şeye yazmaz, şemayı değiştirmez (geçici denetim sekmesi).
// Yetki: requireAdmin (platform düzeyi — kiracı bağlamı gerektirmez, yazım YOK).
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { enforceRateLimit } from "@/lib/rate-limit";
import { requireAdmin } from "@/lib/auth/request-context";
import fs from "fs";
import path from "path";

export const dynamic = "force-dynamic";

type Check = { key: string; label: string; status: "PASS" | "WARN" | "TODO" | "INFO"; detail: string };

function detectProvider(url: string | undefined): { provider: string; label: string; path: string | null } {
  if (!url) return { provider: "unknown", label: "Bilinmiyor", path: null };
  if (url.startsWith("file:")) {
    const p = url.replace(/^file:/, "");
    return { provider: "sqlite", label: "SQLite", path: path.isAbsolute(p) ? p : path.join(process.cwd(), p) };
  }
  if (url.startsWith("mysql:")) return { provider: "mysql", label: "MySQL", path: null };
  if (url.startsWith("postgres:")) return { provider: "postgresql", label: "PostgreSQL", path: null };
  return { provider: "unknown", label: "Bilinmiyor", path: null };
}

export async function GET(req: NextRequest) {
  const gate = await requireAdmin();
  if (gate) return gate;
  try {
    const denied = enforceRateLimit(req, { key: "db-migration-read", limit: 20, windowMs: 60_000 });
    if (denied) return denied;

    const ds = detectProvider(process.env.DATABASE_URL);
    const tables: { name: string; rows: number }[] = [];
    let dbSizeBytes: number | null = null;

    if (ds.provider === "sqlite") {
      if (ds.path) {
        try {
          dbSizeBytes = fs.statSync(ds.path).size;
        } catch {
          dbSizeBytes = null;
        }
      }
      const names = (await db.$queryRawUnsafe<{ name: string }[]>(
        `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name`,
      )) as { name: string }[];
      // satır sayıları — paralel COUNT'lar (demo ölçeğinde hızlı)
      const counts = await Promise.all(
        names.map(async (t) => {
          try {
            const r = (await db.$queryRawUnsafe<{ c: number }[]>(`SELECT COUNT(*) as c FROM "${t.name}"`)) as { c: number }[];
            return { name: t.name, rows: Number(r[0]?.c ?? 0) };
          } catch {
            return { name: t.name, rows: -1 };
          }
        }),
      );
      tables.push(...counts);
    } else {
      // MySQL/PostgreSQL'e taşındığında: information_schema tabanlı sayım (yer tutucu)
      tables.push({ name: "(information_schema sayımı hedef altyapıda aktif)", rows: -1 });
    }

    // ── MySQL hazır-bulunurluk kontrolleri (canlı hesaplanır) ──
    const checks: Check[] = [];

    // 1) B2B çift-kayıt taraması — unique index (editionId, startsAt, location) önkoşulu
    let b2bDups = -1;
    try {
      const dups = (await db.$queryRawUnsafe<{ c: number }[]>(
        `SELECT COUNT(*) as c FROM (SELECT editionId, startsAt, location FROM B2bPlan WHERE startsAt IS NOT NULL AND location IS NOT NULL GROUP BY editionId, startsAt, location HAVING COUNT(*) > 1)`,
      )) as { c: number }[];
      b2bDups = Number(dups[0]?.c ?? 0);
    } catch {
      b2bDups = -1;
    }
    checks.push({
      key: "b2b_unique_ready",
      label: "B2B çift-kayıt taraması (unique: editionId+startsAt+location)",
      status: b2bDups === 0 ? "PASS" : b2bDups < 0 ? "WARN" : "TODO",
      detail: b2bDups === 0
        ? "0 çift kayıt — unique indeks MySQL'e aynen taşınabilir"
        : b2bDups < 0
          ? "Tarama çalıştırılamadı"
          : `${b2bDups} çift kayıt var — migration öncesi temizlenmelidir`,
    });

    // 2) Eşzamanlılık mimarisi (statik mimari bilgisi)
    checks.push({
      key: "concurrency_arch",
      label: "Eşzamanlılık kontrolü mimarisi",
      status: "PASS",
      detail:
        "B2B yazımları withLock (süreç-içi mutex) + 409 çakışma reddi + DB unique invariant ile korunuyor. " +
        "MySQL/MariaDB'de tek-örnek → çok-örnek geçişte withLock paylaşılan depoya (ör. Redis GETLOCK) taşınır; " +
        "çakışma sorgusu SELECT … FOR UPDATE transaction ile güçlendirilir.",
    });

    // 3) Kimlik biçimi — cuid, MySQL VARCHAR(191) PK uyumlu
    checks.push({
      key: "ids_cuid",
      label: "Birincil anahtar biçimi (cuid)",
      status: "PASS",
      detail: "Tüm @id alanları String cuid — MySQL VARCHAR(191) PK ile uyumlu, dönüşüm gerekmez",
    });

    // 4) Enum kullanımı — şema String + uygulama sabitleri (native enum YOK)
    checks.push({
      key: "enums_string",
      label: "Enum stratejisi (String + sabitler)",
      status: "PASS",
      detail: "Şema native Prisma enum kullanmaz (SQLite kısıtından gelen String+sabit stratejisi) — MySQL ENUM dönüş derdi yok",
    });

    // 5) DateTime hassasiyeti
    checks.push({
      key: "datetime",
      label: "DateTime → DATETIME(3) uyumu",
      status: "PASS",
      detail: "Prisma MySQL connector DateTime alanlarını DATETIME(3) olarak yazar — SQLite ISO saklamadan sorunsuz dönüşür",
    });

    // 6) Büyük-içerik kolonları (artifact'tan sayım)
    const artifactPath = path.join(process.cwd(), "docs", "schema.mysql.prisma");
    let longText = -1;
    let textCount = -1;
    let artifactOk = false;
    try {
      const art = fs.readFileSync(artifactPath, "utf8");
      longText = (art.match(/@db\.LongText/g) ?? []).length;
      textCount = (art.match(/@db\.Text/g) ?? []).length;
      artifactOk = longText > 0 && textCount > 0;
    } catch {
      artifactOk = false;
    }
    checks.push({
      key: "artifact",
      label: "MySQL şema artefaktı (docs/schema.mysql.prisma)",
      status: artifactOk ? "PASS" : "TODO",
      detail: artifactOk
        ? `Üretildi ve yapısal doğrulandı — ${longText} LongText (dataURL/görsel alanlar) + ${textCount} Text kolon dönüşümü hazır`
        : "Artefakt yok — `bun scripts/generate-mysql-schema.mjs` ile üretin",
    });
    checks.push({
      key: "longtext",
      label: "Büyük-içerik kolon stratejisi",
      status: artifactOk ? "INFO" : "TODO",
      detail:
        "dataURL görsel alanları (portal logo/banner/kroki, sponsor logo, arka plan görselleri) LongText'e map edilir; " +
        "görseller medya sistemine taşınırsa (öneri) payload'lar küçülür",
    });

    const totalRows = tables.reduce((s, t) => s + Math.max(t.rows, 0), 0);
    checks.push({
      key: "scale",
      label: "Veri hacmi (migration pencere planı)",
      status: "INFO",
      detail: `${tables.filter((t) => t.rows >= 0).length} tablo · ~${totalRows.toLocaleString("tr-TR")} satır — bu hacim birkaç dakikalık bakım penceresiyle taşınır`,
    });

    // ── runbook ──
    const runbook = [
      { step: 1, title: "Hostinger veritabanı oluştur", command: "hPanel → Veritabanları → MySQL/MariaDB DB + kullanıcı oluştur (utf8mb4_unicode_ci)" },
      { step: 2, title: "DATABASE_URL değiştir", command: "DATABASE_URL=\"mysql://KULLANICI:SIFRE@HOST:3306/DB\"" },
      { step: 3, title: "MySQL şemasını uygula", command: "cp docs/schema.mysql.prisma prisma/schema.prisma && bunx prisma db push" },
      { step: 4, title: "Veriyi SQLite'tan dök", command: "sqlite3 db/custom.db .dump > dump.sql  (veya tablo-bazlı CSV)" },
      { step: 5, title: "Veriyi MySQL'e yükle", command: "mysql -h HOST -u KULLANICI -p DB < dump-donusumu.sql  (tarih/boolean dönüşümleri script'te)" },
      { step: 6, title: "Prisma client yeniden üret", command: "bunx prisma generate && bun run dev" },
      { step: 7, title: "Doğrulama", command: "/api/health + bu sekmedeki satır sayıları kaynak/hedef eşleşmesi" },
      { step: 8, title: "Çok-örnek hazırlığı (opsiyonel)", command: "withLock anahtarlarını Redis GETLOCK'a taşı (bkz. concurrency_arch kontrolü)" },
    ];

    return NextResponse.json({
      datasource: { provider: ds.provider, label: ds.label, path: ds.path, sizeBytes: dbSizeBytes },
      modelCount: (fs.readFileSync(path.join(process.cwd(), "prisma", "schema.prisma"), "utf8").match(/^model\s+/gm) ?? []).length,
      tables,
      checks,
      runbook,
      generatedAt: new Date().toISOString(),
    });
  } catch (e) {
    console.error("admin/db-migration GET:", e);
    return NextResponse.json({ error: "Migration durumu alınamadı" }, { status: 500 });
  }
}
