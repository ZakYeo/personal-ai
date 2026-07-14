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
      nextDeliveryAt: "2026-06-26T09:10:00.000Z",
      revision: 1,
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
      nextDeliveryAt: "2026-06-26T09:20:00.000Z",
      revision: 1,
      successfulDeliveries: 0,
      scheduledFor: "2026-06-26T09:20:00.000Z",
      status: "scheduled",
      updatedAt: "2026-06-26T09:00:00.000Z",
    });

    await expect(store.list()).resolves.toEqual([alarm]);
  });

  it("applies lifecycle updates only at the expected revision", async () => {
    const store = createInMemoryAlarmStore({
      now: () => new Date("2026-06-26T09:00:00.000Z"),
    });
    const alarm = await store.add({
      label: "tea",
      scheduledFor: "2026-06-26T09:10:00.000Z",
    });

    await expect(
      store.update({
        changes: {
          deliveryAttempts: 1,
          nextDeliveryAt: "2026-06-26T09:11:00.000Z",
          status: "ringing",
        },
        expectedRevision: alarm.revision,
        id: alarm.id,
        updatedAt: "2026-06-26T09:10:00.000Z",
      }),
    ).resolves.toMatchObject({
      deliveryAttempts: 1,
      nextDeliveryAt: "2026-06-26T09:11:00.000Z",
      revision: 2,
      status: "ringing",
    });

    await expect(
      store.update({
        changes: { status: "cancelled" },
        expectedRevision: alarm.revision,
        id: alarm.id,
        updatedAt: "2026-06-26T09:10:30.000Z",
      }),
    ).resolves.toBeUndefined();
  });

  it("rejects illegal lifecycle transitions and contradictory states", async () => {
    const store = createInMemoryAlarmStore({
      now: () => new Date("2026-06-26T09:00:00.000Z"),
    });
    const alarm = await store.add({
      label: "tea",
      scheduledFor: "2026-06-26T09:10:00.000Z",
    });

    await expect(
      Promise.resolve().then(() =>
        store.update({
          changes: {
            deliveryAttempts: 99,
            nextDeliveryAt: null,
            status: "ringing",
          },
          expectedRevision: alarm.revision,
          id: alarm.id,
          updatedAt: "2026-06-26T09:10:00.000Z",
        }),
      ),
    ).rejects.toThrow("Alarm lifecycle update is invalid.");

    const cancelled = await store.update({
      changes: { nextDeliveryAt: null, status: "cancelled" },
      expectedRevision: alarm.revision,
      id: alarm.id,
      updatedAt: "2026-06-26T09:05:00.000Z",
    });
    await expect(
      Promise.resolve().then(() =>
        store.update({
          changes: {
            nextDeliveryAt: "2026-06-26T09:20:00.000Z",
            status: "scheduled",
          },
          expectedRevision: cancelled?.revision ?? 0,
          id: alarm.id,
          updatedAt: "2026-06-26T09:06:00.000Z",
        }),
      ),
    ).rejects.toThrow("Alarm lifecycle update is invalid.");
  });

  it("removes only terminal alarms older than the retention cutoff", async () => {
    let nextId = 0;
    const store = createInMemoryAlarmStore({
      createId: () => `alarm-${++nextId}`,
      now: () => new Date("2026-06-01T09:00:00.000Z"),
    });
    const oldTerminal = await store.add({
      label: "old",
      scheduledFor: "2026-06-01T09:10:00.000Z",
    });
    const cutoffTerminal = await store.add({
      label: "cutoff",
      scheduledFor: "2026-06-01T09:20:00.000Z",
    });
    await store.add({
      label: "active",
      scheduledFor: "2026-08-01T09:00:00.000Z",
    });
    await store.update({
      changes: { nextDeliveryAt: null, status: "cancelled" },
      expectedRevision: oldTerminal.revision,
      id: oldTerminal.id,
      updatedAt: "2026-06-30T08:59:59.999Z",
    });
    await store.update({
      changes: { nextDeliveryAt: null, status: "cancelled" },
      expectedRevision: cutoffTerminal.revision,
      id: cutoffTerminal.id,
      updatedAt: "2026-06-30T09:00:00.000Z",
    });

    await expect(
      store.removeTerminalBefore("2026-06-30T09:00:00.000Z"),
    ).resolves.toBe(1);
    await expect(store.list()).resolves.toEqual([
      expect.objectContaining({ label: "cutoff", status: "cancelled" }),
      expect.objectContaining({ label: "active", status: "scheduled" }),
    ]);
  });
});
