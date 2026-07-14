import { createInMemoryAlarmStore } from "../../adapters/local/in-memory-alarm-store.js";
import type {
  AlarmDeliveryPort,
  AlarmDeliveryRequest,
} from "../../ports/alarm-delivery.js";
import {
  processAlarmSchedulerCycle,
  runAlarmScheduler,
  type AlarmSchedulerDependencies,
} from "./alarm-scheduler.js";

const repeatAfterMs = 60_000;
const missedGraceMs = 15 * 60_000;

describe("processAlarmSchedulerCycle", () => {
  it("claims a due alarm before delivery and schedules one repeat", async () => {
    const fixture = await createFixture("2026-07-14T09:10:00.000Z");

    await fixture.runAt("2026-07-14T09:10:00.000Z");

    expect(fixture.delivered).toEqual([
      expect.objectContaining({ attempt: 1, id: fixture.alarm.id }),
    ]);
    await expect(fixture.store.list()).resolves.toEqual([
      expect.objectContaining({
        deliveryAttempts: 1,
        nextDeliveryAt: "2026-07-14T09:11:00.000Z",
        status: "ringing",
        successfulDeliveries: 1,
      }),
    ]);

    await fixture.runAt("2026-07-14T09:11:00.000Z");

    expect(fixture.delivered).toHaveLength(2);
    await expect(fixture.store.list()).resolves.toEqual([
      expect.objectContaining({
        deliveryAttempts: 2,
        status: "completed",
        successfulDeliveries: 2,
      }),
    ]);
    expect((await fixture.store.list())[0]?.nextDeliveryAt).toBeUndefined();
  });

  it("schedules the next recurring occurrence after its final delivery", async () => {
    const fixture = await createFixture(
      "2026-07-14T09:10:00.000Z",
      undefined,
      undefined,
      {
        frequency: "daily",
        timeZone: "Europe/London",
      },
    );

    await fixture.runAt("2026-07-14T09:10:00.000Z");
    await fixture.runAt("2026-07-14T09:11:00.000Z");

    await expect(fixture.store.list()).resolves.toEqual([
      expect.objectContaining({
        deliveryAttempts: 0,
        nextDeliveryAt: "2026-07-15T09:10:00.000Z",
        scheduledFor: "2026-07-15T09:10:00.000Z",
        status: "scheduled",
        successfulDeliveries: 0,
      }),
    ]);
  });

  it("delivers at the recovery grace boundary and misses older alarms", async () => {
    const recoverable = await createFixture("2026-07-14T09:00:00.000Z");
    await recoverable.runAt("2026-07-14T09:15:00.000Z");
    expect(recoverable.delivered).toHaveLength(1);

    const expired = await createFixture("2026-07-14T09:00:00.000Z");
    await expired.runAt("2026-07-14T09:15:00.001Z");
    expect(expired.delivered).toEqual([]);
    await expect(expired.store.list()).resolves.toEqual([
      expect.objectContaining({ status: "missed" }),
    ]);
  });

  it("logs safe delivery diagnostics and marks two failed attempts missed", async () => {
    const fixture = await createFixture("2026-07-14T09:10:00.000Z", {
      deliver: () => Promise.reject(new Error("speaker secret")),
    });

    await fixture.runAt("2026-07-14T09:10:00.000Z");
    await fixture.runAt("2026-07-14T09:11:00.000Z");

    expect(fixture.failures).toEqual([
      expect.objectContaining({ alarmId: fixture.alarm.id }),
      expect.objectContaining({ alarmId: fixture.alarm.id }),
    ]);
    await expect(fixture.store.list()).resolves.toEqual([
      expect.objectContaining({
        deliveryAttempts: 2,
        status: "missed",
        successfulDeliveries: 0,
      }),
    ]);
  });

  it("finalizes a failed attempt when diagnostic reporting also fails", async () => {
    const fixture = await createFixture(
      "2026-07-14T09:10:00.000Z",
      { deliver: () => Promise.reject(new Error("speaker failure")) },
      () => {
        throw new Error("diagnostic writer failure");
      },
    );

    await expect(fixture.runAt("2026-07-14T09:10:00.000Z")).resolves.toBe(
      "2026-07-14T09:11:00.000Z",
    );
    await expect(fixture.store.list()).resolves.toEqual([
      expect.objectContaining({
        deliveryAttempts: 1,
        status: "ringing",
        successfulDeliveries: 0,
      }),
    ]);
  });

  it("consumes an interrupted final claim without replaying delivery", async () => {
    const fixture = await createFixture("2026-07-14T09:10:00.000Z");
    const firstClaim = await fixture.store.update({
      changes: {
        deliveryAttempts: 1,
        nextDeliveryAt: "2026-07-14T09:11:00.000Z",
        status: "ringing",
      },
      expectedRevision: fixture.alarm.revision,
      id: fixture.alarm.id,
      updatedAt: "2026-07-14T09:10:00.000Z",
    });
    expect(firstClaim).toBeDefined();
    const delivered = await fixture.store.update({
      changes: { status: "ringing", successfulDeliveries: 1 },
      expectedRevision: firstClaim?.revision ?? 0,
      id: fixture.alarm.id,
      updatedAt: "2026-07-14T09:10:30.000Z",
    });
    const finalClaim = await fixture.store.update({
      changes: {
        deliveryAttempts: 2,
        nextDeliveryAt: null,
        status: "ringing",
      },
      expectedRevision: delivered?.revision ?? 0,
      id: fixture.alarm.id,
      updatedAt: "2026-07-14T09:11:00.000Z",
    });
    expect(finalClaim).toBeDefined();

    await fixture.runAt("2026-07-14T09:12:00.000Z");

    expect(fixture.delivered).toEqual([]);
    await expect(fixture.store.list()).resolves.toEqual([
      expect.objectContaining({ status: "completed" }),
    ]);
  });
});

