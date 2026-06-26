import type { AlarmRecord, AlarmStore } from "../../ports/alarm-store.js";

export function createInMemoryAlarmStore(): AlarmStore {
  const alarms: AlarmRecord[] = [];

  return {
    add: (alarm) => {
      alarms.push(alarm);
    },
    list: () => [...alarms],
  };
}
