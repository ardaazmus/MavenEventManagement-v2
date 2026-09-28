/**
 * IndexedDB Offline Mutation Queue and Cache Service (via idb)
 * Allows offline action queues (e.g. check-ins, lead captures, session saves)
 * to be buffered locally and replayed automatically upon network reconnection.
 */
import { openDB, type IDBPDatabase } from "idb";

export interface QueuedMutation {
  id?: number;
  url: string;
  method: "POST" | "PUT" | "DELETE" | "PATCH";
  body?: unknown;
  headers?: Record<string, string>;
  createdAt: number;
  retries: number;
}

export interface DeadLetter extends QueuedMutation {
  deadAt: number;
  lastStatus: number | null;
  reason: "PERMANENT" | "RETRIES_EXHAUSTED";
}

const DB_NAME = "maven_offline_db";
const DB_VERSION = 2;
const QUEUE_STORE = "mutation_queue";
const CACHE_STORE = "cached_data";
const DEAD_STORE = "mutation_dead_letter";

// N-07: sonsuz replay kapandı — üstel geri-çekilmeli sınırlı deneme + ölü-mektup.
export const MAX_REPLAY_ATTEMPTS = 5;
export const REPLAY_BASE_DELAY_MS = 500;
export const REPLAY_MAX_DELAY_MS = 8000;

export type ReplayDecision =
  | { kind: "SUCCESS" }
  | { kind: "RETRY" }
  | { kind: "DEAD"; reason: DeadLetter["reason"] };

// Saf karar fonksiyonu (test edilebilir): durum + deneme sayısından karar üretir.
// 4xx (408/429 hariç) kalıcıdır; 5xx/ağ/408/429 geçicidir.
export function decideReplay(status: number | null, retries: number): ReplayDecision {
  if (status !== null && status >= 200 && status < 300) return { kind: "SUCCESS" };
  if (status !== null && status >= 400 && status < 500 && status !== 408 && status !== 429) {
    return { kind: "DEAD", reason: "PERMANENT" };
  }
  if (retries + 1 >= MAX_REPLAY_ATTEMPTS) return { kind: "DEAD", reason: "RETRIES_EXHAUSTED" };
  return { kind: "RETRY" };
}

export function replayDelayMs(retries: number): number {
  return Math.min(REPLAY_BASE_DELAY_MS * 2 ** retries, REPLAY_MAX_DELAY_MS);
}

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDb(): Promise<IDBPDatabase> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("IndexedDB is only available in browser environments"));
  }

  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(QUEUE_STORE)) {
          db.createObjectStore(QUEUE_STORE, { keyPath: "id", autoIncrement: true });
        }
        if (!db.objectStoreNames.contains(CACHE_STORE)) {
          db.createObjectStore(CACHE_STORE);
        }
        if (!db.objectStoreNames.contains(DEAD_STORE)) {
          db.createObjectStore(DEAD_STORE, { keyPath: "id", autoIncrement: true });
        }
      },
    });
  }

  return dbPromise;
}

export async function enqueueMutation(
  url: string,
  method: "POST" | "PUT" | "DELETE" | "PATCH",
  body?: unknown,
  headers?: Record<string, string>
): Promise<number> {
  const db = await getDb();
  const mutation: QueuedMutation = {
    url,
    method,
    body,
    headers,
    createdAt: Date.now(),
    retries: 0,
  };
  return (await db.add(QUEUE_STORE, mutation)) as number;
}

export async function getPendingMutations(): Promise<QueuedMutation[]> {
  const db = await getDb();
  return db.getAll(QUEUE_STORE);
}

export async function removeMutation(id: number): Promise<void> {
  const db = await getDb();
  await db.delete(QUEUE_STORE, id);
}

export interface ReplayReport {
  processed: number;
  failed: number;
  retried: number;
  deadLettered: number;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function replayPendingMutations(): Promise<ReplayReport> {
  const empty: ReplayReport = { processed: 0, failed: 0, retried: 0, deadLettered: 0 };
  if (typeof window === "undefined" || !navigator.onLine) return empty;

  const db = await getDb();
  const mutations = await getPendingMutations();
  const report = { ...empty };

  for (const m of mutations) {
    if (!m.id) continue;
    let status: number | null = null;
    try {
      const res = await fetch(m.url, {
        method: m.method,
        headers: {
          "Content-Type": "application/json",
          ...(m.headers ?? {}),
        },
        body: m.body ? JSON.stringify(m.body) : undefined,
      });
      status = res.status;
    } catch {
      status = null; // ağ kesintisi — geçici
    }

    const decision = decideReplay(status, m.retries);
    if (decision.kind === "SUCCESS") {
      await db.delete(QUEUE_STORE, m.id);
      report.processed++;
    } else if (decision.kind === "DEAD") {
      const { id: _drop, ...rest } = m;
      await db.add(DEAD_STORE, {
        ...rest,
        deadAt: Date.now(),
        lastStatus: status,
        reason: decision.reason,
      } satisfies Omit<DeadLetter, "id">);
      await db.delete(QUEUE_STORE, m.id);
      report.deadLettered++;
      report.failed++;
    } else {
      await db.put(QUEUE_STORE, { ...m, retries: m.retries + 1 });
      report.retried++;
      await sleep(replayDelayMs(m.retries));
    }
  }

  return report;
}

export async function getDeadLetters(): Promise<DeadLetter[]> {
  const db = await getDb();
  return db.getAll(DEAD_STORE);
}

export async function clearDeadLetter(id: number): Promise<void> {
  const db = await getDb();
  await db.delete(DEAD_STORE, id);
}

export async function cacheOfflineData(key: string, data: unknown): Promise<void> {
  const db = await getDb();
  await db.put(CACHE_STORE, data, key);
}

export async function getCachedOfflineData<T>(key: string): Promise<T | undefined> {
  const db = await getDb();
  return db.get(CACHE_STORE, key);
}
