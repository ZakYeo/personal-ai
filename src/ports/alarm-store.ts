export interface AlarmRecord {
  id: string;
  label: string;
  scheduledFor: string;
}

export interface AlarmStore {
  add(alarm: AlarmRecord): void;
  list(): AlarmRecord[];
}
