// Next.js instrumentation — sunucu başlangıcında bir kez çalışır.
// ZAMANLANMIŞ KAMPANYA GÖNDERİMİ (campaign-scheduler) döngüsünü başlatır:
// zamani gelen SCHEDULED kampanyalar 60 saniyelik kontrol döngüsüyle otomatik gönderilir.
// Node.js runtime dışında (edge/middleware) ve çoklu-önyükleme durumunda korumalıdır.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
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
