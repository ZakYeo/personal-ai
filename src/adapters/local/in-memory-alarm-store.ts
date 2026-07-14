import type { AlarmRecord, AlarmStore } from "../../ports/alarm-store.js";
import {
  applyAlarmLifecycleUpdate,
  createScheduledAlarm,
} from "./alarm-record.js";

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
      const storedAlarm = createScheduledAlarm(
        alarm,
        `alarm-${alarms.length + 1}`,
        now(),
      );

      alarms.push(storedAlarm);

      return Promise.resolve({ ...storedAlarm });
    },
    list: () => Promise.resolve(alarms.map((alarm) => ({ ...alarm }))),
    update: (update) => {
      const index = alarms.findIndex((alarm) => alarm.id === update.id);
      const current = alarms[index];

      if (!current) {
        return Promise.resolve(undefined);
      }

      const updated = applyAlarmLifecycleUpdate(current, update);
      if (!updated) {
        return Promise.resolve(undefined);
      }

      alarms[index] = updated;
      return Promise.resolve({ ...updated });
    },
  };
}
