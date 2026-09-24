import { PrismaClient } from '@prisma/client'
import { moduleFor, severityFor } from '@/lib/api/notification-meta'

// Canlı bildirim yayını — ActivityLog create/createMany yakalanır, live-bus'a iletilir.
// Fire-and-forget: bus kapalıysa sessizce yutulur; ana işlem ASLA bloklanmaz/bozulmaz.
const LIVE_BUS_PUBLISH_URL = "http://127.0.0.1:3004/publish";
// P1 (yeni-fazlar 6): yayın kanalı paylaşımlı anahtarla korunur — live-bus tarafıyla
// AYNI env/değer kullanılır (LIVE_BUS_KEY); geliştirmede ortak başvuru değeri.
const LIVE_BUS_KEY = process.env.LIVE_BUS_KEY ?? "maven-live-bus-dev-key";

type ActivityLogLike = {
  id: string;
  type: string;
  message: string;
  editionId?: string | null;
  entityType?: string | null;
  actorName?: string | null;
  createdAt: Date;
};

function publishRow(row: ActivityLogLike) {
  if (!row?.id || !row?.type || !(row.createdAt instanceof Date)) return;
  const payload = {
    id: row.id,
    type: row.type,
    message: row.message,
    actorName: row.actorName ?? null,
    entityType: row.entityType ?? null,
    createdAt: row.createdAt.toISOString(),
    severity: severityFor(row.type),
    module: moduleFor(row.entityType, row.type),
  };
  fetch(LIVE_BUS_PUBLISH_URL, {
    method: "POST",
    headers: { "content-type": "application/json", "x-live-bus-key": LIVE_BUS_KEY },
    body: JSON.stringify({
      room: row.editionId ? `edition:${row.editionId}` : "global",
      payload,
    }),
    signal: AbortSignal.timeout(900),
  }).catch(() => {
    // live-bus kapalı olabilir — bildirim akışı REST yoklamasından devam eder
  });
}

const globalForPrisma = globalThis as unknown as {
  prisma: ReturnType<typeof createDb> | undefined
}

// Prisma $extends sorgu kancası — tüm activityLog.create / createMany çağrıları
// (33+ çağrı noktası) tek yerden canlı veri yoluna düşer.
function createDb() {
  // P2: prisma:query log'u yalnız geliştirmede (db.ts:50 düzeltmesi) — üretimde gürültü yok
  const base = new PrismaClient({ log: process.env.NODE_ENV === "development" ? ["query"] : [] });
  // P2: SQLite WAL + busy_timeout — aynı anda yazım çakışmalarında bekleyip retry eder
  // (scan hız-yolu 500-burst kanıtı için ön şart). WAL dosya-düzeyi kalıcıdır; busy_timeout
  // bağlantı başınadır — açılış bağlantısına uygulanır, sonraki havuz bağlantıları WAL'dan yararlanır.
  void base.$queryRawUnsafe("PRAGMA journal_mode=WAL;").catch(() => undefined);
  void base.$queryRawUnsafe("PRAGMA busy_timeout=5000;").catch(() => undefined);
  // P2 kararı: UYGULAMA-DÜZEYİ OKUMA ÖNBELLEĞİ YOK — KPI'lar her istekte canlı agregasyondur.
  // (Not: okuma önbelleği gerekirse Redis katmanı ayrı değerlendirilir; db içinde tutulmaz.)
  return base.$extends({
    query: {
      activityLog: {
        async create({ args, query }) {
          const result = await query(args);
          try { publishRow(result as unknown as ActivityLogLike); } catch { /* yayın hatası iş akışını bozmaz */ }
          return result;
        },
        async createMany({ args, query }) {
          const result = await query(args);
          try {
            const data = (args as { data?: unknown }).data;
            const rows = Array.isArray(data) ? data : data != null ? [data] : [];
            const now = new Date();
            for (const raw of rows) {
              const row = raw as Partial<ActivityLogLike> & Record<string, unknown>;
              publishRow({
                id: String(row.id ?? `bulk-${Math.random().toString(36).slice(2)}`),
                type: String(row.type ?? ""),
                message: String(row.message ?? ""),
                editionId: (row.editionId as string | null | undefined) ?? null,
                entityType: (row.entityType as string | null | undefined) ?? null,
                actorName: (row.actorName as string | null | undefined) ?? null,
                createdAt: row.createdAt instanceof Date ? row.createdAt : now,
              });
            }
          } catch { /* yayın hatası iş akışını bozmaz */ }
          return result;
        },
      },
    },
  });
}

export const db = globalForPrisma.prisma ?? createDb()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
