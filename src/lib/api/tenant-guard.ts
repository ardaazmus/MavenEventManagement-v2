// ─── Tenant Guard (Faz A) ───────────────────────────────────────────────────────
// Kural: tenant/edition-kapsamlı HER entity'de tenantId filtresi OTOMATİK uygulanır;
// bağlam çözülemeyen istek 400 alır — sessiz tüm-veri dönüşü yasaktır.
// Auth yokken bağlam = bootstrap aktif kiracı (tek kiracı). TODO-auth: gerçek oturum
// bağlamı geldiğinde yalnız resolveContext içindeki sorgu değişecek, kurallar aynı kalır.
import { db } from "@/lib/db";

export class GuardError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

export type Scope =
  | { mode: "tenant" }                                        // modelde tenantId kolonu var (GET: param zorunlu)
  | { mode: "edition" }                                       // modelde zorunlu editionId kolonu var
  | { mode: "editionOptional" }                               // editionId nullable (ör. Task) — null satırlar da görünür
  | { mode: "chain"; path: string[] }                         // edition'a uzanan ilişki zinciri
  | { mode: "chainOptional"; path: string[] }                 // ilk halka nullable (ör. ScanEvent.participation)
  | { mode: "chainTenant"; path: string[] }                   // tenant'a uzanan zincir (Organization vb.)
  | { mode: "scalarChain"; fk: string; via: "participation" } // scalar FK — Prisma ilişkisi yok (G0-e: iki adımlı bak)
  | { mode: "activity" }                                      // ActivityLog: tenantId?/editionId? karışık
  | { mode: "self" };                                         // Tenant modeli — yalnız aktif kiracı

