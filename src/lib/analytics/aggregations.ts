// ─── P21: Edisyon analitiği — saf agregasyonlar ───────────────────────────────
// Rotalar satırları toplar (kiracı/edisyon kapsamlı sorgular), BU dosya sayar.
// Saf + deterministik: birim testler DB'siz çalışır, sonuçlar tekrarda aynıdır.

// ── P21.1: Kayıt→ödeme→giriş hunisi ─────────────────────────────────────────
export interface FunnelRow {
  participationId: string;
  categoryCode: string | null;
  submittedDay: string | null; // YYYY-MM-DD (gönderim günü)
  submitted: boolean;
  confirmed: boolean;
  paid: boolean;
  checkedIn: boolean;
}

export interface FunnelStage {
  key: "REGISTERED" | "SUBMITTED" | "CONFIRMED" | "PAID" | "CHECKED_IN";
  count: number;
  rate: number | null; // önceki aşamaya oran (ilk aşama null)
}

export interface FunnelResult {
  total: number;
  stages: FunnelStage[];
  byCategory: Array<{ code: string; total: number; confirmed: number; paid: number; checkedIn: number }>;
  byDay: Array<{ day: string; submitted: number; confirmed: number; paid: number; checkedIn: number }>;
}

function rate(n: number, d: number): number | null {
  if (d <= 0) return null;
  return Math.round((n / d) * 10000) / 10000;
}

// P21.1 grain kilidi: günlük huni dilimi UTC günüdür (katalog: funnel.by_day).
// TR gece-yarısı sınırındaki gönderimler UTC gününe düşer — değişirse katalog
// + golden test birlikte güncellenir.
export function utcDay(d: Date | null | undefined): string | null {
  if (!d) return null;
  return d.toISOString().slice(0, 10);
}

export function buildFunnel(rows: FunnelRow[]): FunnelResult {
  const seen = new Set<string>();
  const uniq = rows.filter((r) => {
    if (seen.has(r.participationId)) return false;
    seen.add(r.participationId);
    return true;
  });
  const count = (f: (r: FunnelRow) => boolean) => uniq.filter(f).length;
  const cReg = uniq.length;
  const cSub = count((r) => r.submitted);
  const cCon = count((r) => r.confirmed);
  const cPaid = count((r) => r.paid);
  const cIn = count((r) => r.checkedIn);
  const stages: FunnelStage[] = [
    { key: "REGISTERED", count: cReg, rate: null },
    { key: "SUBMITTED", count: cSub, rate: rate(cSub, cReg) },
    { key: "CONFIRMED", count: cCon, rate: rate(cCon, cSub) },
    { key: "PAID", count: cPaid, rate: rate(cPaid, cCon) },
    { key: "CHECKED_IN", count: cIn, rate: rate(cIn, cPaid) },
  ];

  const cats = new Map<string, { total: number; confirmed: number; paid: number; checkedIn: number }>();
  for (const r of uniq) {
    const code = r.categoryCode ?? "UNCATEGORIZED";
    const e = cats.get(code) ?? { total: 0, confirmed: 0, paid: 0, checkedIn: 0 };
    e.total += 1;
    if (r.confirmed) e.confirmed += 1;
    if (r.paid) e.paid += 1;
    if (r.checkedIn) e.checkedIn += 1;
    cats.set(code, e);
  }
  const days = new Map<string, { submitted: number; confirmed: number; paid: number; checkedIn: number }>();
  for (const r of uniq) {
    if (!r.submittedDay) continue;
    const e = days.get(r.submittedDay) ?? { submitted: 0, confirmed: 0, paid: 0, checkedIn: 0 };
    e.submitted += 1;
    if (r.confirmed) e.confirmed += 1;
    if (r.paid) e.paid += 1;
    if (r.checkedIn) e.checkedIn += 1;
    days.set(r.submittedDay, e);
  }
  return {
    total: cReg,
    stages,
    byCategory: [...cats.entries()].map(([code, v]) => ({ code, ...v })).sort((a, b) => b.total - a.total),
    byDay: [...days.entries()].map(([day, v]) => ({ day, ...v })).sort((a, b) => (a.day < b.day ? -1 : 1)),
  };
}

