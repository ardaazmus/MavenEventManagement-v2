// Generic item route: /api/[entity]/[id]
// Faz A + G0-a: tek kayıt işlemleri kiracı kapsamına alınır — başka kiracının kaydına
// id ile erişim 404 döner (IDOR koruması). ensureInScope artık tenant-guard'ta ortak:
// özel rotalar (people/[id], form-submissions/[id], payments/[id]/process…) aynı fonksiyonu kullanır.
import { NextRequest, NextResponse } from "next/server";
import { actionForMethod, authorizeDualRead } from "@/lib/api/permissions";
import { decideSponsorStatusChange, type TransitionPrisma } from "@/lib/sponsorship/enforcement";
import { transitionSponsorAgreement, type CapacityPrisma } from "@/lib/sponsorship/capacity";
import { decideDeliverableChange, type DeliverablePrisma } from "@/lib/sponsorship/deliverables";
import { getActorMaxRank, type AssignmentPrisma } from "@/lib/users/assignments";
import { registry, sanitizeForUpdate } from "@/lib/api/registry";
import { resolveContext, tenantIdOf, tenantSelectFor } from "@/lib/api/tenant-guard";
import { AUTH_ENABLED } from "@/lib/auth-flag";
import { requestActor } from "@/lib/auth/request-context";

// P4 (yeni-fazlar 15): audit sahipliği + aktör — POST rotasıyla birebir aynı sözleşme
async function auditOwnership(entity: string, row: Record<string, unknown>): Promise<{ tenantId: string; editionId: string | null; actorName: string }> {
  const ctx = await resolveContext(null);
  let editionId: string | null = typeof row.editionId === "string" ? row.editionId : null;
  if (!editionId) {
    try {
      const sel = tenantSelectFor(entity);
      if (sel) {
        const config = registry[entity];
        const fresh = row.id ? await config.delegate.findFirst({ where: { id: row.id as string }, ...(sel as Record<string, unknown>) }) : null;
        if (fresh && tenantIdOf(entity, fresh)) {
          const rec = fresh as Record<string, unknown>;
          editionId = (rec.editionId as string) ?? (rec as { edition?: { id?: string } })?.edition?.id ?? null;
        }
      }
    } catch {
      editionId = null;
    }
  }
  const actor = await requestActor();
  let actorName = "Yönetici";
  if (actor) {
    const u = await db.user.findUnique({ where: { id: actor.uid }, select: { name: true } });
    actorName = u?.name ?? actor.role;
  }
  return { tenantId: ctx, editionId, actorName };
}
import { applyWriteGuard, ensureInScope, GuardError } from "@/lib/api/tenant-guard";
import { issuePortalToken } from "@/lib/api/portal-tokens";
import { publishOutbox, type OutboxClient } from "@/lib/integrations/outbox";
import { db } from "@/lib/db";

type Ctx = { params: Promise<{ entity: string; id: string }> };

function notFound(msg = "Bilinmeyen varlık") {
  return NextResponse.json({ error: msg }, { status: 404 });
}