// ─── Entity → kapsam haritası (registry anahtarlarıyla birebir) ─────────────────
export const SCOPES: Record<string, Scope> = {
  // doğrudan tenantId kolonu
  people: { mode: "tenant" },
  organizations: { mode: "tenant" },
  "event-series": { mode: "tenant" },
  editions: { mode: "tenant" },
  "mail-providers": { mode: "tenant" },
  "api-integrations": { mode: "tenant" },
  tenants: { mode: "self" },

  // doğrudan editionId kolonu
  capabilities: { mode: "edition" },
  "org-assignments": { mode: "edition" },
  participations: { mode: "edition" },
  "registration-categories": { mode: "edition" },
  registrations: { mode: "edition" },
  invitations: { mode: "edition" },
  forms: { mode: "edition" },
  "form-submissions": { mode: "edition" },
  expenses: { mode: "edition" },
  incomes: { mode: "edition" },
  "catalog-items": { mode: "edition" },
  entitlements: { mode: "edition" },
  orders: { mode: "edition" },
  "sponsor-tiers": { mode: "edition" },
  "sponsor-packages": { mode: "edition" },
  "sponsor-agreements": { mode: "edition" },
  hotels: { mode: "edition" },
  reservations: { mode: "edition" },
  "scientific-setup": { mode: "edition" },
  tracks: { mode: "edition" },
  submissions: { mode: "edition" },
  rooms: { mode: "edition" },
  sessions: { mode: "edition" },
  "badge-profiles": { mode: "edition" },
  "certificate-definitions": { mode: "edition" },
  "booth-units": { mode: "edition" },
  campaigns: { mode: "edition" },
  delegations: { mode: "edition" },
  "custom-roles": { mode: "edition" },
  "session-materials": { mode: "edition" },
  "media-folders": { mode: "edition" },
  "media-assets": { mode: "edition" },
  "email-templates": { mode: "edition" },
  "badge-designs": { mode: "edition" },
  "social-plans": { mode: "edition" },
  "b2b-plans": { mode: "edition" },
  "cv-entries": { mode: "edition" },

  // editionId nullable
  tasks: { mode: "editionOptional" },

  // edition'a uzanan zincirler
  snapshots: { mode: "chain", path: ["participation", "edition"] },
  "form-fields": { mode: "chain", path: ["form", "edition"] },
  "form-answers": { mode: "chain", path: ["field", "form", "edition"] },
  "role-assignments": { mode: "chain", path: ["participation", "edition"] },
  claims: { mode: "chain", path: ["entitlement", "edition"] },
  "order-lines": { mode: "chain", path: ["order", "edition"] },
  payments: { mode: "chain", path: ["order", "edition"] },
  refunds: { mode: "chain", path: ["order", "edition"] },
  "room-types": { mode: "chain", path: ["hotel", "edition"] },
  "room-blocks": { mode: "chain", path: ["hotel", "edition"] },
  "inventory-nights": { mode: "chain", path: ["block", "hotel", "edition"] },
  "occupancy-slots": { mode: "chain", path: ["reservation", "edition"] },
  authorships: { mode: "chain", path: ["submission", "edition"] },
  "review-assignments": { mode: "chain", path: ["submission", "edition"] },
  reviews: { mode: "chain", path: ["assignment", "submission", "edition"] },
  decisions: { mode: "chain", path: ["submission", "edition"] },
  "program-assignments": { mode: "chain", path: ["session", "edition"] },
  "badge-instances": { mode: "chain", path: ["participation", "edition"] },
  credentials: { mode: "chain", path: ["participation", "edition"] },
  "certificate-issues": { mode: "chain", path: ["definition", "edition"] },
  "booth-allocations": { mode: "chain", path: ["boothUnit", "edition"] },
  "delegation-members": { mode: "chain", path: ["delegation", "edition"] },
  companions: { mode: "chain", path: ["participation", "edition"] },
  "social-announcements": { mode: "chain", path: ["plan", "edition"] },
  "b2b-assignments": { mode: "chain", path: ["plan", "edition"] },
  deliverables: { mode: "chain", path: ["agreement", "edition"] }, // Deliverable→SponsorAgreement→edition.tenantId

  // ilk halka nullable olabilen zincirler
  "scan-events": { mode: "chainOptional", path: ["participation", "edition"] },
  "floor-objects": { mode: "chainOptional", path: ["boothUnit", "edition"] },

  // tenant'a uzanan zincirler
  "organization-contacts": { mode: "chainTenant", path: ["organization"] },
  "integration-logs": { mode: "chainTenant", path: ["integration"] },

  // özel
  activity: { mode: "activity" },

  // G0-e: scalar FK — RoommateRequest'te Prisma ilişkisi YOK (şema değişikliği yasak);
  // iki adımlı zincir: requesterParticipationId → EventParticipation → edition.tenantId
  "roommate-requests": { mode: "scalarChain", fk: "requesterParticipationId", via: "participation" },
};

// ─── Bağlam çözümleme (TODO-auth: oturum gelince tek nokta) ─────────────────────
export async function resolveContext(explicitTenantId?: string | null): Promise<string> {
  const tenant = await db.tenant.findFirst({ select: { id: true } });
  if (!tenant) {
    throw new GuardError("Kiracı bağlamı çözümlenemedi — önce demo verisini yükleyin", 400);
  }
  if (explicitTenantId && explicitTenantId !== tenant.id) {
    // istenen kiracı yok ya da bu çalışma alanına ait değil — varlığını ifşa etme
    throw new GuardError("Kayıt bulunamadı", 404);
  }
  return tenant.id;
}

