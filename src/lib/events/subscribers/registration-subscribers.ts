import { eventBus } from "../domain-event-bus";

/**
 * Registers domain event subscribers for Registration & Payment events
 */
export function registerRegistrationSubscribers() {
  // When registration is confirmed, automatically queue badge printing
  eventBus.subscribe("registration.confirmed", "badge-auto-queue", async (payload) => {
    await eventBus.publish("badge.queued", {
      registrationId: payload.registrationId,
      personId: payload.personId,
    });
  });

  // When payment is received, check if fully paid and confirm registration
  eventBus.subscribe("payment.received", "payment-registration-reconcile", async (payload) => {
    if (payload.registrationId) {
      await eventBus.publish("registration.confirmed", {
        registrationId: payload.registrationId,
        editionId: "current",
        personId: "",
      });
    }
  });

  // When room is assigned, emit activity notification
  eventBus.subscribe("room.assigned", "room-assignment-logger", async (payload) => {
    if (process.env.NODE_ENV !== "production") {
      console.log(`[EventBus] Room assigned: person=${payload.personId}, room=${payload.hotelRoomId}`);
    }
  });
}
