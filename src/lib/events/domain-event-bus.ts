// ============================================================================
// MAVEN EVENT MANAGEMENT — DOMAIN EVENT BUS (§4.1)
// Fully Typed Event Bus with Handler Error Isolation, Retry, DLQ & Middleware
// ============================================================================

export interface DomainEvent<TName extends string = string, TPayload = unknown> {
  id: string;
  name: TName;
  occurredAt: Date;
  correlationId?: string;
  payload: TPayload;
}

export type DomainEventMap = {
  // Kayıt Olayları
  "registration.created": {
    registrationId: string;
    editionId: string;
    personId: string;
    ticketTypeId: string;
    agencyGroupId?: string;
  };
  "registration.confirmed": {
    registrationId: string;
    editionId: string;
    personId: string;
  };
  "registration.cancelled": {
    registrationId: string;
    editionId: string;
    reason?: string;
  };

  // Finans Olayları
  "payment.received": {
    paymentId: string;
    registrationId?: string;
    orderId?: string;
    amountMinor: number;
    currency: string;
  };
  "payment.refunded": {
    paymentId: string;
    amountMinor: number;
  };

  // Konaklama Olayları
  "room.assigned": {
    reservationId: string;
    hotelRoomId: string;
    personId: string;
    checkIn: string;
    checkOut: string;
  };
  "room.released": {
    reservationId: string;
    hotelRoomId: string;
  };

  // Program Olayları
  "session.scheduled": {
    sessionId: string;
    roomId: string;
    startTime: string;
    endTime: string;
  };
  "session.conflict_detected": {
    sessionId: string;
    conflictingSessionId: string;
    reason: "room_overlap" | "speaker_double_booking" | "track_cannibalization" | string;
  };

  // Bildiri Olayları
  "abstract.submitted": {
    abstractId: string;
    editionId: string;
    submitterId: string;
  };
  "abstract.review_completed": {
    abstractId: string;
    reviewerId: string;
    score: number;
  };
  "abstract.decision_made": {
    abstractId: string;
    decision: "accepted_oral" | "accepted_poster" | "revise" | "rejected";
  };

  // Saha & Rozet Olayları
  "badge.queued": {
    registrationId: string;
    personId: string;
  };
  "badge.printed": {
    badgeId: string;
    personId: string;
    editionId: string;
    reprintCount: number;
  };
  "onsite.checked_in": {
    personId: string;
    editionId: string;
    gate: string;
    timestamp: string;
  };

  // Fuar Olayları
  "booth.held": {
    boothId: string;
    organizationId: string;
    expiresAt: string;
  };
  "booth.confirmed": {
    boothId: string;
    organizationId: string;
    contractId: string;
  };
  "booth.released": {
    boothId: string;
  };
};

export type EventHandler<T> = (payload: T) => Promise<void> | void;
export type NextMiddleware = () => Promise<void>;
export type EventMiddleware = (event: DomainEvent, next: NextMiddleware) => Promise<void>;

export interface DeadLetterRecord {
  id: string;
  eventName: string;
  eventId: string;
  payload: unknown;
  failedHandler: string;
  error: { message: string; stack?: string };
  attemptCount: number;
  failedAt: Date;
}

export class DomainEventBus {
  private handlers = new Map<string, Map<string, EventHandler<any>>>();
  private middlewares: EventMiddleware[] = [];
  private dlq: DeadLetterRecord[] = [];
  private maxRetries = 3;

  /** Middleware ekle (onion pipeline) */
  use(middleware: EventMiddleware): this {
    this.middlewares.push(middleware);
    return this;
  }

  /** Olaya isimli handler abone et; unsubscribe fonksiyonu döndürür */
  subscribe<K extends keyof DomainEventMap>(
    eventName: K,
    handlerName: string,
    handler: EventHandler<DomainEventMap[K]>
  ): () => void {
    if (!this.handlers.has(eventName)) {
      this.handlers.set(eventName, new Map());
    }
    this.handlers.get(eventName)!.set(handlerName, handler);
    return () => this.handlers.get(eventName)?.delete(handlerName);
  }

  /** Olay yayınla — Promise.allSettled ile her handler izole çalışır */
  async publish<K extends keyof DomainEventMap>(
    eventName: K,
    payload: DomainEventMap[K],
    correlationId?: string
  ): Promise<{ settledCount: number; failedCount: number; eventId: string }> {
    const event: DomainEvent = {
      id: crypto.randomUUID(),
      name: eventName,
      occurredAt: new Date(),
      correlationId,
      payload,
    };

    // Middleware pipeline
    const executePipeline = async (idx: number): Promise<void> => {
      if (idx < this.middlewares.length) {
        await this.middlewares[idx](event, () => executePipeline(idx + 1));
      } else {
        await this.dispatchToHandlers(event);
      }
    };

    try {
      await executePipeline(0);
    } catch (pipelineErr) {
      console.error(`[DomainEventBus] Middleware pipeline hatası [${eventName}]:`, pipelineErr);
    }

    const handlerMap = this.handlers.get(eventName);
    const failedForThisEvent = this.dlq.filter((d) => d.eventId === event.id).length;

    return {
      settledCount: handlerMap?.size ?? 0,
      failedCount: failedForThisEvent,
      eventId: event.id,
    };
  }

  private async dispatchToHandlers(event: DomainEvent): Promise<void> {
    const handlerMap = this.handlers.get(event.name);
    if (!handlerMap || handlerMap.size === 0) return;

    const entries = Array.from(handlerMap.entries());

    // Promise.allSettled: bir handler'daki hata diğer handler'ları durdurmaz
    await Promise.allSettled(
      entries.map(async ([handlerName, handler]) => {
        let lastError: unknown;
        for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
          try {
            await handler(event.payload);
            return; // Başarılı — çıkış
          } catch (err) {
            lastError = err;
            if (attempt < this.maxRetries) {
              // Üstel geri çekilme: 100ms, 200ms, 400ms
              await new Promise((r) => setTimeout(r, 100 * Math.pow(2, attempt - 1)));
            }
          }
        }

        // Tüm denemeler tükendi — Dead Letter Queue'ya ekle
        const record: DeadLetterRecord = {
          id: crypto.randomUUID(),
          eventName: event.name,
          eventId: event.id,
          payload: event.payload,
          failedHandler: handlerName,
          error: {
            message: lastError instanceof Error ? lastError.message : String(lastError),
            stack: lastError instanceof Error ? lastError.stack : undefined,
          },
          attemptCount: this.maxRetries,
          failedAt: new Date(),
        };

        this.dlq.push(record);
        console.error(
          `[DomainEventBus DLQ] Handler '${handlerName}' olay '${event.name}' (${event.id}) için karantinaya alındı:`,
          record.error.message
        );
      })
    );
  }

  /** DLQ kayıtlarını listele */
  getDeadLetters(): DeadLetterRecord[] {
    return [...this.dlq];
  }

  /** Belirli bir DLQ kaydını yeniden dene */
  async retryDeadLetter(dlqId: string): Promise<boolean> {
    const idx = this.dlq.findIndex((d) => d.id === dlqId);
    if (idx === -1) return false;
    const item = this.dlq[idx];
    const handler = this.handlers.get(item.eventName)?.get(item.failedHandler);
    if (!handler) return false;

    try {
      await handler(item.payload);
      this.dlq.splice(idx, 1);
      return true;
    } catch (err) {
      item.attemptCount += 1;
      item.failedAt = new Date();
      return false;
    }
  }
}

export const eventBus = new DomainEventBus();