// ─── G0-b: Aggregate rota bağlamı ────────────────────────────────────────────────
// Aggregate uçlar (dashboard, accounting, reconciliation, cme, waitlist, media/export,
// baskı uçları, form-stats, floor-studio, notifications, program/import) bağlamı
// ÇÖZMEK ZORUNDA: editionId verilmişse edisyon kiracı bağlamıyla doğrulanır (yoksa 404),
// verilmemişse sunucu bağlamı kullanılır (required ise 400). "Bogus editionId → 200-empty" kapanır.
export async function resolveEditionContext(
  editionId: string | null | undefined,
  opts: { required?: boolean } = {},
): Promise<{ tenantId: string; editionId: string | null }> {
  const ctx = await resolveContext(null);
  const id = (editionId ?? "").trim();
  if (id === "") {
    if (opts.required) throw new GuardError("editionId zorunlu — bağlam çözümlenemedi", 400);
    return { tenantId: ctx, editionId: null };
  }
  const ed = await db.eventEdition.findUnique({ where: { id }, select: { id: true, tenantId: true } });
  if (!ed || ed.tenantId !== ctx) throw new GuardError("Etkinlik bulunamadı", 404);
  return { tenantId: ctx, editionId: ed.id };
}

// G0-d: editionId'nin kiracı bağlamına ait olduğunu doğrula (parent tenant kontrolü);
// uyuşmazsa 404 — flows aksiyonlarında her id girişinin ebeveyn zinciri buradan geçer.
export async function verifyEditionTenant(editionId: string | null | undefined): Promise<string> {
  const { tenantId, editionId: ed } = await resolveEditionContext(editionId, { required: true });
  void ed;
  return tenantId;
}

// nested where parçası: ["order","edition"] → { order: { edition: { tenantId: X } } }
function nestedTenantFilter(path: string[], tenantId: string): Record<string, unknown> {
  let frag: Record<string, unknown> = { tenantId };
  for (let i = path.length - 1; i >= 0; i--) frag = { [path[i]]: frag };
  return frag;
}

function mergeFrag(where: Record<string, unknown>, key: string, frag: Record<string, unknown>) {
  const cur = where[key];
  where[key] = cur && typeof cur === "object" ? { ...(cur as object), ...frag } : frag;
}

