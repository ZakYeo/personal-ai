import {
  createFileTaskStore,
  type FileTaskStoreDependencies,
} from "../../adapters/local/file-task-store.js";
import { createInMemoryTaskStore } from "../../adapters/local/in-memory-task-store.js";
import { createTaskFeature } from "../../features/tasks/task-feature.js";
import type { TaskStore } from "../../ports/task-store.js";
import type { NotificationDeliveryPort } from "../../ports/notification-delivery.js";
import type { RuntimeBackgroundTaskContext } from "../background-task.js";
import { isRecord } from "../config/config-parse-utils.js";
import {
  defineFeatureAdapterEntry,
  type FeatureRegistryEntry,
} from "../feature-adapter-registry.js";
import { resolveLocalStatePath } from "../local-state-path.js";
import { runTaskReminderRetention } from "../tasks/task-reminder-retention.js";
import { runTaskReminderScheduler } from "../tasks/task-reminder-scheduler.js";

export function createTaskFeatureRegistryEntry(
  dependencies: FileTaskStoreDependencies & {
    configDirectory?: string;
    notificationDelivery?: NotificationDeliveryPort;
  } = {},
): FeatureRegistryEntry {
  return {
    adapters: {
      file: createFileTaskAdapterEntry(dependencies),
      local: createLocalTaskAdapterEntry(dependencies.notificationDelivery),
    },
  };
}

function createFileTaskAdapterEntry(
  dependencies: FileTaskStoreDependencies & {
    configDirectory?: string;
    notificationDelivery?: NotificationDeliveryPort;
  },
) {
  const { configDirectory, notificationDelivery, ...storeDependencies } =
    dependencies;
  return defineFeatureAdapterEntry({
    create: ({ adapterConfig, runtime }) =>
      createTaskComposition(
        createFileTaskStore({
          ...storeDependencies,
          filePath: resolveLocalStatePath(
            adapterConfig.filePath,
            configDirectory,
          ),
          now: () => runtime.clock.now(),
        }),
        notificationDelivery,
      ),
    parseConfig: parseFileTaskStoreConfig,
  });
}

function createLocalTaskAdapterEntry(
  notificationDelivery: NotificationDeliveryPort | undefined,
) {
  return defineFeatureAdapterEntry({
    create: ({ runtime }) =>
      createTaskComposition(
        createInMemoryTaskStore({
          now: () => runtime.clock.now(),
        }),
        notificationDelivery,
      ),
    parseConfig: () => {},
  });
}

function createTaskComposition(
  store: TaskStore,
  delivery: NotificationDeliveryPort | undefined,
) {
  const feature = createTaskFeature(store);
  const retentionTask = {
    failureReason: "task reminder retention cleanup failed",
    id: "tasks.reminders.retention",
    run: (context: RuntimeBackgroundTaskContext) =>
      runTaskReminderRetention({
        clock: context.clock,
        intervalMs: 24 * 60 * 60_000,
        retentionMs: 30 * 24 * 60 * 60_000,
        shutdownSignal: context.shutdownSignal,
        store,
        ...(context.timer ? { timer: context.timer } : {}),
      }),
  };
  if (!delivery) {
    return { backgroundTasks: [retentionTask], feature };
  }
  return {
    backgroundTasks: [
      {
        failureReason: "task reminder delivery failed",
        id: "tasks.reminders.delivery",
        run: (context: RuntimeBackgroundTaskContext) =>
          runTaskReminderScheduler({
            clock: context.clock,
            clockRecheckMs: 1_000,
            delivery,
            reportFailure: (error) => {
              context.reportFailure(error);
            },
            shutdownSignal: context.shutdownSignal,
            store,
            ...(context.timer ? { timer: context.timer } : {}),
          }),
      },
      retentionTask,
    ],
    feature,
  };
}

function parseFileTaskStoreConfig(featureConfig: Record<string, unknown>): {
  filePath: string;
} {
  const state = featureConfig.state;
  if (
    !isRecord(state) ||
    typeof state.path !== "string" ||
    state.path.trim().length === 0
  ) {
    throw new Error(
      'Config feature "tasks".state.path must be a non-empty string.',
    );
  }
  return { filePath: state.path };
}
