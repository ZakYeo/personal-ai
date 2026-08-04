import { humanizeSpokenText } from "../ports/human-text.js";
import type { NotificationDeliveryPort } from "../ports/notification-delivery.js";

interface HumanizedNotificationDeliveryContext {
  now(): Date;
  timeZone: string;
}

export function createHumanizedNotificationDelivery(
  delivery: NotificationDeliveryPort,
  context: HumanizedNotificationDeliveryContext,
): NotificationDeliveryPort {
  return {
    deliver: (notification, deliveryContext) =>
      delivery.deliver(
        {
          ...notification,
          text: humanizeSpokenText(notification.text, {
            assistantTimeZone: context.timeZone,
            now: context.now(),
            timeZone: context.timeZone,
          }),
        },
        deliveryContext,
      ),
  };
}
