import { createInMemoryAlarmStore } from "./in-memory-alarm-store.js";

describe("createInMemoryAlarmStore", () => {
  it("stores alarms and returns defensive list copies", async () => {
    const store = createInMemoryAlarmStore({
      now: () => new Date("2026-06-26T09:00:00.000Z"),
    });
    const alarm = {
      createdAt: "2026-06-26T09:00:00.000Z",
      deliveryAttempts: 0,
      id: "alarm-1",
      label: "ping me",
      successfulDeliveries: 0,
      scheduledFor: "2026-06-26T09:10:00.000Z",
      status: "scheduled" as const,
      updatedAt: "2026-06-26T09:00:00.000Z",
    };

    await expect(
      store.add({ label: alarm.label, scheduledFor: alarm.scheduledFor }),
    ).resolves.toEqual(alarm);
    const listedAlarms = await store.list();
    listedAlarms.push({
      createdAt: "2026-06-26T09:00:00.000Z",
      deliveryAttempts: 0,
      id: "alarm-2",
      label: "mutated copy",
      successfulDeliveries: 0,
      scheduledFor: "2026-06-26T09:20:00.000Z",
      status: "scheduled",
      updatedAt: "2026-06-26T09:00:00.000Z",
    });

    await expect(store.list()).resolves.toEqual([alarm]);
  });
});