describe("runAlarmScheduler", () => {
  it("rechecks a live clock and delivers after a forward wall-clock jump", async () => {
    let now = new Date("2026-07-14T09:00:00.000Z");
    const shutdown = new AbortController();
    const waits: number[] = [];
    const delivered: AlarmDeliveryRequest[] = [];
    const fixture = await createFixture("2026-07-14T09:10:00.000Z");

    await runAlarmScheduler({
      clock: { now: () => now },
      clockRecheckMs: 1000,
      config: { missedGraceMs, repeatAfterMs },
      delivery: {
        deliver: (alarm) => {
          delivered.push(alarm);
          shutdown.abort();
          return Promise.resolve();
        },
      },
      reportDeliveryFailure: () => {},
      shutdownSignal: shutdown.signal,
      store: fixture.store,
      timer: {
        wait: (delayMs) => {
          waits.push(delayMs);
          now = new Date("2026-07-14T09:10:00.000Z");
          return Promise.resolve();
        },
      },
    });

    expect(waits).toEqual([1000]);
    expect(delivered).toEqual([
      expect.objectContaining({ id: fixture.alarm.id }),
    ]);
  });

  it("bounds future waits and stops promptly through the shutdown signal", async () => {
    const fixture = await createFixture("2026-07-14T10:00:00.000Z");
    const shutdown = new AbortController();
    const waits: number[] = [];

    await runAlarmScheduler({
      clock: { now: () => new Date("2026-07-14T09:00:00.000Z") },
      clockRecheckMs: 1000,
      config: { missedGraceMs, repeatAfterMs },
      delivery: { deliver: () => Promise.resolve() },
      reportDeliveryFailure: () => {},
      shutdownSignal: shutdown.signal,
      store: fixture.store,
      timer: {
        wait: (delayMs) => {
          waits.push(delayMs);
          shutdown.abort();
          return Promise.resolve();
        },
      },
    });

    expect(waits).toEqual([1000]);
    expect(fixture.delivered).toEqual([]);
  });

  it("does no work when shutdown was already requested", async () => {
    const fixture = await createFixture("2026-07-14T09:00:00.000Z");
    const shutdown = new AbortController();
    shutdown.abort();

    await runAlarmScheduler({
      clock: { now: () => new Date("2026-07-14T09:00:00.000Z") },
      clockRecheckMs: 1000,
      config: { missedGraceMs, repeatAfterMs },
      delivery: { deliver: () => Promise.resolve() },
      reportDeliveryFailure: () => {},
      shutdownSignal: shutdown.signal,
      store: fixture.store,
      timer: { wait: () => Promise.reject(new Error("must not wait")) },
    });

    expect(fixture.delivered).toEqual([]);
  });
});

async function createFixture(
  scheduledFor: string,
  delivery?: AlarmDeliveryPort,
  reportDeliveryFailure?: AlarmSchedulerDependencies["reportDeliveryFailure"],
  recurrence?: { frequency: "daily" | "weekly"; timeZone: string },
) {
  const store = createInMemoryAlarmStore({
    now: () => new Date("2026-07-14T09:00:00.000Z"),
  });
  const alarm = await store.add({
    label: "tea",
    ...(recurrence ? { recurrence } : {}),
    scheduledFor,
  });
  const delivered: AlarmDeliveryRequest[] = [];
  const failures: Array<{ alarmId: string; error: unknown }> = [];
  const dependencies: Omit<AlarmSchedulerDependencies, "clock"> = {
    config: { missedGraceMs, repeatAfterMs },
    delivery: delivery ?? {
      deliver: (record) => {
        delivered.push(record);
        return Promise.resolve();
      },
    },
    reportDeliveryFailure:
      reportDeliveryFailure ??
      ((failure) => {
        failures.push(failure);
      }),
    store,
  };

  return {
    alarm,
    delivered,
    failures,
    runAt: (now: string) =>
      processAlarmSchedulerCycle({
        ...dependencies,
        clock: { now: () => new Date(now) },
      }),
    store,
  };
}
