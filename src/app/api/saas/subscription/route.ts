// ─── TASK-B 22: Abonelik + manuel fatura — kuruş disiplini (F6 minor unit) ──────
// GET   : kiracı aboneliği + fatura özeti {count, paidMinor, openMinor} (aggregate — fetch-all yok)
// PUT   : { plan, status?, priceMonthlyMinor?, periodEnd? } — enum/int doğrulama + ActivityLog
// POST  : fatura aksiyonu { action: "ISSUE"|"MARK_PAID"|"VOID", number, amountMinor?, dueAt? }
//         number @unique → çift 409; amountMinor TAM SAYI kuruş; MARK_PAID paidAt yazar.
// İLK AŞAMA MANUEL — ödeme geçidi YOK (aşama planı: manuel → gateway; bkz. .memory/agents/saas-billing.md).
// Tüm para alanları MINOR UNIT (kuruş, Int) — Float ASLA (bkz. src/lib/money.ts).
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { resolveContext, GuardError } from "@/lib/api/tenant-guard";
import { SAAS_PLANS } from "@/lib/api/provision-core";
import { fmtMoney } from "@/lib/money";

const SUB_STATUSES = ["TRIAL", "ACTIVE", "PAST_DUE", "CANCELED"] as const;
type SubStatus = (typeof SUB_STATUSES)[number];

const INVOICE_STATUSES_OPEN = ["DRAFT", "ISSUED"] as const; // açık (ödenmemiş, iptal edilmemiş)

async function loadSubscription(tenantId: string) {
  return db.tenantSubscription.findUnique({
    where: { tenantId },
    select: {
      id: true, plan: true, status: true, priceMonthlyMinor: true, currency: true,
      periodStart: true, periodEnd: true, trialQuotaBytes: true, notes: true, updatedAt: true,
    },
  });
}