export async function GET(_req: NextRequest, ctx: Ctx) {
  const { entity, id } = await ctx.params;
  const config = registry[entity];
  if (!config) return notFound();

  // ── P04.3 / P05.3: Generic item route koruması (GET -> VIEW, Dual-Read) ──
  const actor = await requestActor();
  if (AUTH_ENABLED && !actor) {
    return NextResponse.json({ error: "Oturum gerekli" }, { status: 401 });
  }
  const authResult = await authorizeDualRead({
    actor,
    entity,
    action: actionForMethod("GET"),
    prisma: db,
  });
  if (!authResult.authorized) {
    return NextResponse.json({ error: "Bu işlem için yetkiniz yok" }, { status: 403 });
  }

  try {
    const scoped = await ensureInScope(entity, id);
    if (!scoped.ok) return NextResponse.json({ error: scoped.error }, { status: scoped.status });
    const item = await config.delegate.findUnique({ where: { id }, include: config.include });
    if (!item) return notFound("Kayıt bulunamadı");
    // S3: sır içeren yanıt maskelenir
    const safeItem = config.readMask ? config.readMask(item as Record<string, unknown>) : item;
    return NextResponse.json(safeItem);
  } catch (e) {
    if (e instanceof GuardError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error(`GET /api/${entity}/${id}`, e);
    return NextResponse.json({ error: "Kayıt alınamadı" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, ctx: Ctx) {
  const { entity, id } = await ctx.params;
  const config = registry[entity];
  if (!config) return notFound();

  // ── P04.3 / P05.3: Generic item route koruması (PUT -> UPDATE, Dual-Read) ──
  const actor = await requestActor();
  if (AUTH_ENABLED && !actor) {
    return NextResponse.json({ error: "Oturum gerekli" }, { status: 401 });
  }
  const authResult = await authorizeDualRead({
    actor,
    entity,
    action: actionForMethod("PUT"),
    prisma: db,
  });
  if (!authResult.authorized) {
    return NextResponse.json({ error: "Bu işlem için yetkiniz yok" }, { status: 403 });
  }

  try {
    const scoped = await ensureInScope(entity, id);
    if (!scoped.ok) return NextResponse.json({ error: scoped.error }, { status: scoped.status });

    const body = await req.json();
    // P2 (yeni-fazlar 8): durum-makinesi alanları generic PUT'tan düşürülür
    const upd = sanitizeForUpdate(entity, body);
    let data = upd.data;
    data = await applyWriteGuard(entity, data, { isUpdate: true });
    if (config.writeTransform) data = await config.writeTransform(data, true); // S3: sır şifreleme
    // DÜZELTME (server-side validation): güncellemede de varlık sözleşmesi zorlanır
    if (config.validate) {
      const vErr = config.validate(data, true);
      if (vErr) return NextResponse.json({ error: vErr }, { status: 400 });
    }
    // P08.2: sponsor durum geçişi — generic PUT bypass'ı kapalı (update öncesi karar).
    let transitionAudit: { from: string; to: string; kind: string; reason: string | null } | null = null;
    let sponsorActorRank = 100;
    if (entity === "sponsor-agreements" && ("status" in data || "transitionReason" in data)) {
      sponsorActorRank = actor
        ? await getActorMaxRank(db as unknown as AssignmentPrisma, {
            userId: actor.uid,
            tenantId: actor.tenantId,
            legacyRole: actor.role,
            scopeKey: "TENANT",
          })
        : 100; // auth-off demo geçişi
      // DÜZELTME (çift-karar gerekçe kaybı): decide gerekçeyi soyar; kapasite
      // geçişi (aşağıda) gerekçeyi YENİDEN okur — taşınmazsa iptal/geri-dönüş
      // ASLA çalışamaz. Gerekçe yalnız transitionAudit yolunda taşınır
      // (kapasite Prisma'ya yazmadan siler; generic update'e sızmaz).
      const sponsorReason = typeof data.transitionReason === "string" ? data.transitionReason : null;
      const decided = await decideSponsorStatusChange(db as unknown as TransitionPrisma, {
        actorMaxRank: sponsorActorRank,
        agreementId: id,
        data,
      });
      if (!decided.ok) return NextResponse.json({ error: decided.error }, { status: decided.status });
      data = decided.data;
      transitionAudit = decided.audit;
      if (transitionAudit && sponsorReason) {
        data = { ...data, transitionReason: sponsorReason };
      }
    }
    // P13.1: teslim durum makinesi + kanıt zorunluluğu (update öncesi karar).
    if (entity === "deliverables" && "status" in data) {
      const deliverableRank = actor
        ? await getActorMaxRank(db as unknown as AssignmentPrisma, {
            userId: actor.uid,
            tenantId: actor.tenantId,
            legacyRole: actor.role,
            scopeKey: "TENANT",
          })
        : 100; // auth-off demo geçişi
      const decided = await decideDeliverableChange(db as unknown as DeliverablePrisma, {
        actorMaxRank: deliverableRank,
        deliverableId: id,
        data,
      });
      if (!decided.ok) return NextResponse.json({ error: decided.error }, { status: decided.status });
    }
    // EŞZAMANLILIK KONTROLÜ: güncelleme öncesi çakışma denetimi (kendisi hariç) — 409
    if (config.beforeWrite) {
      const conflict = await config.beforeWrite(data, true, id);
      if (conflict) return NextResponse.json({ error: conflict }, { status: 409 });
    }
    // TASK-A F1: sponsor sözleşmesi AKTİF'e geçerken (ilk geçiş) portal yetenek
    // belirteci çıkarılır — ham değer bu yanıtta BİR KEZ döner (tek görünlük).
    let beforeStatus: string | null = null;
    if (entity === "sponsor-agreements" && data.status === "ACTIVE") {
      const cur = await config.delegate.findUnique({ where: { id }, select: { status: true, editionId: true, organizationId: true } }) as { status: string; editionId: string; organizationId: string | null } | null;
      beforeStatus = cur?.status ?? null;
    }
    // P10.2: sponsor durum geçişleri transaction içinde uygulanır (atomik kapasite).
    let updated: Record<string, unknown>;
    if (entity === "sponsor-agreements" && transitionAudit) {
      const applied = await transitionSponsorAgreement(db as unknown as CapacityPrisma, {
        actorMaxRank: sponsorActorRank,
        agreementId: id,
        data,
      });
      if (!applied.ok) return NextResponse.json({ error: applied.error }, { status: applied.status });
      transitionAudit = applied.audit;
      updated = await config.delegate.findUnique({ where: { id }, include: config.include }) as Record<string, unknown>;
    } else {
      updated = await config.delegate.update({ where: { id }, data, include: config.include }) as Record<string, unknown>;
    }
    let issuedPortalToken: { token: string; expiresAt: string; scope: string } | null = null;
    if (entity === "sponsor-agreements" && data.status === "ACTIVE" && beforeStatus !== "ACTIVE") {
      const row = updated as unknown as { editionId: string; organizationId: string | null };
      if (row.organizationId) {
        const issued = await issuePortalToken({ scope: "SPONSOR", editionId: row.editionId, organizationId: row.organizationId, agreementId: id, issuedBy: "AGREEMENT_ACTIVATION" });
        issuedPortalToken = { token: issued.token, expiresAt: issued.expiresAt.toISOString(), scope: "SPONSOR" };
      }
    }
    if (config.auditType) {
      await db.activityLog.create({
        data: {
          type: config.auditType,
          message: config.auditMessage?.(data as Record<string, unknown>, "update") ?? "Kayıt güncellendi",
          entityType: entity,
          entityId: id,
          ...await auditOwnership(entity, updated as Record<string, unknown>),
        },
      });
    }
    // P20.1: anlaşma iptalinde o anlaşmanın portal jetonları düşürülür
    // (kurum-geneli jetonlar yaşamaya devam eder — yalnız agreementId eşleşenler).
    // P22.1: iptal outbox'a düşer — noop tekrarında da yayınlanır (anahtar dedupe).
    const cancelledNow =
      entity === "sponsor-agreements" &&
      data.status === "CANCELLED" &&
      (updated as { status?: string }).status === "CANCELLED";
    if (cancelledNow) {
      await db.portalToken.updateMany({
        where: { agreementId: id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      const row = updated as { editionId?: string };
      const edition = row.editionId
        ? await db.eventEdition.findUnique({ where: { id: row.editionId }, select: { tenantId: true } })
        : null;
      await publishOutbox(db as unknown as OutboxClient, {
        tenantId: edition?.tenantId ?? null,
        editionId: row.editionId ?? null,
        aggregateType: "AGREEMENT",
        aggregateId: id,
        eventType: "agreement.cancelled",
        payload: { agreementId: id },
        idempotencyKey: `agreement:${id}:cancelled`,
      });
    }
    // P08.2: geçiş denetim izi — from→to + tür + gerekçe (uyumluluk kaydı).
    if (transitionAudit && config.auditType) {
      await db.activityLog.create({
        data: {
          type: config.auditType,
          message: `Sponsor durumu: ${transitionAudit.from} → ${transitionAudit.to} (${transitionAudit.kind}${transitionAudit.reason ? ` — gerekçe: ${transitionAudit.reason}` : ""})`,
          entityType: entity,
          entityId: id,
          ...await auditOwnership(entity, updated as Record<string, unknown>),
        },
      });
    }
    // S3: sır içeren yanıt maskelenir · TASK-A F1: tek görünlük belirteç eki
    const safeUpdated = config.readMask ? config.readMask(updated as Record<string, unknown>) : updated;
    return NextResponse.json(issuedPortalToken ? { ...(safeUpdated as Record<string, unknown>), issuedPortalToken } : safeUpdated);
  } catch (e) {
    if (e instanceof GuardError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error(`PUT /api/${entity}/${id}`, e);
    return NextResponse.json({ error: "Güncelleme başarısız" }, { status: 400 });
  }
}

export async function DELETE(_req: NextRequest, ctx: Ctx) {
  const { entity, id } = await ctx.params;
  const config = registry[entity];
  if (!config) return notFound();

  // ── P04.3 / P05.3: Generic item route koruması (DELETE -> DELETE, Dual-Read) ──
  const actor = await requestActor();
  if (AUTH_ENABLED && !actor) {
    return NextResponse.json({ error: "Oturum gerekli" }, { status: 401 });
  }
  const authResult = await authorizeDualRead({
    actor,
    entity,
    action: actionForMethod("DELETE"),
    prisma: db,
  });
  if (!authResult.authorized) {
    return NextResponse.json({ error: "Bu işlem için yetkiniz yok" }, { status: 403 });
  }

  try {
    if (entity === "tenants") return NextResponse.json({ error: "Kiracı kaydı silinemez" }, { status: 400 });
    const scoped = await ensureInScope(entity, id);
    if (!scoped.ok) return NextResponse.json({ error: scoped.error }, { status: scoped.status });
    // P4: silmeden önce sahiplik okunur (silinen kaydın tenant'ı audit'e yazılır)
    let ownership: Record<string, unknown> = { id };
    try {
      const sel = tenantSelectFor(entity);
      const pre = sel ? await config.delegate.findFirst({ where: { id }, ...(sel as Record<string, unknown>) }) : null;
      if (pre) ownership = pre as Record<string, unknown>;
    } catch { /* sahiplik çözülemezse audit yine yazılır */ }
    // P10.1: silme-öncesi koruma (kullanımda kayıt 409).
    if (config.beforeDelete) {
      const block = await config.beforeDelete(id);
      if (block) return NextResponse.json({ error: block }, { status: 409 });
    }
    await config.delegate.delete({ where: { id } });
    if (config.auditType) {
      await db.activityLog.create({
        data: {
          type: config.auditType,
          message: config.auditMessage?.({}, "delete") ?? "Kayıt silindi",
          entityType: entity,
          entityId: id,
          ...await auditOwnership(entity, ownership),
        },
      });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof GuardError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error(`DELETE /api/${entity}/${id}`, e);
    return NextResponse.json({ error: "Silme başarısız — bağlantılı kayıtlar olabilir" }, { status: 400 });
  }
}
