import { deterministicScenarios } from "../../test-support/deterministic-scenarios.js";
import { enabledDeterministicConfig } from "../../test-support/deterministic-runtime-fixtures.js";
import {
  writePersistentAlarmRuntimeConfig,
  writeRuntimeHarnessConfig,
} from "../../test-support/runtime-composition.js";
import type { ServiceTurnContext } from "./service-runtime.js";
import { runConfiguredServiceRuntime } from "./configured-service-composition.js";
import { dirname } from "node:path";
import type { NotificationDeliveryPort } from "../../ports/notification-delivery.js";
import { createFileAlarmStore } from "../../adapters/local/file-alarm-store.js";
import { safeRuntimeFallbackResponse } from "../human-boundary.js";
import type {
  RuntimeBackgroundTask,
  RuntimeBackgroundTaskContext,
} from "../background-task.js";

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

  it("starts feature-contributed background tasks through neutral service orchestration", async () => {
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
    const runBackgroundTask = vi
      .fn<
        (
          task: RuntimeBackgroundTask,
          context: RuntimeBackgroundTaskContext,
        ) => Promise<void>
      >()
      .mockResolvedValue(undefined);
    const delivery: NotificationDeliveryPort = {
      deliver: () => Promise.resolve(),
    };

    await runConfiguredServiceRuntime(
      {
        configPath,
        createNotificationDelivery: () => delivery,
        runBackgroundTask,
      },
      {
        validateConfig: () => {},
        runTurn: (context) => {
          context.requestShutdown("test complete");
          return Promise.resolve();
        },
      },
    );

    expect(runBackgroundTask).toHaveBeenCalledTimes(2);
    expect(runBackgroundTask.mock.calls.map(([task]) => task.id)).toEqual([
      "alarms.delivery",
      "alarms.retention",
    ]);
    for (const [, context] of runBackgroundTask.mock.calls) {
      expect(context.clock).toHaveProperty("now");
      expect(context.shutdownSignal).toBeInstanceOf(AbortSignal);
    }
  });

  it("returns a fatal result after scheduler failure and service cleanup", async () => {
    const shutdownHook = vi.fn().mockResolvedValue(undefined);
    const stderr: string[] = [];
    const schedulerFailure = new Error("scheduler state failure");

    await expect(
      runConfiguredServiceRuntime(
        {
          config: enabledDeterministicConfig,
          createNotificationDelivery: () => ({
            deliver: () => Promise.resolve(),
          }),
          io: {
            stderr: {
              write: (chunk) => {
                stderr.push(chunk);
              },
            },
          },
          runBackgroundTask: () => Promise.reject(schedulerFailure),
          shutdownHooks: [shutdownHook],
        },
        {
          validateConfig: () => {},
          runTurn: (context) =>
            new Promise<void>((resolve) => {
              context.shutdownSignal.addEventListener(
                "abort",
                () => resolve(),
                {
                  once: true,
                },
              );
            }),
        },
      ),
    ).resolves.toEqual({
      response: safeRuntimeFallbackResponse,
      status: "failed",
      turnsCompleted: 1,
    });

    expect(shutdownHook).toHaveBeenCalledExactlyOnceWith({
      reason: "alarm scheduler failed",
    });
    expect(stderr).toContain("Runtime failure: scheduler state failure\n");
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
    const delivery: NotificationDeliveryPort = {
      deliver: () => {
        resolveDelivered?.();
        return Promise.resolve();
      },
    };

    await runConfiguredServiceRuntime(
      {
        configPath,
        createNotificationDelivery: () => delivery,
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
      createFileAlarmStore({
        filePath: statePath,
        now: () => new Date("2026-07-13T16:00:00.000Z"),
      }).list(),
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