export async function GET() {
  try {
    const tenantId = await resolveContext(null);
    const subscription = await loadSubscription(tenantId);
    const invWhere = { subscription: { tenantId } };
    const [count, paid, open] = await Promise.all([
      db.tenantInvoice.count({ where: invWhere }),
      db.tenantInvoice.aggregate({ _sum: { amountMinor: true }, where: { ...invWhere, status: "PAID" } }),
      db.tenantInvoice.aggregate({ _sum: { amountMinor: true }, where: { ...invWhere, status: { in: [...INVOICE_STATUSES_OPEN] } } }),
    ]);
    return NextResponse.json({
      subscription,
      invoices: {
        count,
        paidMinor: paid._sum.amountMinor ?? 0,   // kuruş — PAID toplamı
        openMinor: open._sum.amountMinor ?? 0,   // kuruş — DRAFT+ISSUED toplamı
      },
    });
  } catch (err) {
    if (err instanceof GuardError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: "Abonelik okunamadı" }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const tenantId = await resolveContext(null);
    let body: Record<string, unknown>;
    try {
      body = (await req.json()) as Record<string, unknown>;
    } catch {
      return NextResponse.json({ error: "Geçersiz JSON gövdesi" }, { status: 400 });
    }

    const plan = body.plan;
    if (typeof plan !== "string" || !SAAS_PLANS.includes(plan as (typeof SAAS_PLANS)[number])) {
      return NextResponse.json({ error: "Geçersiz plan" }, { status: 400 });
    }
    let status: SubStatus | undefined;
    if (body.status !== undefined) {
      if (typeof body.status !== "string" || !SUB_STATUSES.includes(body.status as SubStatus)) {
        return NextResponse.json({ error: "Geçersiz abonelik durumu" }, { status: 400 });
      }
      status = body.status as SubStatus;
    }
    let priceMonthlyMinor: number | undefined;
    if (body.priceMonthlyMinor !== undefined) {
      const v = body.priceMonthlyMinor;
      if (typeof v !== "number" || !Number.isInteger(v) || v < 0) {
        return NextResponse.json({ error: "priceMonthlyMinor — negatif olmayan TAM SAYI kuruş zorunlu" }, { status: 400 });
      }
      priceMonthlyMinor = v;
    }
    let periodEnd: Date | null | undefined;
    if (body.periodEnd !== undefined) {
      if (body.periodEnd === null) periodEnd = null;
      else if (typeof body.periodEnd === "string") {
        const d = new Date(body.periodEnd);
        if (Number.isNaN(d.getTime())) return NextResponse.json({ error: "periodEnd geçersiz tarih" }, { status: 400 });
        periodEnd = d;
      } else return NextResponse.json({ error: "periodEnd geçersiz" }, { status: 400 });
    }

    const current = await loadSubscription(tenantId);
    const data = {
      plan,
      ...(status !== undefined ? { status } : {}),
      ...(priceMonthlyMinor !== undefined ? { priceMonthlyMinor } : {}),
      ...(periodEnd !== undefined ? { periodEnd } : {}),
    };
    const subscription = current
      ? await db.tenantSubscription.update({ where: { tenantId }, data })
      : await db.tenantSubscription.create({ data: { tenantId, ...data } });

    await db.activityLog.create({
      data: {
        tenantId,
        type: "SUBSCRIPTION_UPDATED",
        message: `Abonelik güncellendi: ${subscription.plan} — ${subscription.status}${priceMonthlyMinor !== undefined ? ` — ${fmtMoney(subscription.priceMonthlyMinor, subscription.currency)}/ay` : ""}`,
        entityType: "TenantSubscription",
        entityId: subscription.id,
        actorName: "SaaS Operasyon",
      },
    }).catch(() => undefined);

    return NextResponse.json({ subscription });
  } catch (err) {
    if (err instanceof GuardError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: "Abonelik güncellenemedi" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const tenantId = await resolveContext(null);
    let body: Record<string, unknown>;
    try {
      body = (await req.json()) as Record<string, unknown>;
    } catch {
      return NextResponse.json({ error: "Geçersiz JSON gövdesi" }, { status: 400 });
    }

    const action = body.action;
    const number = typeof body.number === "string" ? body.number.trim() : "";
    if (typeof action !== "string" || !["ISSUE", "MARK_PAID", "VOID"].includes(action)) {
      return NextResponse.json({ error: "Geçersiz aksiyon" }, { status: 400 });
    }
    if (!number) return NextResponse.json({ error: "Fatura numarası zorunlu" }, { status: 400 });

    const sub = await db.tenantSubscription.findUnique({ where: { tenantId } });
    if (!sub) return NextResponse.json({ error: "Abonelik bulunamadı — önce abonelik oluşturun" }, { status: 400 });

    if (action === "ISSUE") {
      const amountMinor = body.amountMinor;
      if (typeof amountMinor !== "number" || !Number.isInteger(amountMinor) || amountMinor < 0) {
        return NextResponse.json({ error: "amountMinor — negatif olmayan TAM SAYI kuruş zorunlu" }, { status: 400 });
      }
      let dueAt: Date | null = null;
      if (body.dueAt !== undefined && body.dueAt !== null) {
        if (typeof body.dueAt !== "string") return NextResponse.json({ error: "dueAt geçersiz" }, { status: 400 });
        const d = new Date(body.dueAt);
        if (Number.isNaN(d.getTime())) return NextResponse.json({ error: "dueAt geçersiz tarih" }, { status: 400 });
        dueAt = d;
      }
      // number GLOBAL @unique — önce kibar kontrol (409), yarış durumunda P2002 de 409'a çevrilir
      const dup = await db.tenantInvoice.findUnique({ where: { number }, select: { id: true } });
      if (dup) return NextResponse.json({ error: "Bu fatura numarası zaten kayıtlı" }, { status: 409 });
      try {
        const invoice = await db.tenantInvoice.create({
          data: { subscriptionId: sub.id, number, amountMinor, currency: sub.currency, status: "ISSUED", issuedAt: new Date(), dueAt },
          select: { id: true, number: true, amountMinor: true, currency: true, status: true, issuedAt: true, dueAt: true },
        });
        await db.activityLog.create({
          data: { tenantId, type: "INVOICE_ISSUED", message: `Fatura kesildi: ${number} — ${fmtMoney(amountMinor, sub.currency)}`, entityType: "TenantInvoice", entityId: invoice.id, actorName: "SaaS Fatura" },
        }).catch(() => undefined);
        return NextResponse.json({ invoice }, { status: 201 });
      } catch (e) {
        if (typeof e === "object" && e !== null && (e as { code?: string }).code === "P2002") {
          return NextResponse.json({ error: "Bu fatura numarası zaten kayıtlı" }, { status: 409 });
        }
        throw e;
      }
    }

    // MARK_PAID / VOID — numaradan bul, kiracı zincirinden doğrula (IDOR: başka kiracı faturası 404)
    const invoice = await db.tenantInvoice.findFirst({
      where: { number, subscription: { tenantId } },
      select: { id: true, number: true, amountMinor: true, currency: true, status: true, issuedAt: true, paidAt: true, dueAt: true },
    });
    if (!invoice) return NextResponse.json({ error: "Fatura bulunamadı" }, { status: 404 });

    if (action === "MARK_PAID") {
      const updated = await db.tenantInvoice.update({
        where: { id: invoice.id },
        data: { status: "PAID", paidAt: new Date() },
        select: { id: true, number: true, amountMinor: true, currency: true, status: true, issuedAt: true, paidAt: true, dueAt: true },
      });
      await db.activityLog.create({
        data: { tenantId, type: "INVOICE_PAID", message: `Fatura ödendi: ${number} — ${fmtMoney(updated.amountMinor, updated.currency)}`, entityType: "TenantInvoice", entityId: updated.id, actorName: "SaaS Fatura" },
      }).catch(() => undefined);
      return NextResponse.json({ invoice: updated });
    }

    // VOID
    const updated = await db.tenantInvoice.update({
      where: { id: invoice.id },
      data: { status: "VOID" },
      select: { id: true, number: true, amountMinor: true, currency: true, status: true, issuedAt: true, paidAt: true, dueAt: true },
    });
    await db.activityLog.create({
      data: { tenantId, type: "INVOICE_VOID", message: `Fatura iptal edildi: ${number} — ${fmtMoney(updated.amountMinor, updated.currency)}`, entityType: "TenantInvoice", entityId: updated.id, actorName: "SaaS Fatura" },
    }).catch(() => undefined);
    return NextResponse.json({ invoice: updated });
  } catch (err) {
    if (err instanceof GuardError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: "Fatura işlemi başarısız" }, { status: 500 });
  }
}