// ─── GET (liste) koruması — where'i yerinde değiştirir ──────────────────────────
export async function applyListGuard(
  entity: string,
  where: Record<string, unknown>,
  sp: { get: (k: string) => string | null }
): Promise<void> {
  const scope = SCOPES[entity];
  // DÜZELTME (tenant izolasyonu): kapsam haritası dışı varlık FAIL-CLOSED — eski davranış
  // (return ile sessiz geçiş) registry'de kapsam tanımlanmamış uçların tenant korumasını
  // bypass etmesine izin veriyordu (ör. deliverables). Kayıt-BULUNAMADI statüsü döner,
  // hiçbir satır döndürülmez; SCOPES'a eklenerek bilinçli açılır.
  if (!scope) throw new GuardError("Varlık kapsam haritasında tanımsız — erişim reddedildi", 500);

  const paramTenantId = sp.get("tenantId");

  switch (scope.mode) {
    case "tenant": {
      // strict: tenant-kapsamlı listede bağlam parametresi zorunlu (tenantId'siz /api/people → 400)
      if (!paramTenantId || paramTenantId.trim() === "") {
        throw new GuardError("tenantId zorunlu — kiracı kapsamı olmadan listeleme yapılamaz", 400);
      }
      const ctx = await resolveContext(paramTenantId);
      where.tenantId = ctx;
      return;
    }
    case "self": {
      const ctx = await resolveContext(paramTenantId);
      delete where.tenantId;
      where.id = ctx; // yalnız aktif kiracı listelenir
      return;
    }
    case "edition": {
      const ctx = await resolveContext(paramTenantId);
      delete where.tenantId;
      const editionId = sp.get("editionId");
      if (editionId) {
        const ed = await db.eventEdition.findUnique({ where: { id: editionId }, select: { tenantId: true } });
        if (!ed || ed.tenantId !== ctx) throw new GuardError("Etkinlik bulunamadı", 404);
        where.editionId = editionId;
      }
      where.edition = { tenantId: ctx }; // savunma derinliği: edisyon fark etmeksizin kiracı izolasyonu
      return;
    }
    case "editionOptional": {
      const ctx = await resolveContext(paramTenantId);
      delete where.tenantId;
      const editionId = sp.get("editionId");
      if (editionId) {
        const ed = await db.eventEdition.findUnique({ where: { id: editionId }, select: { tenantId: true } });
        if (!ed || ed.tenantId !== ctx) throw new GuardError("Etkinlik bulunamadı", 404);
        where.editionId = editionId;
        where.edition = { tenantId: ctx };
      } else {
        where.OR = [{ edition: { tenantId: ctx } }, { editionId: null }];
      }
      return;
    }
    case "chain": {
      const ctx = await resolveContext(paramTenantId);
      delete where.tenantId;
      mergeFrag(where, scope.path[0], nestedTenantFilter(scope.path.slice(1), ctx));
      return;
    }
    case "chainOptional": {
      const ctx = await resolveContext(paramTenantId);
      delete where.tenantId;
      const fk = `${scope.path[0]}Id`;
      where.OR = [{ [scope.path[0]]: nestedTenantFilter(scope.path.slice(1), ctx) }, { [fk]: null }];
      return;
    }
    case "chainTenant": {
      const ctx = await resolveContext(paramTenantId);
      delete where.tenantId;
      mergeFrag(where, scope.path[0], { tenantId: ctx });
      return;
    }
    case "scalarChain": {
      // G0-e iki adımlı zincir: Prisma ilişkisi olmadığından önce bağlam kiracısının
      // katılımları toplanır, scalar FK liste where'i bu id kümesiyle sınırlandırılır.
      // strict: tenant-kapsamlı listede bağlam parametresi zorunlu (tenantId'siz → 400)
      if (!paramTenantId || paramTenantId.trim() === "") {
        throw new GuardError("tenantId zorunlu — kiracı kapsamı olmadan listeleme yapılamaz", 400);
      }
      const ctx = await resolveContext(paramTenantId);
      delete where.tenantId;
      delete where[scope.fk]; // FK filtresi bağlam kümesiyle değiştirilir ( forge edilemez)
      const parts = await db.eventParticipation.findMany({
        where: { edition: { tenantId: ctx } },
        select: { id: true },
      });
      where[scope.fk] = { in: parts.map((p) => p.id) };
      return;
    }
    case "activity": {
      const ctx = await resolveContext(paramTenantId);
      delete where.tenantId;
      where.OR = [{ tenantId: ctx }, { edition: { tenantId: ctx } }, { AND: [{ tenantId: null }, { editionId: null }] }];
      return;
    }
  }
}

// nested select parçası: ["order","edition"] → { select: { order: { select: { edition: { select: { tenantId: true } } } } } }
// (dış select sarmalayıcı zorunlu — aksi halde Prisma "Unknown argument" hatası; G0 matrisi yakaladı)
function nestedTenantSelect(path: string[]): Record<string, unknown> {
  let sel: Record<string, unknown> = { tenantId: true };
  for (let i = path.length - 1; i >= 0; i--) sel = { [path[i]]: { select: sel } };
  return { select: sel } as Record<string, unknown>;
}

// [id] rotası için tek kaydın kiracı select'i (yok = kayıt kiracı-bağsız, izinli)
export function tenantSelectFor(entity: string): Record<string, unknown> | null {
  const scope = SCOPES[entity];
  if (!scope) return null;
  switch (scope.mode) {
    case "tenant": return { select: { tenantId: true } };
    case "self": return { select: { id: true } };
    case "edition": return { select: { edition: { select: { tenantId: true } } } };
    case "editionOptional": return { select: { editionId: true, edition: { select: { tenantId: true } } } };
    case "chain": return nestedTenantSelect(scope.path) as Record<string, unknown>;
    case "chainOptional": return nestedTenantSelect(scope.path) as Record<string, unknown>;
    case "chainTenant": return nestedTenantSelect(scope.path) as Record<string, unknown>;
    case "scalarChain": return null; // ilişki yok — ensureInScope iki adımlı yolu kullanır
    case "activity": return null;
  }
}

