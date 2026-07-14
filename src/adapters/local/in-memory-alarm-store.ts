import type { AlarmRecord, AlarmStore } from "../../ports/alarm-store.js";

interface InMemoryAlarmStoreOptions {
  now?: () => Date;
}

export function createInMemoryAlarmStore(
  options: InMemoryAlarmStoreOptions = {},
): AlarmStore {
  const alarms: AlarmRecord[] = [];
  const now = options.now ?? (() => new Date());

  return {
    add: (alarm) => {
      const timestamp = now().toISOString();
      const storedAlarm: AlarmRecord = {
        ...alarm,
        createdAt: timestamp,
        deliveryAttempts: 0,
        id: `alarm-${alarms.length + 1}`,
        status: "scheduled",
        successfulDeliveries: 0,
        updatedAt: timestamp,
      };

      alarms.push(storedAlarm);

      return Promise.resolve({ ...storedAlarm });
    },
    list: () => Promise.resolve(alarms.map((alarm) => ({ ...alarm }))),
  };
}
