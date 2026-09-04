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
import { defineFeatureAdapter } from "../feature-adapter-registry.js";
import { createAlarmFeature } from "../../features/alarms/alarm-feature.js";
import { createInMemoryAlarmStore } from "../../adapters/local/in-memory-alarm-store.js";
import { createFileWeatherWatchStore } from "../../adapters/local/file-weather-watch-store.js";
import { createNewWeatherWatch } from "../../test-support/weather-watch-store.js";
import { dirname, join } from "node:path";

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

  it("rebinds custom adapters through the explicitly supplied registry", async () => {
    const adapter = defineFeatureAdapter({ parseConfig: () => ({}) });
    const originalCreate = vi.fn(() =>
      createAlarmFeature(
        createInMemoryAlarmStore({
          now: () => new Date("2026-07-14T09:00:00.000Z"),
        }),
      ),
    );
    const replacementCreate = vi.fn(() =>
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
              custom: adapter.bind({ create: originalCreate }),
            },
          },
        },
      },
    );

    await expect(
      runConfiguredServiceRuntime(
        {
          config,
          env: {},
          featureAdapterRegistry: {
            alarms: {
              adapters: {
                custom: adapter.bind({ create: replacementCreate }),
              },
            },
          },
          fetch: vi.fn(),
        },
        {
          validateConfig: () => {},
          runTurn: (context) => {
            context.requestShutdown("test complete");
            return Promise.resolve();
          },
        },
      ),
    ).resolves.toMatchObject({ status: "stopped" });
    expect(originalCreate).not.toHaveBeenCalled();
    expect(replacementCreate).toHaveBeenCalledOnce();
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
      .mockImplementation(
        (_task, context) =>
          new Promise<void>((resolve) => {
            context.shutdownSignal.addEventListener("abort", () => resolve(), {
              once: true,
            });
          }),
      );
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

  it("contributes scheduled briefings and keeps on-demand briefings available", async () => {
    const backgroundTaskIds: string[] = [];
    const config = createLoadedRuntimeConfig({
      briefing: { adapter: "local", enabled: true },
    });

    await runConfiguredServiceRuntime(
      {
        config,
        createNotificationDelivery: () => ({
          deliver: () => Promise.resolve(),
        }),
        runBackgroundTask: (task, context) => {
          backgroundTaskIds.push(task.id);
          return new Promise<void>((resolve) => {
            context.shutdownSignal.addEventListener("abort", () => resolve(), {
              once: true,
            });
          });
        },
      },
      {
        validateConfig: () => {},
        runTurn: async (context) => {
          await expect(
            context.assistant.handleText("daily briefing"),
          ).resolves.toMatchObject({ status: "ok" });
          context.requestShutdown("test complete");
        },
      },
    );

    expect(backgroundTaskIds).toEqual(["briefing.delivery"]);
  });

  it("treats unexpected background task completion as fatal", async () => {
    const shutdownHook = vi.fn().mockResolvedValue(undefined);
    const stderr: string[] = [];

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
          runBackgroundTask: () => Promise.resolve(),
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
    expect(stderr).toContain(
      'Runtime failure: Background task "alarms.delivery" stopped unexpectedly.\n',
    );
  });

  it("bounds background task joins before running shutdown hooks", async () => {
    const shutdownHook = vi.fn().mockResolvedValue(undefined);
    const stderr: string[] = [];
    const runtime = runConfiguredServiceRuntime(
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
        runBackgroundTask: () => new Promise(() => {}),
        shutdownGraceMs: 10,
        shutdownHooks: [shutdownHook],
      },
      {
        validateConfig: () => {},
        runTurn: (context) => {
          context.requestShutdown("test complete");
          return Promise.resolve();
        },
      },
    );

    await expect(
      Promise.race([
        runtime,
        new Promise((_, reject) => {
          setTimeout(() => reject(new Error("service did not settle")), 200);
        }),
      ]),
    ).resolves.toEqual({ status: "stopped", turnsCompleted: 1 });
    expect(shutdownHook).toHaveBeenCalledExactlyOnceWith({
      reason: "test complete",
    });
    expect(stderr).toContain(
      "Runtime failure: Background tasks did not stop within 10ms.\n",
    );
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

  it("runs configured alarm, task reminder, and weather-watch delivery together", async () => {
    const now = new Date("2026-07-28T12:05:00.000Z");
    const configPath = await writeRuntimeHarnessConfig({
      assistant: {
        name: "Jarvis",
        timeZone: "Europe/London",
        wakePhrases: ["hey jarvis"],
      },
      conversation: { provider: "disabled" },
      features: {
        alarms: {
          adapter: "file",
          enabled: true,
          state: { path: "state/alarms.json" },
        },
        tasks: {
          adapter: "file",
          enabled: true,
          state: { path: "state/tasks.json" },
        },
        weather: {
          adapter: "mock",
          clothingAdvisor: { provider: "mock" },
          enabled: true,
          watches: {
            adapter: "file",
            state: { path: "state/weather-watches.json" },
          },
        },
      },
      intent: { provider: "deterministic" },
      responseRewriter: { provider: "disabled" },
    });
    const stateDirectory = join(dirname(configPath), "state");
    const alarmStore = createFileAlarmStore({
      createId: () => "combined-alarm",
      filePath: join(stateDirectory, "alarms.json"),
      now: () => new Date("2026-07-28T12:00:00.000Z"),
    });
    const taskStore = createFileTaskStore({
      createListId: () => "combined-list",
      createTaskId: () => "combined-task",
      filePath: join(stateDirectory, "tasks.json"),
      now: () => new Date("2026-07-28T12:00:00.000Z"),
    });
    const weatherWatchStore = createFileWeatherWatchStore({
      createId: () => "combined-weather-watch",
      filePath: join(stateDirectory, "weather-watches.json"),
      now: () => new Date("2026-07-28T12:00:00.000Z"),
    });
    await alarmStore.add({
      label: "tea",
      scheduledFor: now.toISOString(),
    });
    const list = await taskStore.addList({ name: "To-do" });
    await taskStore.addTask({
      label: "submit the form",
      listId: list.id,
      reminderAt: now.toISOString(),
    });
    await weatherWatchStore.add(createNewWeatherWatch());

    const notifications = new Map<string, string>();
    let resolveDelivered: (() => void) | undefined;
    const delivered = new Promise<void>((resolve) => {
      resolveDelivered = resolve;
    });
    const startedTasks: string[] = [];

    await expect(
      runConfiguredServiceRuntime(
        {
          backgroundTaskTimer: {
            wait: (_delayMs, shutdownSignal) =>
              new Promise<void>((resolve) => {
                shutdownSignal.addEventListener("abort", () => resolve(), {
                  once: true,
                });
              }),
          },
          configPath,
          createNotificationDelivery: () => ({
            deliver: (notification) => {
              notifications.set(notification.id, notification.text);
              if (notifications.size === 3) resolveDelivered?.();
              return Promise.resolve();
            },
          }),
          now: () => now,
          runBackgroundTask: (task, context) => {
            startedTasks.push(task.id);
            return task.run(context);
          },
        },
        {
          validateConfig: () => {},
          runTurn: async (context) => {
            await delivered;
            context.requestShutdown("combined delivery complete");
          },
        },
      ),
    ).resolves.toEqual({ status: "stopped", turnsCompleted: 1 });

    expect(startedTasks.sort()).toEqual([
      "alarms.delivery",
      "alarms.retention",
      "tasks.reminders.delivery",
      "tasks.reminders.retention",
      "weather.watches",
    ]);
    expect([...notifications.keys()].sort()).toEqual([
      "combined-alarm",
      "combined-weather-watch",
      "task-reminder:combined-task",
    ]);
    expect(notifications.get("combined-alarm")).toBe("Alarm: tea.");
    expect(notifications.get("task-reminder:combined-task")).toBe(
      "Reminder: submit the form.",
    );
    expect(notifications.get("combined-weather-watch")).toContain(
      "Weather watch combined-weather-watch matched in London",
    );
    await expect(alarmStore.list()).resolves.toEqual([
      expect.objectContaining({
        id: "combined-alarm",
        status: "ringing",
        successfulDeliveries: 1,
      }),
    ]);
    await expect(taskStore.listTasks()).resolves.toEqual([
      expect.objectContaining({
        id: "combined-task",
        reminder: expect.objectContaining({ status: "delivered" }) as object,
        status: "open",
      }),
    ]);
    await expect(weatherWatchStore.list()).resolves.toEqual([
      expect.objectContaining({
        id: "combined-weather-watch",
        status: "triggered",
      }),
    ]);
  });
});
