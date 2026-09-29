// Node.js specific instrumentation — Edge runtime'dan izole edilmiş Node başlangıç mantığı.
export async function registerNode() {
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
