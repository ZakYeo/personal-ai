export type AlarmStatus =
  | "scheduled"
  | "ringing"
  | "completed"
  | "dismissed"
  | "cancelled"
  | "missed";

export interface AlarmRecord {
  createdAt: string;
  deliveryAttempts: number;
  id: string;
  label: string;
  scheduledFor: string;
  status: AlarmStatus;
  successfulDeliveries: number;
  updatedAt: string;
}

export type NewAlarmRecord = Pick<AlarmRecord, "label" | "scheduledFor">;

export interface AlarmStore {
  add(alarm: NewAlarmRecord): Promise<AlarmRecord>;
  list(): Promise<AlarmRecord[]>;
}
