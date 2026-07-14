import { deterministicScenarios } from "../../test-support/deterministic-scenarios.js";
import { enabledDeterministicConfig } from "../../test-support/deterministic-runtime-fixtures.js";
import {
  writePersistentAlarmRuntimeConfig,
  writeRuntimeHarnessConfig,
} from "../../test-support/runtime-composition.js";
import type { ServiceTurnContext } from "./service-runtime.js";
import { runConfiguredServiceRuntime } from "./configured-service-composition.js";
import { dirname } from "node:path";
import type { AlarmDeliveryPort } from "../../ports/alarm-delivery.js";
import type { AlarmSchedulerRuntimeDependencies } from "../alarm/alarm-scheduler.js";
import { createFileAlarmStore } from "../../adapters/local/file-alarm-store.js";

describe("runConfiguredServiceRuntime", () => {
  it("composes the configured text assistant from an injected config path", async () => {
    const configPath = await writeRuntimeHarnessConfig(
      enabledDeterministicConfig,
    );

    await expect(
      runConfiguredServiceRuntime(
        {
          configPath,
          now: () => new Date("2026-06-26T09:00:00.000Z"),
          retryAfterFailure: () => Promise.resolve(),
        },
        {
          validateConfig: () => {},
          runTurn: async (context: ServiceTurnContext) => {
            await expect(
              context.assistant.handleText(
                deterministicScenarios.alarmListEmpty.text,
              ),
            ).resolves.toEqual(deterministicScenarios.alarmListEmpty.response);
            expect(context.configPath).toBe(configPath);

            context.requestShutdown("test complete");
          },
        },
      ),
    ).resolves.toEqual({
      status: "stopped",
      turnsCompleted: 1,
    });
  });

  it("forwards the loaded config directory to persistent alarm storage", async () => {
    const { configPath } = await writePersistentAlarmRuntimeConfig(
      enabledDeterministicConfig,
      {
        alarms: [
          {
            id: "service-alarm",
            label: "tea",
            scheduledFor: "2026-07-13T17:00:00.000Z",
          },
        ],
      },
    );

    await runConfiguredServiceRuntime(
      {
        configPath,
        retryAfterFailure: () => Promise.resolve(),
      },
      {
        validateConfig: () => {},
        runTurn: async (context) => {
          const response = await context.assistant.handleText(
            deterministicScenarios.alarmListEmpty.text,
          );
          expect(response.text).toContain("service-alarm");
          context.requestShutdown("test complete");
        },
      },
    );
  });

  it("passes the loaded config context to startup validation", async () => {
    const configPath = await writeRuntimeHarnessConfig(
      enabledDeterministicConfig,
    );

    await expect(
      runConfiguredServiceRuntime(
        {
          configPath,
          retryAfterFailure: () => Promise.resolve(),
        },
        {
          validateConfig: (_config, dependencies) => {
            expect(dependencies.configDirectory).toBe(dirname(configPath));
          },
          runTurn: (context) => {
            context.requestShutdown("test complete");
            return Promise.resolve();
          },
        },
      ),
    ).resolves.toMatchObject({ status: "stopped" });
  });

  it("starts alarm scheduling with the same store used by the assistant", async () => {
    const { configPath } = await writePersistentAlarmRuntimeConfig(
      enabledDeterministicConfig,
      {
        alarms: [
          {
            id: "scheduled-alarm",
            label: "tea",
            scheduledFor: "2026-07-13T17:00:00.000Z",
          },
        ],
      },
    );
    const runAlarmScheduler = vi.fn(
      async (dependencies: AlarmSchedulerRuntimeDependencies) => {
        await expect(dependencies.store.list()).resolves.toEqual([
          expect.objectContaining({ id: "scheduled-alarm" }),
        ]);
      },
    );
    const delivery: AlarmDeliveryPort = {
      deliver: () => Promise.resolve(),
    };

    await runConfiguredServiceRuntime(
      {
        alarmDelivery: delivery,
        configPath,
        runAlarmScheduler,
      },
      {
        validateConfig: () => {},
        runTurn: (context) => {
          context.requestShutdown("test complete");
          return Promise.resolve();
        },
      },
    );

    expect(runAlarmScheduler).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        config: { missedGraceMs: 900_000, repeatAfterMs: 60_000 },
        delivery,
      }),
    );
  });

  it("delivers a persisted due alarm through configured service composition", async () => {
    const { configPath, statePath } = await writePersistentAlarmRuntimeConfig(
      enabledDeterministicConfig,
      {
        alarms: [
          {
            id: "due-alarm",
            label: "tea",
            scheduledFor: "2026-07-14T09:00:00.000Z",
          },
        ],
      },
    );
    let resolveDelivered: (() => void) | undefined;
    const delivered = new Promise<void>((resolve) => {
      resolveDelivered = resolve;
    });
    const delivery: AlarmDeliveryPort = {
      deliver: () => {
        resolveDelivered?.();
        return Promise.resolve();
      },
    };

    await runConfiguredServiceRuntime(
      {
        alarmDelivery: delivery,
        configPath,
        now: () => new Date("2026-07-14T09:00:00.000Z"),
      },
      {
        validateConfig: () => {},
        runTurn: async (context) => {
          await delivered;
          context.requestShutdown("alarm delivered");
        },
      },
    );

    await expect(
      createFileAlarmStore({ filePath: statePath }).list(),
    ).resolves.toEqual([
      expect.objectContaining({
        deliveryAttempts: 1,
        id: "due-alarm",
        status: "ringing",
        successfulDeliveries: 1,
      }),
    ]);
  });
});
