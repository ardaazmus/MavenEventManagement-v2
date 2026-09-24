// ─── TASK-B 21: Kiracı provizyon çekirdeği — atomik çoklu-create + tazminatlı geri alma ──
// ATOMİKLİK MODELİ: SQLite interactive transaction yerine BİLİNÇLİ tercih — sıralı create
// + TERS-SIRA tazminatlı geri alma (compensating rollback). Her adım izlenir; HERHANGİ bir
// adım başarısız olursa o ana kadar yaratılan kayıtlar ters sırada silinir ve hangi adımın
// patladığı yanıtta bildirilir. Sağlamlık: her geri-alma kendi try/catch'inde — zincir,
// tek bir silme hatasıyla kopmaz (en kötü durum: kiracı silinir, cascade gerisini alır).
//
// SIRALAMA: Tenant → User (ORG_OWNER, passwordHash YOK — şifre normal akışla sonra) →
// TenantSubscription (TRIAL) → ActivityLog. 4xx doğrulamaları PRE-FLIGHT'ta (yazma YOK).
import { db } from "@/lib/db";
import crypto from "crypto";

export const SAAS_PLANS = ["TRIAL", "BASIC", "PRO", "ENTERPRISE"] as const;
export type SaaSPlan = (typeof SAAS_PLANS)[number];

export const TRIAL_QUOTA_BYTES = 524_288_000; // 512 MB — TenantSubscription.trialQuotaBytes varsayılanı

export type ProvisionStep = "TENANT" | "USER" | "SUBSCRIPTION" | "ACTIVITY";

export class ProvisionError extends Error {
  step: ProvisionStep;
  status: number;
  constructor(step: ProvisionStep, message: string, status = 500) {
    super(message);
    this.step = step;
    this.status = status;
  }
}

export type ProvisionInput = { tenantName: string; adminEmail: string; adminName: string; plan?: string };
export type ProvisionResult = { tenantId: string; userId: string; subscriptionId: string };

// Türkçe karakter korumalı, deterministik slug tabanı (benzersizlik çakışmasında kısa ek eklenir)
export function slugifyTenantName(name: string): string {
  const map: Record<string, string> = { ı: "i", İ: "i", ş: "s", Ş: "s", ğ: "g", Ğ: "g", ü: "u", Ü: "u", ö: "o", Ö: "o", ç: "c", Ç: "c" };
  const normalized = name.replace(/[ıİşŞğĞüÜöÖçÇ]/g, (ch) => map[ch] ?? ch).toLowerCase();
  return normalized.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "tenant";
}

// ─── Tazminatlı geri alma — yaratılanlar TERS SIRADA silinir (route + kanıt betiği ortak kod) ──
// Bağlı satırlar (invoice/passkey) savunma amaçlı önce silinir; FK cascade zaten garantiler.
export async function rollbackProvision(ids: {
  tenantId?: string | null;
  userId?: string | null;
  subscriptionId?: string | null;
}): Promise<string[]> {
  const rolledBack: string[] = [];
  if (ids.subscriptionId) {
    try {
      await db.tenantInvoice.deleteMany({ where: { subscriptionId: ids.subscriptionId } });
      await db.tenantSubscription.delete({ where: { id: ids.subscriptionId } });
      rolledBack.push("SUBSCRIPTION");
    } catch {
      /* sonraki adımları etkilemesin — kiracı silme cascade'i telafi eder */
    }
  }
  if (ids.userId) {
    try {
      await db.passkey.deleteMany({ where: { userId: ids.userId } });
      await db.user.delete({ where: { id: ids.userId } });
      rolledBack.push("USER");
    } catch {
      /* cascade telafi eder */
    }
  }
  if (ids.tenantId) {
    try {
      await db.tenant.delete({ where: { id: ids.tenantId } });
      rolledBack.push("TENANT");
    } catch {
      /* kayıt yoktu — zaten geri alınmış */
    }
  }
  return rolledBack;
}

export async function provisionTenant(input: ProvisionInput): Promise<ProvisionResult> {
  // ─── PRE-FLIGHT (yazma YOK — tüm 4xx'ler burada, satır yaratılmadan önce) ───
  const tenantName = (input.tenantName ?? "").trim();
  const adminEmail = (input.adminEmail ?? "").trim().toLowerCase();
  const adminName = (input.adminName ?? "").trim();
  const plan = (input.plan ?? "TRIAL") as SaaSPlan;

  if (!tenantName) throw new ProvisionError("TENANT", "tenantName zorunlu", 400);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adminEmail)) throw new ProvisionError("USER", "Geçerli adminEmail zorunlu", 400);
  if (!adminName) throw new ProvisionError("USER", "adminName zorunlu", 400);
  if (!SAAS_PLANS.includes(plan)) throw new ProvisionError("SUBSCRIPTION", "Geçersiz plan", 400);

  const emailTaken = await db.user.findFirst({ where: { email: adminEmail }, select: { id: true } });
  if (emailTaken) throw new ProvisionError("USER", "Bu e-posta ile kayıtlı kullanıcı var", 409);

  const base = slugifyTenantName(tenantName);
  let slug = base;
  if (await db.tenant.findUnique({ where: { slug }, select: { id: true } })) {
    slug = `${base}-${crypto.randomBytes(2).toString("hex")}`; // provizyon tekrarında çakışma güvenli
  }

  // ─── SIRALI CREATE + TERS-SIRA GERİ ALMA ───
  let step: ProvisionStep = "TENANT";
  let tenantId: string | null = null;
  let userId: string | null = null;
  let subscriptionId: string | null = null;
  try {
    const tenant = await db.tenant.create({ data: { name: tenantName, slug, plan, status: "ACTIVE" } });
    tenantId = tenant.id;
    step = "USER";
    // passwordHash BİLİNÇLİ YOK — şifre normal kimlik-doğrulama akışında sonradan tanımlanır
    const user = await db.user.create({
      data: { tenantId: tenant.id, email: adminEmail, name: adminName, role: "ORG_OWNER", status: "ACTIVE" },
    });
    userId = user.id;
    step = "SUBSCRIPTION";
    const subscription = await db.tenantSubscription.create({
      data: {
        tenantId: tenant.id,
        plan,
        status: "TRIAL",
        priceMonthlyMinor: 0, // deneme — kuruş disiplini: Int minor unit
        currency: "TRY",
        trialQuotaBytes: TRIAL_QUOTA_BYTES,
      },
    });
    subscriptionId = subscription.id;
    step = "ACTIVITY";
    await db.activityLog.create({
      data: {
        tenantId: tenant.id,
        type: "TENANT_PROVISIONED",
        message: `Kiracı provizyonlandı: ${tenantName} — ${plan} deneme dönemi başlatıldı`,
        entityType: "Tenant",
        entityId: tenant.id,
        actorName: "SaaS Provizyon",
      },
    });
    return { tenantId: tenant.id, userId: user.id, subscriptionId: subscription.id };
  } catch (err) {
    // HERHANGİ bir adım patladı → yaratılanlar TERS SIRADA silinir, adım bildirilir
    const rolledBack = await rollbackProvision({ tenantId, userId, subscriptionId });
    if (err instanceof ProvisionError) throw err;
    throw new ProvisionError(
      step,
      `Provizyon ${step} adımında başarısız — geri alındı: ${rolledBack.join(",") || "yok"}`,
      500,
    );
  }
}
