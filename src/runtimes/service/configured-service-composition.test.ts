import { deterministicScenarios } from "../../test-support/deterministic-scenarios.js";
import { enabledDeterministicConfig } from "../../test-support/deterministic-runtime-fixtures.js";
import {
  writePersistentAlarmRuntimeConfig,
  writePersistentTaskRuntimeConfig,
  writeRuntimeHarnessConfig,
} from "../../test-support/runtime-composition.js";
import type { ServiceTurnContext } from "./service-runtime.js";
import { runConfiguredServiceRuntime } from "./configured-service-composition.js";
import type { NotificationDeliveryPort } from "../../ports/notification-delivery.js";
import { createFileAlarmStore } from "../../adapters/local/file-alarm-store.js";
import { createFileTaskStore } from "../../adapters/local/file-task-store.js";
import { safeRuntimeFallbackResponse } from "../human-boundary.js";
import type {
  RuntimeBackgroundTask,
  RuntimeBackgroundTaskContext,
} from "../background-task.js";
import { createLoadedRuntimeConfig } from "../../test-support/core-assistant.js";
import type { LoadedRuntimeConfig } from "../config/config.js";
import { parseAssistantConfig } from "../config/config.js";
import { defineFeatureAdapterEntry } from "../feature-adapter-registry.js";
import { createAlarmFeature } from "../../features/alarms/alarm-feature.js";
import { createInMemoryAlarmStore } from "../../adapters/local/in-memory-alarm-store.js";

