export interface NotificationDeliveryRequest {
  id: string;
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
