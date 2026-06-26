import { createInMemoryAlarmStore } from "./in-memory-alarm-store.js";

describe("createInMemoryAlarmStore", () => {
  it("stores alarms and returns defensive list copies", () => {
    const store = createInMemoryAlarmStore();
    const alarm = {
      id: "alarm-1",
      label: "ping me",
      scheduledFor: "2026-06-26T09:10:00.000Z",
    };

    store.add(alarm);
    const listedAlarms = store.list();
    listedAlarms.push({
      id: "alarm-2",
      label: "mutated copy",
      scheduledFor: "2026-06-26T09:20:00.000Z",
    });

    expect(store.list()).toEqual([alarm]);
  });
});