// ── P21.2: Kohort / tekrar katılımı ─────────────────────────────────────────
export interface AttendancePair {
  personId: string;
  editionId: string;
}

export interface EditionMeta {
  id: string;
  name: string;
  startMs: number | null;
}

export interface CohortResult {
  cohorts: Array<{
    editionId: string;
    editionName: string;
    size: number;
    repeats: Array<{ editionId: string; editionName: string; count: number }>;
  }>;
  persons: number;
  repeaters: number;
  repeatRate: number | null;
}

export function buildCohorts(pairs: AttendancePair[], editions: EditionMeta[]): CohortResult {
  const order = new Map(editions.map((e) => [e.id, e]));
  const rank = (id: string): number => {
    const e = order.get(id);
    return e?.startMs ?? Number.MAX_SAFE_INTEGER;
  };
  // kişi → katıldığı edisyonlar (sıralı)
  const per = new Map<string, string[]>();
  for (const p of pairs) {
    if (!order.has(p.editionId)) continue;
    const list = per.get(p.personId) ?? [];
    if (!list.includes(p.editionId)) list.push(p.editionId);
    per.set(p.personId, list);
  }
  for (const list of per.values()) {
    list.sort((a, b) => rank(a) - rank(b) || (a < b ? -1 : 1));
  }
  // kohort = ilk katılım edisyonu
  const cohorts = new Map<string, string[]>();
  let repeaters = 0;
  for (const [personId, list] of per) {
    if (list.length === 0) continue;
    if (list.length > 1) repeaters += 1;
    const first = list[0];
    const bucket = cohorts.get(first);
    if (bucket) bucket.push(personId);
    else cohorts.set(first, [personId]);
  }
  const sortedEditions = [...editions].sort((a, b) => (a.startMs ?? Number.MAX_SAFE_INTEGER) - (b.startMs ?? Number.MAX_SAFE_INTEGER));
  const out: CohortResult["cohorts"] = sortedEditions
    .filter((e) => cohorts.has(e.id))
    .map((e) => {
      const members = new Set(cohorts.get(e.id) ?? []);
      const repeats: Array<{ editionId: string; editionName: string; count: number }> = [];
      for (const later of sortedEditions) {
        if (later.id === e.id || rank(later.id) < rank(e.id)) continue;
        let n = 0;
        for (const pid of members) {
          if ((per.get(pid) ?? []).includes(later.id)) n += 1;
        }
        if (n > 0) repeats.push({ editionId: later.id, editionName: later.name, count: n });
      }
      return { editionId: e.id, editionName: e.name, size: members.size, repeats };
    });
  return {
    cohorts: out,
    persons: per.size,
    repeaters,
    repeatRate: rate(repeaters, per.size),
  };
}

// ── P21.3: RFM skorlama ─────────────────────────────────────────────────────
// Eşikler sabit + belgeli (değişirse sürüm notu gerekir):
//   R (son ödeme üzerinden geçen gün): ≤7→5, ≤30→4, ≤90→3, ≤180→2, üzeri/yok→1
//   F (başarılı ödeme adedi): ≥5→5, ≥3→4, ≥2→3, ≥1→2, 0→1
//   M (toplam ödeme, kuruş): ≥500000→5, ≥200000→4, ≥50000→3, >0→2, 0→1
// Katman (toplam): ≥13 CHAMPION, ≥10 LOYAL, ≥7 POTENTIAL, ≥4 AT_RISK, altı DORMANT
export const RFM_TIERS = ["CHAMPION", "LOYAL", "POTENTIAL", "AT_RISK", "DORMANT"] as const;
export type RfmTier = (typeof RFM_TIERS)[number];