// select'lenmiş kayıttan kiracı id'sini oku (null/undefined = bağsız, izinli)
export function tenantIdOf(entity: string, record: unknown): string | null {
  const scope = SCOPES[entity];
  if (!scope || record === null || typeof record !== "object") return null;
  const rec = record as Record<string, unknown>;
  const read = (path: string[]): unknown => path.reduce<unknown>((acc, k) => (acc && typeof acc === "object" ? (acc as Record<string, unknown>)[k] : undefined), rec);
  switch (scope.mode) {
    case "tenant": return (rec.tenantId as string) ?? null;
    case "self": return (rec.id as string) ?? null;
    case "edition": return (read(["edition", "tenantId"]) as string) ?? null;
    case "editionOptional": return rec.editionId ? (read(["edition", "tenantId"]) as string) ?? null : null;
    case "chain":
    case "chainOptional":
    case "chainTenant": return (read([...scope.path, "tenantId"]) as string) ?? null;
    case "scalarChain": return null; // ilişki yok — ensureInScope iki adımlı yolu kullanır
    case "activity": return null;
  }
}

// ─── G0-a: Tek kayıt kapsam kontrolü (generic [entity]/[id] deseni) ─────────────
// Özel rotalar da AYNI kontrolü kullanmak zorunda: people/[id], organizations/[id],
// form-submissions/[id], payments/[id]/process, vcard uçları… Kapsam dışı/başka
// kiracı kaydı → 404 (IDOR kapanır). scalarChain modunda iki adımlı bakış yapılır.
export async function ensureInScope(
  entity: string,
  id: string,
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const scope = SCOPES[entity];
  // DÜZELTME: kapsam dışı varlık FAIL-CLOSED (eski: ok:true — kayıt-bazlı IDOR bypass açığı)
  if (!scope) return { ok: false, status: 500, error: "Varlık kapsam haritasında tanımsız" };

  // G0-e: scalar FK zinciri — iki adım: kaydın FK değeri → participation → edition.tenantId
  if (scope?.mode === "scalarChain") {
    const delegate = (db as unknown as Record<string, { findUnique: (a: Record<string, unknown>) => Promise<unknown> }>)[
      entity === "roommate-requests" ? "roommateRequest" : entity.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase())
    ];
    if (!delegate) return { ok: false, status: 500, error: "Kapsam çözümlenemedi" };
    const rec = await delegate.findUnique({ where: { id }, select: { [scope.fk]: true } }) as Record<string, unknown> | null;
    if (!rec || typeof rec[scope.fk] !== "string") return { ok: false, status: 404, error: "Kayıt bulunamadı" };
    const part = await db.eventParticipation.findUnique({
      where: { id: rec[scope.fk] as string },
      select: { edition: { select: { tenantId: true } } },
    });
    if (!part) return { ok: false, status: 404, error: "Kayıt bulunamadı" };
    const ctx = await resolveContext(null);
    if (part.edition.tenantId !== ctx) return { ok: false, status: 404, error: "Kayıt bulunamadı" };
    return { ok: true };
  }

  const configSelect = tenantSelectFor(entity);
  if (!scope || !configSelect) return { ok: true }; // kapsam haritası dışı — kurallı varlıklar haritalıdır
  if (entity === "tenants") {
    const ctx = await resolveContext(null);
    if (id !== ctx) return { ok: false, status: 404, error: "Kayıt bulunamadı" };
    return { ok: true };
  }
  const { registry } = await import("./registry");
  const config = registry[entity];
  if (!config) return { ok: true };
  const record = await config.delegate.findFirst({ where: { id }, ...(configSelect as Record<string, unknown>) });
  if (!record) return { ok: false, status: 404, error: "Kayıt bulunamadı" };
  const owner = tenantIdOf(entity, record);
  if (owner) {
    const ctx = await resolveContext(null);
    if (owner !== ctx) return { ok: false, status: 404, error: "Kayıt bulunamadı" };
  }
  return { ok: true };
}

