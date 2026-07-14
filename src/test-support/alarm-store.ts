import { createInMemoryAlarmStore } from "../adapters/local/in-memory-alarm-store.js";
import type { AlarmStore } from "../ports/alarm-store.js";

export function createTestAlarmStore(idPrefix = "alarm"): AlarmStore {
  let nextId = 0;

  return createInMemoryAlarmStore({
    createId: () => `${idPrefix}-${++nextId}`,
    now: () => new Date("2026-06-26T09:00:00.000Z"),
  });
}
