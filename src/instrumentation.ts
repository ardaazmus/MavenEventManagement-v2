// Next.js instrumentation — sunucu başlangıcında bir kez çalışır.
// ZAMANLANMIŞ KAMPANYA GÖNDERİMİ (campaign-scheduler) döngüsünü başlatır:
// zamani gelen SCHEDULED kampanyalar 60 saniyelik kontrol döngüsüyle otomatik gönderilir.
// Node.js runtime dışında (edge/middleware) ve çoklu-önyükleme durumunda korumalıdır.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  // N-09: üretim konfigürasyonu BOOT'TA doğrulanır — prod + auth-off + demo'suz
  // veya eksik/zayıf secret ile süreç ASLA ayağa kalkmaz (fail-closed).
  // Derleme fazı hariç (NEXT_PHASE) — build DB'siz de alınabilmeli.
  // NOT: Next.js register() hatasını unhandledRejection'a çevirip YAŞAMAYA DEVAM
  // EDER — gerçek fatal için açık process.exit(1) şart (canlı boot testiyle kanıtlı).
  if (process.env.NEXT_PHASE !== "phase-production-build") {
    try {
      const { validateConfig } = await import("@/lib/config");
      validateConfig(process.env);
    } catch (e) {
      console.error("[instrumentation] FATAL:", e instanceof Error ? e.message : e);
      process.exit(1);
    }
  }
  const g = globalThis as { __mavenSchedulerBooted?: boolean };
  if (g.__mavenSchedulerBooted) return;
  g.__mavenSchedulerBooted = true;
  try {
    const { startScheduler } = await import("@/lib/api/campaign-scheduler");
    startScheduler();
  } catch (e) {
    console.error("[instrumentation] zamanlayıcı başlatılamadı", e instanceof Error ? e.message : e);
  }
}
