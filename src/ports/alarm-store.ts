export type AlarmStatus =
  | "scheduled"
  | "snoozed"
  | "ringing"
  | "completed"
  | "dismissed"
  | "cancelled"
  | "missed";

export interface AlarmRecurrence {
  frequency: "daily" | "weekly";
  timeZone: string;
}

export interface AlarmRecord {
  createdAt: string;
  deliveryAttempts: number;
  id: string;
  label: string;
  nextDeliveryAt?: string;
  recurrence?: AlarmRecurrence;
  revision: number;
  scheduledFor: string;
  status: AlarmStatus;
  successfulDeliveries: number;
  terminalAt?: string;
  updatedAt: string;
}

export type NewAlarmRecord = Pick<AlarmRecord, "label" | "scheduledFor"> & {
  recurrence?: AlarmRecurrence;
};

type AlarmLifecycleChanges = Partial<
  Pick<
    AlarmRecord,
    | "deliveryAttempts"
    | "label"
    | "scheduledFor"
    | "status"
    | "successfulDeliveries"
  >
> & {
  nextDeliveryAt?: string | null;
};

export interface AlarmLifecycleUpdate {
  changes: AlarmLifecycleChanges;
  expectedRevision: number;
  id: string;
  updatedAt: string;
}

export interface AlarmStore {
  add(alarm: NewAlarmRecord): Promise<AlarmRecord>;
  list(): Promise<AlarmRecord[]>;
  update(update: AlarmLifecycleUpdate): Promise<AlarmRecord | undefined>;
}
