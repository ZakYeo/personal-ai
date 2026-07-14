import type { AlarmRecord, AlarmStore } from "../../ports/alarm-store.js";
import {
  applyAlarmLifecycleUpdate,
  cloneAlarmRecord,
  createScheduledAlarm,
} from "./alarm-record.js";

interface InMemoryAlarmStoreOptions {
  createId?: () => string;
  now?: () => Date;
}

export function createInMemoryAlarmStore(
  options: InMemoryAlarmStoreOptions = {},
): AlarmStore {
  const alarms: AlarmRecord[] = [];
  const createId = options.createId ?? (() => `alarm-${alarms.length + 1}`);
  const now = options.now ?? (() => new Date());

  return {
    add: (alarm) => {
      const storedAlarm = createScheduledAlarm(alarm, createId(), now());

      alarms.push(storedAlarm);

      return Promise.resolve(cloneAlarmRecord(storedAlarm));
    },
    list: () => Promise.resolve(alarms.map(cloneAlarmRecord)),
    removeTerminalBefore: (cutoff) => {
      const retained = alarms.filter(
        (alarm) => alarm.terminalAt === undefined || alarm.terminalAt >= cutoff,
      );
      const removed = alarms.length - retained.length;
      alarms.splice(0, alarms.length, ...retained);
      return Promise.resolve(removed);
    },
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
      return Promise.resolve(cloneAlarmRecord(updated));
    },
  };
}
