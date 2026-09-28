// ─── P17.3: İYS bağdaştırıcısı — sağlayıcı arayüzü, kuyruk, mutabakat ─────────
// İYS (İleti Yönetim Sistemi) ticari elektronik ileti onaylarını yöneten ulusal
// sistemdir. Bu modül: (1) sağlayıcı arayüzü (gerçek entegrasyon P22'de
// kimlik bilgileriyle bağlanır),(2) sandbox sağlayıcı (sözleşme testleri),
// (3) outbox tarama (retry/backoff + dead), (4) mutabakat — sağlayıcı YALNIZ
// geri çekme yönünde yerel rızayı ezer (fail-closed; yerel geri çekme daima
// kazanır).
// NOT: `@/` takma adı YOK — node --test (tip-sıyırma) uyumu için bağımsız.

export const IYS_MAX_ATTEMPTS = 5;
export const IYS_BASE_DELAY_MS = 60_000;

export interface IysSubmitCommand {
  channel: "EMAIL" | "SMS";
  address: string;
  action: "GRANT" | "WITHDRAW";
  source: string;
  proof: string | null;
  at: string;
}

export type IysRemoteStatus = "GRANTED" | "WITHDRAWN" | "UNKNOWN";

export interface IysProvider {
  readonly name: string;
  submitConsent(cmd: IysSubmitCommand): Promise<{ externalId: string }>;
  queryStatus(channel: "EMAIL" | "SMS", address: string): Promise<IysRemoteStatus>;
}

export class IysProviderError extends Error {
  retryable: boolean;
  constructor(message: string, retryable = true) {
    super(message);
    this.name = "IysProviderError";
    this.retryable = retryable;
  }
}

// ── Sandbox sağlayıcı (sözleşme + yerel geliştirme) ─────────────────────────

export interface SandboxScript {
  failTimes?: number;
  failWith?: string;
  nonRetryable?: boolean;
}

export class SandboxIysProvider implements IysProvider {
  readonly name = "sandbox";
  private store = new Map<string, IysRemoteStatus>();
  private scripts = new Map<string, SandboxScript & { used: number }>();
  submitted: IysSubmitCommand[] = [];

  private key(channel: string, address: string): string {
    return `${channel}:${address}`;
  }

  script(channel: string, address: string, script: SandboxScript): void {
    this.scripts.set(this.key(channel, address), { ...script, used: 0 });
  }

  seed(channel: string, address: string, status: IysRemoteStatus): void {
    this.store.set(this.key(channel, address), status);
  }

  async submitConsent(cmd: IysSubmitCommand): Promise<{ externalId: string }> {
    const k = this.key(cmd.channel, cmd.address);
    const script = this.scripts.get(k);
    if (script && script.used < (script.failTimes ?? 0)) {
      script.used++;
      throw new IysProviderError(script.failWith ?? "sandbox arızası", !script.nonRetryable);
    }
    this.submitted.push(cmd);
    this.store.set(k, cmd.action === "GRANT" ? "GRANTED" : "WITHDRAWN");
    return { externalId: `sandbox-${this.submitted.length}` };
  }

  async queryStatus(channel: "EMAIL" | "SMS", address: string): Promise<IysRemoteStatus> {
    return this.store.get(this.key(channel, address)) ?? "UNKNOWN";
  }
}

// ── Outbox tarama ───────────────────────────────────────────────────────────

export interface IysPrisma {
  iysOutbox: {
    findMany: (args: { where: Record<string, unknown>; orderBy?: unknown; take?: number }) => Promise<Array<Record<string, unknown>>>;
    update: (args: { where: Record<string, unknown>; data: Record<string, unknown> }) => Promise<Record<string, unknown>>;
  };
  contactConsent: {
    findMany: (args: { where: Record<string, unknown>; take?: number }) => Promise<Array<Record<string, unknown>>>;
    update: (args: { where: Record<string, unknown>; data: Record<string, unknown> }) => Promise<Record<string, unknown>>;
  };
}

export interface DrainOptions {
  now?: Date;
  take?: number;
  maxAttempts?: number;
  baseDelayMs?: number;
}

export interface DrainOutcome {
  processed: number;
  sent: number;
  retried: number;
  dead: number;
}

