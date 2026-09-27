import { eventBus } from "../domain-event-bus";

/**
 * Registers domain event subscribers for Session & Program events
 */
export function registerSessionSubscribers() {
  // Session scheduled logging and side effects
  eventBus.subscribe("session.scheduled", "session-schedule-listener", async (payload) => {
    if (process.env.NODE_ENV !== "production") {
      console.log(`[EventBus] Session scheduled: session=${payload.sessionId}, room=${payload.roomId}`);
    }
  });

  // Conflict logging
  eventBus.subscribe("session.conflict_detected", "conflict-alert-listener", async (payload) => {
    console.warn(
      `[EventBus Conflict Alert] Session ${payload.sessionId} conflicts with ${payload.conflictingSessionId}. Reason: ${payload.reason}`
    );
  });
}
