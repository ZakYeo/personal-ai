import { createInMemoryAlarmStore } from "./in-memory-alarm-store.js";

describe("createInMemoryAlarmStore", () => {
  it("stores alarms and returns defensive list copies", async () => {
    const store = createInMemoryAlarmStore();
    const alarm = {
      id: "alarm-1",
      label: "ping me",
      scheduledFor: "2026-06-26T09:10:00.000Z",
    };

    await expect(
      store.add({ label: alarm.label, scheduledFor: alarm.scheduledFor }),
    ).resolves.toEqual(alarm);
    const listedAlarms = await store.list();
    listedAlarms.push({
      id: "alarm-2",
      label: "mutated copy",
      scheduledFor: "2026-06-26T09:20:00.000Z",
    });

    await expect(store.list()).resolves.toEqual([alarm]);
  });
});
