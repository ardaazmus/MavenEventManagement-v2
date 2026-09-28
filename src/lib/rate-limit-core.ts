// ─── P06.2: Saf kayan-pencere çekirdeği (enjekte saat ile test edilebilir) ─────
// enforceRateLimit ile BİREBİR aynı algoritma: kova başına vuruş dizisi, pencere
// dışı budama, limit aşımında en eski vuruştan Retry-After. Bu dosya Next'e
// bağımlı değildir; node:test doğrudan içe aktarabilir.
export interface SlidingWindowBudget {
  windowMs: number;
  max: number;
}

export interface SlidingWindowResult {
  allowed: boolean;
  remaining: number;
  retryAfterSec: number;
}

export function createSlidingWindowLimiter(options?: { now?: () => number; maxKeys?: number }): {
  check: (key: string, budget: SlidingWindowBudget) => SlidingWindowResult;
  reset: (key?: string) => void;
} {
  const now = options?.now ?? Date.now;
  const maxKeys = options?.maxKeys ?? 10_000;
  const buckets = new Map<string, number[]>();

  function check(key: string, budget: SlidingWindowBudget): SlidingWindowResult {
    const current = now();
    let hits = buckets.get(key) ?? [];
    hits = hits.filter((t) => current - t < budget.windowMs);
    if (hits.length >= budget.max) {
      const retryAfterSec = Math.max(1, Math.ceil((budget.windowMs - (current - hits[0])) / 1000));
      buckets.set(key, hits);
      return { allowed: false, remaining: 0, retryAfterSec };
    }
    hits.push(current);
    if (!buckets.has(key) && buckets.size >= maxKeys) {
      const oldest = buckets.keys().next();
      if (!oldest.done) buckets.delete(oldest.value);
    }
    buckets.set(key, hits);
    return { allowed: true, remaining: budget.max - hits.length, retryAfterSec: 0 };
  }

  function reset(key?: string): void {
    if (key === undefined) buckets.clear();
    else buckets.delete(key);
  }

  return { check, reset };
}
