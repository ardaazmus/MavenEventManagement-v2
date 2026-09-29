// ─── Ortak guard hatası ───────────────────────────────────────────────────────
// N-11: 'registry ↔ tenant-guard' döngüsünü kırmak için ayrı modüle taşındı.
// tenant-guard.ts geriye dönük uyum için bu sınıfı yeniden dışa aktarır.
export class GuardError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}
