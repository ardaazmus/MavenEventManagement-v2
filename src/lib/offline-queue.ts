/**
 * IndexedDB Offline Mutation Queue and Cache Service (via idb)
 * Allows offline action queues (e.g. check-ins, lead captures, session saves)
 * to be buffered locally and replayed automatically upon network reconnection.
 */
import { openDB, IDBPDatabase } from "idb";

export interface QueuedMutation {
  id?: number;
  url: string;
  method: "POST" | "PUT" | "DELETE" | "PATCH";
  body?: unknown;
  headers?: Record<string, string>;
  createdAt: number;
  retries: number;
}

const DB_NAME = "maven_offline_db";
const DB_VERSION = 1;
const QUEUE_STORE = "mutation_queue";
const CACHE_STORE = "cached_data";

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

export async function replayPendingMutations(): Promise<{ processed: number; failed: number }> {
  if (typeof window === "undefined" || !navigator.onLine) {
    return { processed: 0, failed: 0 };
  }

  const mutations = await getPendingMutations();
  let processed = 0;
  let failed = 0;

  for (const m of mutations) {
    if (!m.id) continue;
    try {
      const res = await fetch(m.url, {
        method: m.method,
        headers: {
          "Content-Type": "application/json",
          ...(m.headers ?? {}),
        },
        body: m.body ? JSON.stringify(m.body) : undefined,
      });

      if (res.ok) {
        await removeMutation(m.id);
        processed++;
      } else {
        failed++;
      }
    } catch {
      failed++;
    }
  }

  return { processed, failed };
}

export async function cacheOfflineData(key: string, data: unknown): Promise<void> {
  const db = await getDb();
  await db.put(CACHE_STORE, data, key);
}

export async function getCachedOfflineData<T>(key: string): Promise<T | undefined> {
  const db = await getDb();
  return db.get(CACHE_STORE, key);
}
