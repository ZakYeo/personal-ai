export interface AlarmRecord {
  id: string;
  label: string;
  scheduledFor: string;
}

export type NewAlarmRecord = Omit<AlarmRecord, "id">;

export interface AlarmStore {
  add(alarm: NewAlarmRecord): Promise<AlarmRecord>;
  list(): Promise<AlarmRecord[]>;
}
