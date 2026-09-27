import { eventBus } from "./domain-event-bus";
import { correlationMiddleware } from "./middleware/correlation-middleware";
import { registerRegistrationSubscribers } from "./subscribers/registration-subscribers";
import { registerSessionSubscribers } from "./subscribers/session-subscribers";

// Initialize default middleware
eventBus.use(correlationMiddleware);

// Initialize default domain subscribers
registerRegistrationSubscribers();
registerSessionSubscribers();

export { eventBus };
export * from "./domain-event-bus";
