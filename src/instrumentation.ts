// Next.js instrumentation — sunucu başlangıcında bir kez çalışır.
// ZAMANLANMIŞ KAMPANYA GÖNDERİMİ (campaign-scheduler) döngüsünü başlatır.
// Node.js runtime dışında (edge/middleware) ve çoklu-önyükleme durumunda korumalıdır.
// Edge derlemesinde "process.exit" hatasını önlemek için Node mantığı dinamik yüklenir.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { registerNode } = await import("./instrumentation.node");
    await registerNode();
  }
}
