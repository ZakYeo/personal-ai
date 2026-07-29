import type { NotificationDeliveryPort } from "../ports/notification-delivery.js";

interface DeferredNotificationDelivery {
  bind(delivery: NotificationDeliveryPort): void;
  port: NotificationDeliveryPort;
}

export function createDeferredNotificationDelivery(): DeferredNotificationDelivery {
  let boundDelivery: NotificationDeliveryPort | undefined;

  return {
    bind: (delivery) => {
      if (boundDelivery) {
        throw new Error("Notification delivery is already bound.");
      }
      boundDelivery = delivery;
    },
    port: {
      deliver: (request, context) => {
        if (!boundDelivery) {
          throw new Error("Notification delivery is not bound.");
        }
        return boundDelivery.deliver(request, context);
      },
    },
  };
}
