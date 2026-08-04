export type AlarmStatus =
  | "scheduled"
  | "snoozed"
  | "ringing"
  | "completed"
  | "dismissed"
  | "cancelled"
  | "missed";

export interface AlarmRecurrence {
  readonly frequency: "daily" | "weekly";
  readonly timeZone: string;
}

interface AlarmRecordFields {
  createdAt: string;
  deliveryAttempts: number;
  id: string;
  label: string;
  recurrence?: AlarmRecurrence;
  revision: number;
  scheduledFor: string;
  successfulDeliveries: number;
  updatedAt: string;
}

export interface ScheduledAlarmRecord extends AlarmRecordFields {
  deliveryAttempts: 0;
  nextDeliveryAt: string;
  status: "scheduled" | "snoozed";
  successfulDeliveries: 0;
  terminalAt?: never;
}

export interface RingingAlarmRecord extends AlarmRecordFields {
  nextDeliveryAt?: string;
  status: "ringing";
  terminalAt?: never;
}

export interface TerminalAlarmRecord extends AlarmRecordFields {
  nextDeliveryAt?: never;
  status: "cancelled" | "completed" | "dismissed" | "missed";
  terminalAt: string;
}

export type AlarmRecord =
  | ScheduledAlarmRecord
  | RingingAlarmRecord
  | TerminalAlarmRecord;

export interface NewAlarmRecord {
  label: string;
  recurrence?: AlarmRecurrence;
  scheduledFor: string;
}

interface AlarmLifecycleChanges {
  deliveryAttempts?: number;
  label?: string;
  nextDeliveryAt?: string | null;
  scheduledFor?: string;
  status?: AlarmStatus;
  successfulDeliveries?: number;
}

export interface AlarmLifecycleUpdate {
  changes: AlarmLifecycleChanges;
  expectedRevision: number;
  id: string;
  updatedAt: string;
}

export interface AlarmStore {
  add(alarm: NewAlarmRecord): Promise<AlarmRecord>;
  list(): Promise<AlarmRecord[]>;
  removeTerminalBefore(cutoff: string): Promise<number>;
  update(update: AlarmLifecycleUpdate): Promise<AlarmRecord | undefined>;
}
