// ─── TASK-B 22: Kimlik-sonrası onboarding kontrol listesi (GET) ─────────────────
// Çözümlenen kiracı için sabit adımlar: tenant-created, edition-created, owner-mfa,
// subscription-active. PII İLKESİ: sayım dışında KİŞİSEL VERİ YOK — e-posta/ad İSİM
// döndürülmez (yalnız tenantName — çalışma alanı etiketi, kişisel veri değil).
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { resolveContext, GuardError } from "@/lib/api/tenant-guard";
import { TRIAL_QUOTA_BYTES } from "@/lib/api/provision-core";

const KB = 1024;

export async function GET(_req: NextRequest) {
  try {
    const tenantId = await resolveContext(null);

    const [tenant, editionCount, adminCount, owners, subscription, mediaAgg] = await Promise.all([
      db.tenant.findUnique({ where: { id: tenantId }, select: { name: true } }),
      db.eventEdition.count({ where: { tenantId } }),
      db.user.count({ where: { tenantId } }),
      // ORG_OWNER sahiplerinin YALNIZ mfaEnabled bayrağı — kimlik alanı seçilmez (PII yok)
      db.user.findMany({ where: { tenantId, role: "ORG_OWNER" }, select: { mfaEnabled: true } }),
      db.tenantSubscription.findUnique({ where: { tenantId }, select: { plan: true, status: true, trialQuotaBytes: true } }),
      db.mediaAsset.aggregate({ _sum: { sizeKb: true }, where: { edition: { tenantId } } }),
    ]);

    // owner-mfa: owner VAR ve hepsinin mfaEnabled=true (owner yoksa adım tamamlanmamış sayılır)
    const ownerMfa = owners.length > 0 && owners.every((o) => o.mfaEnabled);
    // subscription-active: abonelik var ve dönemi açık (TRIAL deneme dönemi de AKTİF sayılır;
    // PAST_DUE/CANCELED açık dönem değildir)
    const subscriptionActive = subscription !== null && ["TRIAL", "ACTIVE"].includes(subscription.status);

    const steps = [
      { key: "tenant-created", done: true, labelKey: "onboarding.step.tenantCreated" }, // kiracı çözümlendi = kuruldu
      { key: "edition-created", done: editionCount > 0, labelKey: "onboarding.step.editionCreated" },
      { key: "owner-mfa", done: ownerMfa, labelKey: "onboarding.step.ownerMfa" },
      { key: "subscription-active", done: subscriptionActive, labelKey: "onboarding.step.subscriptionActive" },
    ];

    return NextResponse.json({
      tenantName: tenant?.name ?? null,
      hasEdition: editionCount > 0,
      editionCount,
      hasAdmin: adminCount > 0,
      ownerMfa,
      subscription: subscription ? { plan: subscription.plan, status: subscription.status } : null,
      trialQuotaBytes: subscription?.trialQuotaBytes ?? TRIAL_QUOTA_BYTES,
      mediaBytesUsed: (mediaAgg._sum.sizeKb ?? 0) * KB,
      steps,
    });
  } catch (err) {
    if (err instanceof GuardError) return NextResponse.json({ error: err.message }, { status: err.status });
    return NextResponse.json({ error: "Onboarding durumu alınamadı" }, { status: 500 });
  }
}