// ─── POST/PUT veri koruması — tenantId body'den ALINMAZ, sunucu bağlamından yazılır ──
export async function applyWriteGuard(
  entity: string,
  data: Record<string, unknown>,
  opts: { isUpdate?: boolean } = {}
): Promise<Record<string, unknown>> {
  const scope = SCOPES[entity];
  if (!scope) throw new GuardError("Varlık kapsam haritasında tanımsız — yazım reddedildi", 500); // FAIL-CLOSED (bkz. applyListGuard)

  switch (scope.mode) {
    case "tenant": {
      const ctx = await resolveContext(typeof data.tenantId === "string" ? data.tenantId : null);
      if (opts.isUpdate) delete data.tenantId; // kiracı değiştirilemez
      else data.tenantId = ctx;                // POST: bağlamdan yazılır (body değer yok sayılır)
      return data;
    }
    case "self": {
      throw new GuardError("Kiracı kayıtları bu uçtan oluşturulamaz", 400);
    }
    case "edition":
    case "editionOptional": {
      delete data.tenantId;
      const editionId = typeof data.editionId === "string" ? data.editionId : null;
      if (editionId) {
        const ctx = await resolveContext(null);
        const ed = await db.eventEdition.findUnique({ where: { id: editionId }, select: { tenantId: true } });
        if (!ed || ed.tenantId !== ctx) throw new GuardError("Etkinlik bulunamadı", 404);
      }
      return data;
    }
    case "chain":
    case "chainOptional": {
      delete data.tenantId;
      const fk = `${scope.path[0]}Id`;
      const fkValue = typeof data[fk] === "string" ? (data[fk] as string) : null;
      if (fkValue) {
        const ctx = await resolveContext(null);
        // varlığın kendi delegate'i üzerinden zincir filtresiyle parent doğrulaması
        // DÜZELTME: filtre ÇOCUK tablosuna göre kurulur — tenant zinciri ÇOCUĞUN İLİŞKİ
        // YOLUNUN TAMAMIYLA (path[0]→…→tenant) izlenir; eski slice(1) hatalı olarak
        // path[0] ilişkisini atlıyordu ve TÜM chain-yazımlarını (form-fields, refunds,
        // deliverables…) Prisma "Unknown argument" hatasıyla kırıyordu (gizli 400).
        const { registry } = await import("./registry");
        const config = registry[entity];
        const hit = await config.delegate.findFirst({
          where: { [fk]: fkValue, ...(nestedTenantFilter(scope.path, ctx) as Record<string, unknown>) },
          select: { id: true },
        });
        if (!hit) throw new GuardError("İlişkili kayıt bulunamadı veya bu çalışma alanına ait değil", 404);
      }
      return data;
    }
    case "chainTenant": {
      delete data.tenantId;
      const fk = `${scope.path[0]}Id`;
      const fkValue = typeof data[fk] === "string" ? (data[fk] as string) : null;
      if (fkValue) {
        const ctx = await resolveContext(null);
        const { registry } = await import("./registry");
        const config = registry[entity];
        const hit = await config.delegate.findFirst({
          where: { id: fkValue, tenantId: ctx },
          select: { id: true },
        });
        if (!hit) throw new GuardError("İlişkili kayıt bulunamadı veya bu çalışma alanına ait değil", 404);
      }
      return data;
    }
    case "scalarChain": {
      // G0-e: FK bağlam kiracısının katılımına ait olmalı (iki adımlı doğrulama)
      delete data.tenantId;
      const fkValue = typeof data[scope.fk] === "string" ? (data[scope.fk] as string) : null;
      if (fkValue) {
        const ctx = await resolveContext(null);
        const part = await db.eventParticipation.findFirst({
          where: { id: fkValue, edition: { tenantId: ctx } },
          select: { id: true },
        });
        if (!part) throw new GuardError("İlişkili katılım bulunamadı veya bu çalışma alanına ait değil", 404);
      }
      return data;
    }
    case "activity": {
      return data;
    }
  }
}
