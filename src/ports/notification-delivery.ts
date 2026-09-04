export interface NotificationDeliveryRequest {
  id: string;
  spokenText?: {
    dateStyle: "calendar" | "contextual";
    timeZone: string;
  };
  text: string;
}

export interface NotificationDeliveryContext {
  shutdownSignal?: AbortSignal;
}

export interface NotificationDeliveryPort {
  deliver(
    notification: NotificationDeliveryRequest,
    context: NotificationDeliveryContext,
  ): Promise<void>;
}
