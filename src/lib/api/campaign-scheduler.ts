// ─── KAMPANYA ZAMANLAYICI — scheduledAt tetikleyicisi ───────────────────────
// Kullanıcı hikâyesi: "Etkinlik Öncesi/Sırası/Sonrası için Mailing ve Bildirimleri
// organize edebilmeli" — kampanya oluşturulur, test edilir ve İLERİ BİR TARİHTE
// otomatik gitmesi planlanabilmelidir. Zamani gelen kampanyalar kontrol döngüsü
// tarafından gerçek çok-kanallı dağıtıma (sendCampaignNow) alınır.
// İlkeler:
//  • zamanlama yalnız DRAFT/TESTED kampanyaya, GELECEK bir zamana yapılabilir
//  • tick yalnız status=SCHEDULED + scheduledAt≤şimdi kayıtlarını işler
//  • gönderim sendCampaignNow'a delege edilir (kota/bastırma/soğuma mirası gelir)
//  • hata FIRLATMAZ — TickResult raporlar; başarısız kampanya FAILED işaretlenir
//  • yeniden-giriş koruması: aynı anda tek tick (aynı kampanyanın çift gönderimi engellenir)
import { db } from "@/lib/db";
import { sendCampaignNow, BroadcastError } from "@/lib/api/comms-broadcast";

// ─── tipler ─────────────────────────────────────────────────────────────────
export class ScheduleError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

export type TickOutcome = { campaignId: string; ok: boolean; totalSent?: number; error?: string };

export type TickResult = {
  processed: number; // fiilen gönderim denenen kampanya sayısı
  sent: number; // alıcıya ulaşan gönderim toplamı
  failed: number; // başarısız kampanya sayısı
  busy: boolean; // başka bir tick çalışıyorsa true (işlem yapılmadı)
  results: TickOutcome[];
};

// ─── zamanlama kur ──────────────────────────────────────────────────────────
// status: DRAFT|TESTED|SCHEDULED kabul edilir (zamanlamayı yenilemek serbest);
// SENT/FAILED kampanya yeniden zamanlanamaz (gönderim-tarihi bütünlüğü).
export async function scheduleCampaign(opts: {
  campaignId: string;
  scheduledAt: Date;
  actorName: string;
}): Promise<{ id: string; status: string; scheduledAt: Date }> {
  const campaign = await db.campaign.findUnique({
    where: { id: opts.campaignId },
    select: { id: true, name: true, status: true, editionId: true, purpose: true, approvalStatus: true },
  });
  if (!campaign) throw new ScheduleError("CAMPAIGN_NOT_FOUND", "Kampanya bulunamadı");
  if (!["DRAFT", "TESTED", "SCHEDULED"].includes(campaign.status)) {
    throw new ScheduleError("INVALID_STATUS", "Gönderilmiş veya başarısız kampanya yeniden zamanlanamaz");
  }
  // P19.3: ticari kampanya onaysız zamanlanamaz (tick anında 409 yerine erken ret).
  if (campaign.purpose !== "TRANSACTIONAL" && campaign.approvalStatus !== "APPROVED") {
    throw new ScheduleError("INVALID_STATUS", `Ticari kampanya onaysız zamanlanamaz (durum: ${campaign.approvalStatus ?? "NONE"})`);
  }
  if (Number.isNaN(opts.scheduledAt.getTime())) {
    throw new ScheduleError("VALIDATION", "Geçersiz tarih/saat");
  }
  if (opts.scheduledAt.getTime() <= Date.now()) {
    throw new ScheduleError("PAST_TIME", "Gelecek bir zaman seçilmelidir");
  }

  const scheduledAt = opts.scheduledAt;
  const updated = await db.campaign.update({
    where: { id: campaign.id },
    data: { status: "SCHEDULED", scheduledAt },
    select: { id: true, status: true },
  });

  const edition = await db.eventEdition.findUnique({
    where: { id: campaign.editionId },
    select: { tenantId: true },
  });
  await db.activityLog.create({
    data: {
      tenantId: edition?.tenantId ?? "",
      editionId: campaign.editionId,
      type: "CAMPAIGN_SAVED",
      message: `Zamanlama: "${campaign.name}" → ${scheduledAt.toISOString()}`,
      entityType: "campaign",
      entityId: campaign.id,
      actorName: opts.actorName,
    },
  });

  return { id: updated.id, status: updated.status, scheduledAt };
}

