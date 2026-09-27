import { EventMiddleware } from "../domain-event-bus";

/**
 * Correlation & Logging Middleware
 * Attaches a unique correlationId if not provided and logs event dispatch
 */
export const correlationMiddleware: EventMiddleware = async (event, next) => {
  if (!event.correlationId) {
    event.correlationId = `corr_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  }
  
  const startTime = Date.now();
  try {
    await next();
  } finally {
    const elapsed = Date.now() - startTime;
    if (process.env.NODE_ENV !== "production") {
      console.log(`[EventBus] ${event.name} (${event.id}) completed in ${elapsed}ms [corr: ${event.correlationId}]`);
    }
  }
};
