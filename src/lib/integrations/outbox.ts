// ─── P22.1/P22.2: Outbox — işlemsel yayın + lease'li tüketim ────────────────
// Üretici iş yazımıyla AYNI transaction'da publishOutbox çağırır (istemci
// db ya da tx olur) — iş rollback olursa event de düşer (çift-yazım yok).
// Tüketici claimOutbox ile lease alır (süre dolmadan başkası alamaz);
// hata → FAILED + backoff; maxAttempts aşımı → DEAD (dead-letter).
// Idempotency: aynı idempotencyKey ikinci yayını dedupe eder (P2002 yakınsar).
export const OUTBOX_LEASE_MS = 60_000;
export const OUTBOX_BATCH = 25;
export const OUTBOX_MAX_ATTEMPTS = 5;

export interface OutboxRow {
  id: string;
  status: string;
  retryCount: number;
  maxAttempts: number;
  lockedAt: Date | null;
  lockedBy: string | null;
}

export interface OutboxClient {
  outboxEvent: {
    create: (args: { data: Record<string, unknown> }) => Promise<{ id: string }>;
    findUnique: (args: { where: Record<string, unknown> }) => Promise<OutboxRow | null>;
    findMany: (args: Record<string, unknown>) => Promise<OutboxRow[]>;
    update: (args: { where: Record<string, unknown>; data: Record<string, unknown> }) => Promise<unknown>;
    updateMany: (args: { where: Record<string, unknown>; data: Record<string, unknown> }) => Promise<{ count: number }>;
  };
}

export interface PublishInput {
  tenantId?: string | null;
  editionId?: string | null;
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  payload: Record<string, unknown>;
  idempotencyKey?: string | null;
  maxAttempts?: number;
}

// üstel backoff: 5sn × 2^n, tavan 15dk — deterministik (jitter yok, testli)
export function backoffMs(retryCount: number): number {
  const n = Math.max(0, Math.floor(retryCount));
  return Math.min(15 * 60_000, 5_000 * 2 ** n);
}

function isUniqueViolation(e: unknown): boolean {
  return typeof e === "object" && e !== null && (e as { code?: string }).code === "P2002";
}

export async function publishOutbox(
  client: OutboxClient,
  input: PublishInput,
): Promise<{ id: string; deduped: boolean }> {
  const data: Record<string, unknown> = {
    tenantId: input.tenantId ?? null,
    editionId: input.editionId ?? null,
    aggregateType: input.aggregateType,
    aggregateId: input.aggregateId,
    eventType: input.eventType,
    payload: JSON.stringify(input.payload),
    idempotencyKey: input.idempotencyKey ?? null,
    maxAttempts: input.maxAttempts ?? OUTBOX_MAX_ATTEMPTS,
  };
  if (!input.idempotencyKey) {
    const created = await client.outboxEvent.create({ data });
    return { id: created.id, deduped: false };
  }
  try {
    const created = await client.outboxEvent.create({ data });
    return { id: created.id, deduped: false };
  } catch (e) {
    if (!isUniqueViolation(e)) throw e;
    const existing = await client.outboxEvent.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
    });
    if (!existing) throw e;
    return { id: existing.id, deduped: true };
  }
}

export interface ClaimOptions {
  batch?: number;
  leaseMs?: number;
  nowMs?: number;
}

// vadesi gelen PENDING/FAILED + lease'i düşmüş PROCESSING satırları tek tek
// koşullu UPDATE ile alınır — çift claim imkânsız (count===1 kazanan).
export async function claimOutbox(
  client: OutboxClient,
  workerId: string,
  opts: ClaimOptions = {},
): Promise<OutboxRow[]> {
  const batch = Math.max(1, Math.min(100, opts.batch ?? OUTBOX_BATCH));
  const leaseMs = opts.leaseMs ?? OUTBOX_LEASE_MS;
  const now = new Date(opts.nowMs ?? Date.now());
  const leaseCutoff = new Date(now.getTime() - leaseMs);
  const candidates = await client.outboxEvent.findMany({
    where: {
      OR: [
        { status: "PENDING", nextRunAt: { lte: now } },
        { status: "FAILED", nextRunAt: { lte: now } },
        { status: "PROCESSING", lockedAt: { lte: leaseCutoff } },
      ],
    },
    orderBy: [{ nextRunAt: "asc" }, { createdAt: "asc" }],
    take: batch,
  });
  const claimed: OutboxRow[] = [];
  for (const c of candidates) {
    const res = await client.outboxEvent.updateMany({
      where: {
        id: c.id,
        status: c.status,
        OR: [{ lockedAt: null }, { lockedAt: { lte: leaseCutoff } }],
      },
      data: { status: "PROCESSING", lockedAt: now, lockedBy: workerId },
    });
    if (res.count === 1) {
      claimed.push({ ...c, status: "PROCESSING", lockedAt: now, lockedBy: workerId });
    }
  }
  return claimed;
}

export async function completeOutbox(client: OutboxClient, id: string, workerId: string): Promise<boolean> {
  const res = await client.outboxEvent.updateMany({
    where: { id, status: "PROCESSING", lockedBy: workerId },
    data: { status: "COMPLETED", processedAt: new Date(), lockedAt: null, lockedBy: null, error: null },
  });
  return res.count === 1;
}

export interface FailOutcome {
  applied: boolean;
  dead: boolean;
  nextRunAt: Date | null;
}

export async function failOutbox(
  client: OutboxClient,
  id: string,
  workerId: string,
  error: string,
  nowMs = Date.now(),
  opts: { fatal?: boolean } = {},
): Promise<FailOutcome> {
  const row = await client.outboxEvent.findUnique({ where: { id } });
  if (!row || row.status !== "PROCESSING" || row.lockedBy !== workerId) {
    return { applied: false, dead: false, nextRunAt: null };
  }
  const attempts = row.retryCount + 1;
  // fatal (4xx kalıcı ret) ya da deneme tavanı → doğrudan DEAD
  const dead = opts.fatal === true || attempts >= row.maxAttempts;
  const next = dead ? null : new Date(nowMs + backoffMs(row.retryCount));
  await client.outboxEvent.update({
    where: { id },
    data: dead
      ? {
          status: "DEAD", retryCount: attempts, error: error.slice(0, 500),
          deadAt: new Date(nowMs),
          deadReason: opts.fatal === true ? `fatal: ${error.slice(0, 200)}` : `maxAttempts (${row.maxAttempts}) aşıldı`,
          lockedAt: null, lockedBy: null,
        }
      : {
          status: "FAILED", retryCount: attempts, error: error.slice(0, 500),
          nextRunAt: next as Date, lockedAt: null, lockedBy: null,
        },
  });
  return { applied: true, dead, nextRunAt: next };
}

// operasyon: FAILED/DEAD kaydı kuyruğa iade (tekrar deneme)
export async function requeueOutbox(client: OutboxClient, id: string, nowMs = Date.now()): Promise<boolean> {
  const res = await client.outboxEvent.updateMany({
    where: { id, status: { in: ["FAILED", "DEAD"] } },
    data: {
      status: "PENDING", retryCount: 0, error: null,
      nextRunAt: new Date(nowMs), lockedAt: null, lockedBy: null,
      deadAt: null, deadReason: null,
    },
  });
  return res.count === 1;
}