export function backoffDelayMs(attempts: number, baseMs: number): number {
  return baseMs * Math.pow(2, Math.max(0, attempts - 1));
}

export async function drainIysOutbox(prisma: IysPrisma, provider: IysProvider, opts: DrainOptions = {}): Promise<DrainOutcome> {
  const now = opts.now ?? new Date();
  const take = opts.take ?? 50;
  const maxAttempts = opts.maxAttempts ?? IYS_MAX_ATTEMPTS;
  const baseMs = opts.baseDelayMs ?? IYS_BASE_DELAY_MS;
  const due = await prisma.iysOutbox.findMany({
    where: { status: "PENDING", OR: [{ nextRetryAt: null }, { nextRetryAt: { lte: now } }] },
    orderBy: [{ createdAt: "asc" }],
    take,
  });
  const outcome: DrainOutcome = { processed: due.length, sent: 0, retried: 0, dead: 0 };
  for (const row of due as Array<Record<string, unknown> & { id: string; attempts: number; maxAttempts: number }>) {
    let payload: Record<string, unknown> = {};
    try {
      payload = JSON.parse(String(row.payload ?? "{}")) as Record<string, unknown>;
    } catch {
      payload = {};
    }
    try {
      const res = await provider.submitConsent({
        channel: row.channel as "EMAIL" | "SMS",
        address: String(row.address),
        action: row.action as "GRANT" | "WITHDRAW",
        source: String(payload.source ?? "MANUAL"),
        proof: typeof payload.proof === "string" ? payload.proof : null,
        at: String(payload.at ?? now.toISOString()),
      });
      await prisma.iysOutbox.update({
        where: { id: row.id },
        data: { status: "SENT", attempts: row.attempts + 1, externalId: res.externalId, lastError: null, nextRetryAt: null },
      });
      outcome.sent++;
    } catch (e) {
      const retryable = e instanceof IysProviderError ? e.retryable : true;
      const attempts = row.attempts + 1;
      const limit = row.maxAttempts ?? maxAttempts;
      if (!retryable || attempts >= limit) {
        await prisma.iysOutbox.update({
          where: { id: row.id },
          data: { status: "FAILED", attempts, lastError: e instanceof Error ? e.message : "İYS hatası", nextRetryAt: null },
        });
        outcome.dead++;
      } else {
        await prisma.iysOutbox.update({
          where: { id: row.id },
          data: {
            status: "PENDING",
            attempts,
            lastError: e instanceof Error ? e.message : "İYS hatası",
            nextRetryAt: new Date(now.getTime() + backoffDelayMs(attempts, baseMs)),
          },
        });
        outcome.retried++;
      }
    }
  }
  return outcome;
}

// ── Mutabakat (sağlayıcı → yerel, tek yönlü güvenli) ─────────────────────────

export interface ReconcileOptions {
  tenantId: string;
  channel?: "EMAIL" | "SMS";
  take?: number;
}

export interface ReconcileOutcome {
  checked: number;
  withdrawn: number;
}

export async function reconcileIys(prisma: IysPrisma, provider: IysProvider, opts: ReconcileOptions): Promise<ReconcileOutcome> {
  const where: Record<string, unknown> = {
    tenantId: opts.tenantId,
    purpose: "COMMERCIAL",
    status: "GRANTED",
    channel: opts.channel ? opts.channel : { in: ["EMAIL", "SMS"] },
  };
  const granted = await prisma.contactConsent.findMany({ where, take: opts.take ?? 200 });
  const outcome: ReconcileOutcome = { checked: granted.length, withdrawn: 0 };
  for (const row of granted as Array<Record<string, unknown> & { id: string; channel: string; address: string }>) {
    const remote = await provider.queryStatus(row.channel as "EMAIL" | "SMS", row.address);
    // YALNIZ geri çekme yönü uygulanır; UNKNOWN/bilinmeyen yereli değiştirmez.
    if (remote === "WITHDRAWN") {
      await prisma.contactConsent.update({
        where: { id: row.id },
        data: { status: "WITHDRAWN", source: "IYS_RECONCILE", withdrawnAt: new Date() },
      });
      outcome.withdrawn++;
    }
  }
  return outcome;
}
