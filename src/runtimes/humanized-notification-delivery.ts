import { humanizeSpokenText } from "../application/human-text.js";
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
    deliver: (notification, deliveryContext) => {
      const { spokenText, ...safeNotification } = notification;
      const timeZone = spokenText?.timeZone ?? context.timeZone;
      return delivery.deliver(
        {
          ...safeNotification,
          text: humanizeSpokenText(notification.text, {
            assistantTimeZone: context.timeZone,
            ...(spokenText ? { dateStyle: spokenText.dateStyle } : {}),
            now: context.now(),
            timeZone,
          }),
        },
        deliveryContext,
      );
    },
  };
}
