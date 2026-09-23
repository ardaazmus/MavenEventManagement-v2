import { PrismaClient } from '@prisma/client'
import { moduleFor, severityFor } from '@/lib/api/notification-meta'

// Canlı bildirim yayını — ActivityLog create/createMany yakalanır, live-bus'a iletilir.
// Fire-and-forget: bus kapalıysa sessizce yutulur; ana işlem ASLA bloklanmaz/bozulmaz.
const LIVE_BUS_PUBLISH_URL = "http://127.0.0.1:3004/publish";

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
    headers: { "content-type": "application/json" },
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
  const base = new PrismaClient({ log: ['query'] });
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