export interface RfmRow {
  personId: string;
  lastPaidAtMs: number | null;
  paidCount: number;
  paidTotal: number;
}

export interface RfmScore {
  personId: string;
  r: number;
  f: number;
  m: number;
  total: number;
  tier: RfmTier;
}

export function scoreRfmPerson(row: RfmRow, nowMs: number): RfmScore {
  const days = row.lastPaidAtMs === null ? null : Math.max(0, Math.floor((nowMs - row.lastPaidAtMs) / 86_400_000));
  const r = days === null ? 1 : days <= 7 ? 5 : days <= 30 ? 4 : days <= 90 ? 3 : days <= 180 ? 2 : 1;
  const f = row.paidCount >= 5 ? 5 : row.paidCount >= 3 ? 4 : row.paidCount >= 2 ? 3 : row.paidCount >= 1 ? 2 : 1;
  const m = row.paidTotal >= 500000 ? 5 : row.paidTotal >= 200000 ? 4 : row.paidTotal >= 50000 ? 3 : row.paidTotal > 0 ? 2 : 1;
  const total = r + f + m;
  const tier: RfmTier = total >= 13 ? "CHAMPION" : total >= 10 ? "LOYAL" : total >= 7 ? "POTENTIAL" : total >= 4 ? "AT_RISK" : "DORMANT";
  return { personId: row.personId, r, f, m, total, tier };
}

export interface RfmResult {
  tiers: Record<RfmTier, number>;
  people: RfmScore[];
}

export function scoreRfm(rows: RfmRow[], nowMs: number): RfmResult {
  const tiers: Record<RfmTier, number> = { CHAMPION: 0, LOYAL: 0, POTENTIAL: 0, AT_RISK: 0, DORMANT: 0 };
  const people = rows.map((r) => scoreRfmPerson(r, nowMs));
  for (const p of people) tiers[p.tier] += 1;
  return { tiers, people };
}

// ── P21.3: Segment dağılımları ──────────────────────────────────────────────
export interface SegmentRow {
  categoryCode: string | null;
  fundingSource: string | null;
  roles: string[];
  returning: boolean;
}

export interface SegmentResult {
  total: number;
  byCategory: Array<{ code: string; count: number }>;
  byFunding: Array<{ source: string; count: number }>;
  byRole: Array<{ role: string; count: number }>;
  returning: number;
  newCount: number;
}

export function buildSegments(rows: SegmentRow[]): SegmentResult {
  const cat = new Map<string, number>();
  const fund = new Map<string, number>();
  const role = new Map<string, number>();
  let returning = 0;
  for (const r of rows) {
    cat.set(r.categoryCode ?? "UNCATEGORIZED", (cat.get(r.categoryCode ?? "UNCATEGORIZED") ?? 0) + 1);
    fund.set(r.fundingSource ?? "UNKNOWN", (fund.get(r.fundingSource ?? "UNKNOWN") ?? 0) + 1);
    for (const ro of new Set(r.roles)) role.set(ro, (role.get(ro) ?? 0) + 1);
    if (r.returning) returning += 1;
  }
  const desc = (m: Map<string, number>, k1: string) =>
    [...m.entries()].map(([k, count]) => ({ [k1]: k, count }) as { code: string; count: number }).sort((a, b) => b.count - a.count);
  return {
    total: rows.length,
    byCategory: desc(cat, "code").map((e) => ({ code: e.code, count: e.count })),
    byFunding: [...fund.entries()].map(([source, count]) => ({ source, count })).sort((a, b) => b.count - a.count),
    byRole: [...role.entries()].map(([role, count]) => ({ role, count })).sort((a, b) => b.count - a.count),
    returning,
    newCount: rows.length - returning,
  };
}

// ── P21.4: Sponsor benchmark (K-anonimlik) ────────────────────────────────────
// Grup istatistiği yalnız grup büyüklüğü K'ya ulaşırsa yayınlanır; küçük
// grupta kıyas KAPALI (suppressed) — tekil sponsor konumu ifşa edilmez.
export const BENCHMARK_MIN_K = 3;
export const BENCHMARK_DEFAULT_K = 5;

