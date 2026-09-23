import { PrismaClient } from '@prisma/client'
import { moduleFor, severityFor } from '@/lib/api/notification-meta'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

// Canlı bildirim yayını — ActivityLog create yakalanır, live-bus'a iletilir.
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

function publishActivity(row: ActivityLogLike) {
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

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: ['query'],
  })

// Prisma query middleware — tek kancadan tüm activityLog.create çağrıları (33+ nokta) canlıya düşer.
db.$use(async (params, next) => {
  const result = await next(params);
  if (params.model === "ActivityLog" && params.action === "create") {
    const row = result as unknown as ActivityLogLike;
    if (row?.id && row?.type && row.createdAt instanceof Date) {
      try { publishActivity(row); } catch { /* yayın hatası iş akışını bozmaz */ }
    }
  }
  return result;
});

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
