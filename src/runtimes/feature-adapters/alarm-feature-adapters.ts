import {
  createFileAlarmStore,
  type FileAlarmStoreDependencies,
} from "../../adapters/local/file-alarm-store.js";
import { createInMemoryAlarmStore } from "../../adapters/local/in-memory-alarm-store.js";
import { createAlarmFeature } from "../../features/alarms/alarm-feature.js";
import type { AlarmStore } from "../../ports/alarm-store.js";
import type { NotificationDeliveryPort } from "../../ports/notification-delivery.js";
import { isRecord } from "../config/config-parse-utils.js";
import { resolveLocalStatePath } from "../local-state-path.js";
import {
  defineConfiglessFeatureAdapterEntry,
  defineFeatureAdapter,
  type FeatureRegistryEntry,
} from "../feature-adapter-registry.js";
import { runAlarmScheduler } from "../alarm/alarm-scheduler.js";
import { runAlarmRetention } from "../alarm/alarm-retention.js";
import type { RuntimeBackgroundTaskContext } from "../background-task.js";
import { alarmStoreService } from "../briefing/briefing-source-services.js";
import { bindRuntimeService } from "../runtime-service-registry.js";

const fileAlarmAdapter = defineFeatureAdapter({
  parseConfig: parseFileAlarmStoreConfig,
});

export function createAlarmFeatureRegistryEntry(
  dependencies: FileAlarmStoreDependencies & {
    configDirectory?: string;
    notificationDelivery?: NotificationDeliveryPort;
  } = {},
): FeatureRegistryEntry {
  return {
    adapters: {
      file: createFileAlarmAdapterEntry(dependencies),
      local: createLocalAlarmAdapterEntry(dependencies.notificationDelivery),
    },
  };
}

function createFileAlarmAdapterEntry(
  dependencies: FileAlarmStoreDependencies & {
    configDirectory?: string;
    notificationDelivery?: NotificationDeliveryPort;
  },
) {
  const { configDirectory, notificationDelivery, ...storeDependencies } =
    dependencies;
  return fileAlarmAdapter.bind({
    create: (_context, services) =>
      createAlarmComposition(
        services.require(alarmStoreService),
        notificationDelivery,
      ),
    provideServices: ({ adapterConfig, runtime }) => [
      bindRuntimeService(
        alarmStoreService,
        createFileAlarmStore({
          ...storeDependencies,
          filePath: resolveLocalStatePath(
            adapterConfig.filePath,
            configDirectory,
          ),
          now: () => runtime.clock.now(),
        }),
      ),
    ],
  });
}

function createLocalAlarmAdapterEntry(
  notificationDelivery: NotificationDeliveryPort | undefined,
) {
  return defineConfiglessFeatureAdapterEntry({
    create: (_context, services) =>
      createAlarmComposition(
        services.require(alarmStoreService),
        notificationDelivery,
      ),
    provideServices: ({ runtime }) => [
      bindRuntimeService(
        alarmStoreService,
        createInMemoryAlarmStore({ now: () => runtime.clock.now() }),
      ),
    ],
  });
}

function createAlarmComposition(
  alarmStore: AlarmStore,
  notificationDelivery: NotificationDeliveryPort | undefined,
) {
  const feature = createAlarmFeature(alarmStore);
  const retentionTask = {
    failureReason: "alarm retention cleanup failed",
    id: "alarms.retention",
    run: (context: RuntimeBackgroundTaskContext) =>
      runAlarmRetention({
        clock: context.clock,
        intervalMs: 24 * 60 * 60_000,
        retentionMs: 30 * 24 * 60 * 60_000,
        shutdownSignal: context.shutdownSignal,
        store: alarmStore,
        ...(context.timer ? { timer: context.timer } : {}),
      }),
  };
  if (!notificationDelivery) {
    return { backgroundTasks: [retentionTask], feature };
  }

  return {
    backgroundTasks: [
      {
        failureReason: "alarm scheduler failed",
        id: "alarms.delivery",
        run: (context: RuntimeBackgroundTaskContext) =>
          runAlarmScheduler({
            clock: context.clock,
            clockRecheckMs: 1000,
            config: { missedGraceMs: 900_000, repeatAfterMs: 60_000 },
            delivery: {
              deliver: (alarm, deliveryContext) =>
                notificationDelivery.deliver(
                  { id: alarm.id, text: `Alarm: ${alarm.label}.` },
                  deliveryContext,
                ),
            },
            reportDeliveryFailure: ({ error }) => {
              context.reportFailure(error);
            },
            shutdownSignal: context.shutdownSignal,
            store: alarmStore,
            ...(context.timer ? { timer: context.timer } : {}),
          }),
      },
      retentionTask,
    ],
    feature,
  };
}

function parseFileAlarmStoreConfig(featureConfig: Record<string, unknown>): {
  filePath: string;
} {
  const state = featureConfig.state;

  if (!isRecord(state) || !isNonEmptyString(state.path)) {
    throw new Error(
      'Config feature "alarms".state.path must be a non-empty string.',
    );
  }

  return { filePath: state.path };
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}