describe("runConfiguredServiceRuntime", () => {
  it("composes the configured text assistant from an injected config path", async () => {
    const configPath = await writeRuntimeHarnessConfig(
      enabledDeterministicConfig,
    );
    const createNotificationDelivery = vi.fn(
      ({ config }: { config: LoadedRuntimeConfig }) => {
        expect(config.features.alarms).toMatchObject({
          adapter: "local",
          enabled: true,
        });
        return { deliver: () => Promise.resolve() };
      },
    );

    await expect(
      runConfiguredServiceRuntime(
        {
          configPath,
          createNotificationDelivery,
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
    expect(createNotificationDelivery).toHaveBeenCalledOnce();
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

  it("passes the loaded config to startup validation", async () => {
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
          validateConfig: (config) => {
            expect(config.features.alarms).toMatchObject({
              adapter: "local",
              enabled: true,
            });
          },
          runTurn: (context) => {
            context.requestShutdown("test complete");
            return Promise.resolve();
          },
        },
      ),
    ).resolves.toMatchObject({ status: "stopped" });
  });

  it("preserves custom pre-bound adapters under provider dependency overrides", async () => {
    const create = vi.fn(() =>
      createAlarmFeature(
        createInMemoryAlarmStore({
          now: () => new Date("2026-07-14T09:00:00.000Z"),
        }),
      ),
    );
    const config = parseAssistantConfig(
      {
        ...enabledDeterministicConfig,
        features: { alarms: { adapter: "custom", enabled: true } },
      },
      {
        featureAdapterRegistry: {
          alarms: {
            adapters: {
              custom: defineFeatureAdapterEntry({
                create,
                parseConfig: () => ({}),
              }),
            },
          },
        },
      },
    );

    await expect(
      runConfiguredServiceRuntime(
        { config, env: {}, fetch: vi.fn() },
        {
          validateConfig: () => {},
          runTurn: (context) => {
            context.requestShutdown("test complete");
            return Promise.resolve();
          },
        },
      ),
    ).resolves.toMatchObject({ status: "stopped" });
    expect(create).toHaveBeenCalledOnce();
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

  it("delivers a persisted task reminder without completing its task", async () => {
    const taskRuntimeConfig = {
      assistant: {
        name: "Jarvis",
        timeZone: "Europe/London",
        wakePhrases: ["hey jarvis"],
      },
      conversation: { provider: "disabled" },
      features: {},
      intent: { provider: "deterministic" },
      responseRewriter: { provider: "disabled" },
    };
    const { configPath, statePath } =
      await writePersistentTaskRuntimeConfig(taskRuntimeConfig);
    const scheduledFor = "2026-07-29T08:00:00.000Z";
    const store = createFileTaskStore({
      filePath: statePath,
      now: () => new Date("2026-07-28T08:00:00.000Z"),
    });
    const list = await store.addList({ name: "To-do" });
    await store.addTask({
      label:
        "Submit the form at https://example.test/2026-07-29T08:00:00Z after 2026-07-29T08:00:00Z",
      listId: list.id,
      reminderAt: scheduledFor,
    });
    let resolveDelivered: (() => void) | undefined;
    const delivered = new Promise<void>((resolve) => {
      resolveDelivered = resolve;
    });
    const notifications: Array<{ id: string; text: string }> = [];

    await runConfiguredServiceRuntime(
      {
        configPath,
        createNotificationDelivery: () => ({
          deliver: (notification) => {
            notifications.push(notification);
            resolveDelivered?.();
            return Promise.resolve();
          },
        }),
        now: () => new Date(scheduledFor),
      },
      {
        validateConfig: () => {},
        runTurn: async (context) => {
          await delivered;
          context.requestShutdown("task reminder delivered");
        },
      },
    );

    expect(notifications).toEqual([
      {
        id: expect.stringMatching(/^task-reminder:task-/u) as string,
        text: "Reminder: Submit the form at the linked source after 9am today.",
      },
    ]);
    await expect(store.listTasks()).resolves.toEqual([
      expect.objectContaining({
        label:
          "Submit the form at https://example.test/2026-07-29T08:00:00Z after 2026-07-29T08:00:00Z",
        reminder: expect.objectContaining({
          deliveredAt: scheduledFor,
          status: "delivered",
        }) as object,
        status: "open",
      }),
    ]);

    let resolveSchedulerWait: (() => void) | undefined;
    const schedulerWait = new Promise<void>((resolve) => {
      resolveSchedulerWait = resolve;
    });
    const replayDelivery = vi.fn(() => Promise.resolve());
    await runConfiguredServiceRuntime(
      {
        backgroundTaskTimer: {
          wait: (delayMs, shutdownSignal) => {
            if (delayMs === 1_000) resolveSchedulerWait?.();
            return new Promise<void>((resolve) => {
              shutdownSignal.addEventListener("abort", () => resolve(), {
                once: true,
              });
            });
          },
        },
        configPath,
        createNotificationDelivery: () => ({ deliver: replayDelivery }),
        now: () => new Date(scheduledFor),
      },
      {
        validateConfig: () => {},
        runTurn: async (context) => {
          await schedulerWait;
          context.requestShutdown("task reminder replay check complete");
        },
      },
    );
    expect(replayDelivery).not.toHaveBeenCalled();
  });

  it("delivers a user-created weather watch through the configured service task", async () => {
    let releaseWait: (() => void) | undefined;
    let resolveWaitStarted: (() => void) | undefined;
    const waitStarted = new Promise<void>((resolve) => {
      resolveWaitStarted = resolve;
    });
    let resolveDelivered: (() => void) | undefined;
    const delivered = new Promise<void>((resolve) => {
      resolveDelivered = resolve;
    });
    let requestShutdown: ((reason: string) => void) | undefined;
    const notifications: string[] = [];

    await expect(
      runConfiguredServiceRuntime(
        {
          backgroundTaskTimer: {
            wait: (_delayMs, shutdownSignal) => {
              expect(shutdownSignal).toBeInstanceOf(AbortSignal);
              resolveWaitStarted?.();
              return new Promise<void>((resolve) => {
                releaseWait = resolve;
              });
            },
          },
          config: createLoadedRuntimeConfig({
            weather: { adapter: "mock", enabled: true },
          }),
          createNotificationDelivery: () => ({
            deliver: (notification) => {
              notifications.push(notification.text);
              resolveDelivered?.();
              requestShutdown?.("weather watch delivered");
              return Promise.resolve();
            },
          }),
          now: () => new Date("2026-07-28T12:05:00.000Z"),
        },
        {
          validateConfig: () => {},
          runTurn: async (context) => {
            requestShutdown = (reason) => {
              context.requestShutdown(reason);
            };
            await context.assistant.handleText(
              "Hey Jarvis, watch for rain in London from 2026-07-28T12:00:00.000Z to 2026-07-29T12:00:00.000Z",
            );
            await context.assistant.handleText("yes");
            const firstEvaluatorEvent = await Promise.race([
              waitStarted.then(() => "waiting" as const),
              delivered.then(() => "delivered" as const),
            ]);
            if (firstEvaluatorEvent === "waiting") releaseWait?.();
            await delivered;
          },
        },
      ),
    ).resolves.toEqual({
      status: "stopped",
      turnsCompleted: 1,
    });

    expect(notifications).toHaveLength(1);
    expect(notifications[0]).toContain(
      "Weather watch weather-watch-1 matched in London",
    );
    expect(notifications[0]).toContain(
      "convenience notifications, not guaranteed emergency alerts",
    );
  });
});
