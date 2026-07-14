import { writeFile } from "node:fs/promises";
import { createFileAlarmStore } from "../../adapters/local/file-alarm-store.js";
import { enabledDeterministicConfig } from "../../test-support/deterministic-runtime-fixtures.js";
import { writePersistentAlarmRuntimeConfig } from "../../test-support/runtime-composition.js";
import { runConfiguredServiceRuntime } from "./configured-service-composition.js";

describe("configured service alarm recovery", () => {
  it("preserves an alarm before its due time and delivers it after restart", async () => {
    const fixture = await persistedAlarmAt("2026-07-14T09:10:00.000Z");

    const beforeDue = await runRecoveryCycle(
      fixture.configPath,
      "2026-07-14T09:00:00.000Z",
      false,
    );
    expect(beforeDue).toEqual([]);

    const atDue = await runRecoveryCycle(
      fixture.configPath,
      "2026-07-14T09:10:00.000Z",
      true,
    );
    expect(atDue).toEqual([{ id: "recovery-alarm", text: "Alarm: tea." }]);
    await expect(
      createFileAlarmStore({ filePath: fixture.statePath }).list(),
    ).resolves.toEqual([
      expect.objectContaining({
        deliveryAttempts: 1,
        status: "ringing",
        successfulDeliveries: 1,
      }),
    ]);
  });

  it.each([
    ["2026-07-14T09:15:00.000Z", true, "ringing"],
    ["2026-07-14T09:15:00.001Z", false, "missed"],
  ] as const)(
    "applies the restart grace policy at %s",
    async (now, shouldDeliver, expectedStatus) => {
      const fixture = await persistedAlarmAt("2026-07-14T09:00:00.000Z");

      const delivered = await runRecoveryCycle(
        fixture.configPath,
        now,
        shouldDeliver,
      );

      expect(delivered).toHaveLength(shouldDeliver ? 1 : 0);
      await expect(
        createFileAlarmStore({ filePath: fixture.statePath }).list(),
      ).resolves.toEqual([expect.objectContaining({ status: expectedStatus })]);
    },
  );

  it("finalizes an interrupted durable claim without replay after restart", async () => {
    const fixture = await persistedAlarmAt("2026-07-14T09:00:00.000Z");
    await writeFile(
      fixture.statePath,
      JSON.stringify({
        alarms: [
          {
            createdAt: "2026-07-14T08:50:00.000Z",
            deliveryAttempts: 2,
            id: "recovery-alarm",
            label: "tea",
            revision: 3,
            scheduledFor: "2026-07-14T09:00:00.000Z",
            status: "ringing",
            successfulDeliveries: 1,
            updatedAt: "2026-07-14T09:01:00.000Z",
          },
        ],
        version: 2,
      }),
    );

    await expect(
      runRecoveryCycle(fixture.configPath, "2026-07-14T09:02:00.000Z", false),
    ).resolves.toEqual([]);
    await expect(
      createFileAlarmStore({ filePath: fixture.statePath }).list(),
    ).resolves.toEqual([expect.objectContaining({ status: "completed" })]);
  });

  it("persists the next recurring occurrence across restart", async () => {
    const fixture = await persistedAlarmAt("2026-07-14T09:10:00.000Z", {
      frequency: "daily",
      timeZone: "Europe/London",
    });

    await runRecoveryCycle(
      fixture.configPath,
      "2026-07-14T09:10:00.000Z",
      true,
    );
    await runRecoveryCycle(
      fixture.configPath,
      "2026-07-14T09:11:00.000Z",
      true,
    );
    await expect(
      runRecoveryCycle(fixture.configPath, "2026-07-14T09:12:00.000Z", false),
    ).resolves.toEqual([]);
    await expect(
      createFileAlarmStore({ filePath: fixture.statePath }).list(),
    ).resolves.toEqual([
      expect.objectContaining({
        recurrence: { frequency: "daily", timeZone: "Europe/London" },
        scheduledFor: "2026-07-15T09:10:00.000Z",
        status: "scheduled",
      }),
    ]);
  });
});

async function persistedAlarmAt(
  scheduledFor: string,
  recurrence?: { frequency: "daily" | "weekly"; timeZone: string },
) {
  const fixture = await writePersistentAlarmRuntimeConfig(
    enabledDeterministicConfig,
    recurrence
      ? {}
      : { alarms: [{ id: "recovery-alarm", label: "tea", scheduledFor }] },
  );
  if (recurrence) {
    await createFileAlarmStore({
      createId: () => "recovery-alarm",
      filePath: fixture.statePath,
      now: () => new Date("2026-07-14T09:00:00.000Z"),
    }).add({ label: "tea", recurrence, scheduledFor });
  }
  return fixture;
}

async function runRecoveryCycle(
  configPath: string,
  now: string,
  waitForDelivery: boolean,
): Promise<Array<{ id: string; text: string }>> {
  const notifications: Array<{ id: string; text: string }> = [];
  let observeCycle: (() => void) | undefined;
  const cycleObserved = new Promise<void>((resolve) => {
    observeCycle = resolve;
  });
  let observeDelivery: (() => void) | undefined;
  const deliveryObserved = new Promise<void>((resolve) => {
    observeDelivery = resolve;
  });

  await runConfiguredServiceRuntime(
    {
      backgroundTaskTimer: {
        wait: (_delayMs, shutdownSignal) => {
          observeCycle?.();
          if (shutdownSignal.aborted) {
            return Promise.resolve();
          }
          return new Promise<void>((resolve) => {
            shutdownSignal.addEventListener("abort", () => resolve(), {
              once: true,
            });
          });
        },
      },
      configPath,
      createNotificationDelivery: () => ({
        deliver: (notification) => {
          notifications.push(notification);
          observeDelivery?.();
          return Promise.resolve();
        },
      }),
      now: () => new Date(now),
    },
    {
      validateConfig: () => {},
      runTurn: async (context) => {
        await (waitForDelivery ? deliveryObserved : cycleObserved);
        context.requestShutdown("recovery observed");
      },
    },
  );

  return notifications;
}