// ─── zamanlama iptal ────────────────────────────────────────────────────────
export async function cancelCampaignSchedule(opts: {
  campaignId: string;
  actorName: string;
}): Promise<{ id: string; status: string; scheduledAt: null }> {
  const campaign = await db.campaign.findUnique({
    where: { id: opts.campaignId },
    select: { id: true, name: true, status: true, editionId: true },
  });
  if (!campaign) throw new ScheduleError("CAMPAIGN_NOT_FOUND", "Kampanya bulunamadı");
  if (campaign.status !== "SCHEDULED") {
    throw new ScheduleError("NOT_SCHEDULED", "Bu kampanya zamanlanmış durumda değil");
  }

  const updated = await db.campaign.update({
    where: { id: campaign.id },
    data: { status: "DRAFT", scheduledAt: null },
    select: { id: true, status: true, scheduledAt: true },
  });

  const edition = await db.eventEdition.findUnique({
    where: { id: campaign.editionId },
    select: { tenantId: true },
  });
  await db.activityLog.create({
    data: {
      tenantId: edition?.tenantId ?? "",
      editionId: campaign.editionId,
      type: "CAMPAIGN_SAVED",
      message: `Zamanlama iptal: "${campaign.name}" taslağa alındı`,
      entityType: "campaign",
      entityId: campaign.id,
      actorName: opts.actorName,
    },
  });

  return { id: updated.id, status: updated.status, scheduledAt: null };
}

// ─── kontrol döngüsü — zamani gelen kampanyaları gönder ─────────────────────
// Yeniden-giriş koruması: running işareti aynı süreçte çift tick'i engeller
// (uzun süren çoklu alıcı gönderimi sırasında ikinci tick zararsız döner).
let running = false;

export async function processDueCampaigns(opts?: {
  campaignId?: string | null; // verilirse yalnız bu kampanya değerlendirilir
  actorName?: string;
}): Promise<TickResult> {
  const empty: TickResult = { processed: 0, sent: 0, failed: 0, busy: false, results: [] };
  if (running) return { ...empty, busy: true };
  running = true;
  try {
    const due = await db.campaign.findMany({
      where: {
        status: "SCHEDULED",
        scheduledAt: { not: null, lte: new Date() },
        ...(opts?.campaignId ? { id: opts.campaignId } : {}),
      },
      select: { id: true, name: true },
      orderBy: { scheduledAt: "asc" },
      take: 20,
    });

    const results: TickOutcome[] = [];
    let sentTotal = 0;
    let failedCount = 0;

    for (const c of due) {
      // yarış koruması: tick sırasında iptal edildiyse (status≠SCHEDULED) atla
      const fresh = await db.campaign.findUnique({ where: { id: c.id }, select: { status: true } });
      if (!fresh || fresh.status !== "SCHEDULED") {
        results.push({ campaignId: c.id, ok: false, error: "zamanlaması iptal edilmiş — atlandı" });
        continue;
      }
      try {
        const report = await sendCampaignNow({
          campaignId: c.id,
          mode: "LIVE",
          actorName: opts?.actorName ?? "Zamanlayıcı",
        });
        // sendCampaignNow LIVE sonrası scheduledAt'ı temizlemez — burada temizlenir
        await db.campaign.update({ where: { id: c.id }, data: { scheduledAt: null } });
        const ok = report.totalSent > 0;
        if (ok) sentTotal += report.totalSent;
        else failedCount += 1;
        results.push({ campaignId: c.id, ok, totalSent: report.totalSent });
      } catch (e) {
        // gönderim fırlattı (hedef boş / kampanya yok / sağlayıcı hatası) → FAILED işaretle
        const msg = e instanceof BroadcastError || e instanceof Error ? e.message : "bilinmeyen hata";
        const failReport = {
          at: new Date().toISOString(),
          mode: "LIVE",
          audienceSize: 0,
          channels: {},
          totalSent: 0,
          error: msg,
        };
        await db.campaign.updateMany({
          where: { id: c.id, status: "SCHEDULED" },
          data: { status: "FAILED", scheduledAt: null, failCount: 1, lastSendReport: JSON.stringify(failReport) },
        });
        failedCount += 1;
        results.push({ campaignId: c.id, ok: false, error: msg });
      }
    }

    return { processed: results.length, sent: sentTotal, failed: failedCount, busy: false, results };
  } finally {
    running = false;
  }
}

// ─── sunucu-başlangıç zamanlayıcısı (instrumentation.ts çağırır) ────────────
//  • açılıştan 15 sn sonra ilk tick (kapalıyken zamani gelenler için)
//  • ardından 60 sn'de bir tick
// unref: sürecin kapanmasını ZAMANLAYICI engellemesin (test/CLI hijyeni)
export function startScheduler(): void {
  const g = globalThis as { __mavenSchedulerStarted?: boolean };
  if (g.__mavenSchedulerStarted) return;
  g.__mavenSchedulerStarted = true;

  const tick = () => {
    void processDueCampaigns()
      .then((r) => {
        if (r.processed > 0) {
          console.log(`[scheduler] ${r.processed} kampanya işlendi — ${r.sent} alıcı, ${r.failed} başarısız`);
        }
      })
      .catch((e) => console.error("[scheduler] tick hatası", e instanceof Error ? e.message : e));
  };

  setTimeout(tick, 15_000).unref?.();
  setInterval(tick, 60_000).unref?.();
}
