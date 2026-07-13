import type { AlarmRecord, AlarmStore } from "../../ports/alarm-store.js";

export function createInMemoryAlarmStore(): AlarmStore {
  const alarms: AlarmRecord[] = [];

  return {
    add: (alarm) => {
      const storedAlarm: AlarmRecord = {
        ...alarm,
        id: `alarm-${alarms.length + 1}`,
      };

      alarms.push(storedAlarm);

      return Promise.resolve(storedAlarm);
    },
    list: () => Promise.resolve([...alarms]),
  };
}