export interface BenchmarkMember {
  orgId: string;
  group: string;
  value: number;
}

export interface BenchmarkGroup {
  group: string;
  orgCount: number;
  suppressed: boolean;
  avg: number | null;
  median: number | null;
  p90: number | null;
  max: number | null;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, idx)];
}

export function buildBenchmark(members: BenchmarkMember[], k = BENCHMARK_DEFAULT_K): BenchmarkGroup[] {
  const floor = Math.max(BENCHMARK_MIN_K, Math.floor(k) || BENCHMARK_DEFAULT_K);
  const groups = new Map<string, number[]>();
  for (const m of members) {
    const list = groups.get(m.group) ?? [];
    list.push(m.value);
    groups.set(m.group, list);
  }
  return [...groups.entries()]
    .map(([group, values]) => {
      const sorted = [...values].sort((a, b) => a - b);
      const suppressed = sorted.length < floor;
      return {
        group,
        orgCount: sorted.length,
        suppressed,
        avg: suppressed ? null : Math.round((sorted.reduce((s, v) => s + v, 0) / sorted.length) * 100) / 100,
        median: suppressed ? null : percentile(sorted, 50),
        p90: suppressed ? null : percentile(sorted, 90),
        max: suppressed ? null : sorted[sorted.length - 1],
      };
    })
    .sort((a, b) => (a.group < b.group ? -1 : 1));
}

// ── P21.3: Portföy para birimi çevrimi (açık kur girdisi) ────────────────────
// Kurlar çağrıda AÇIKÇA verilir (tarih+kaynak yanıt meta'sında); eksik kurda
// çevrim YAPILMAZ (400 — sessiz varsayılan kur yasak).
export interface FxConvertResult {
  converted: number;
  missing: string[];
}

export function convertRevenue(amounts: Array<{ currency: string; amount: number }>, rates: Record<string, number>, base: string): FxConvertResult {
  let converted = 0;
  const missing: string[] = [];
  const norm = (c: string) => c.trim().toUpperCase();
  const baseNorm = norm(base);
  for (const a of amounts) {
    const cur = norm(a.currency);
    if (cur === baseNorm) {
      converted += a.amount;
      continue;
    }
    const rate = rates[cur] ?? rates[a.currency];
    if (typeof rate !== "number" || !(rate > 0)) {
      if (!missing.includes(cur)) missing.push(cur);
      continue;
    }
    converted += a.amount * rate;
  }
  return { converted: Math.round(converted * 100) / 100, missing: missing.sort() };
}

// ── P21.4: Veri kapsama (tamlık) ────────────────────────────────────────────
export interface CoverageRow {
  hasEmail: boolean;
  hasPhone: boolean;
  hasCompany: boolean;
  hasCategory: boolean;
  hasBadge: boolean;
}

export interface CoverageResult {
  total: number;
  email: number;
  phone: number;
  company: number;
  categorized: number;
  badged: number;
  emailRate: number | null;
  phoneRate: number | null;
  companyRate: number | null;
  categorizedRate: number | null;
  badgedRate: number | null;
}

export function buildCoverage(rows: CoverageRow[]): CoverageResult {
  const n = (f: (r: CoverageRow) => boolean) => rows.filter(f).length;
  const email = n((r) => r.hasEmail);
  const phone = n((r) => r.hasPhone);
  const company = n((r) => r.hasCompany);
  const categorized = n((r) => r.hasCategory);
  const badged = n((r) => r.hasBadge);
  return {
    total: rows.length,
    email, phone, company, categorized, badged,
    emailRate: rate(email, rows.length),
    phoneRate: rate(phone, rows.length),
    companyRate: rate(company, rows.length),
    categorizedRate: rate(categorized, rows.length),
    badgedRate: rate(badged, rows.length),
  };
}
