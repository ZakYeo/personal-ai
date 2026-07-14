export interface AlarmDeliveryRequest {
  attempt: number;
  id: string;
  label: string;
  scheduledFor: string;
}

export interface AlarmDeliveryContext {
  shutdownSignal?: AbortSignal;
}

export interface AlarmDeliveryPort {
  deliver(
    alarm: AlarmDeliveryRequest,
    context: AlarmDeliveryContext,
  ): Promise<void>;
}
