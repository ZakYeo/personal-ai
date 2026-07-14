import {
  createFileAlarmStore,
  type FileAlarmStoreDependencies,
} from "../../adapters/local/file-alarm-store.js";
import { createInMemoryAlarmStore } from "../../adapters/local/in-memory-alarm-store.js";
import { createAlarmFeature } from "../../features/alarms/alarm-feature.js";
import type { AlarmStore } from "../../ports/alarm-store.js";
import { isRecord } from "../config/config-parse-utils.js";
import { resolveLocalStatePath } from "../local-state-path.js";
import {
  defineFeatureAdapterEntry,
  type FeatureAdapterDependencies,
  type FeatureRegistryEntry,
} from "../feature-adapter-registry.js";
import { runAlarmScheduler } from "../alarm/alarm-scheduler.js";
import type { RuntimeBackgroundTaskContext } from "../background-task.js";

export function createAlarmFeatureRegistryEntry(
  dependencies: FileAlarmStoreDependencies = {},
): FeatureRegistryEntry {
  return {
    adapters: {
      file: defineFeatureAdapterEntry({
        create: ({ adapterConfig, dependencies: runtimeDependencies }) => {
          const alarmStore = createFileAlarmStore({
            ...dependencies,
            filePath: resolveLocalStatePath(
              adapterConfig.filePath,
              runtimeDependencies.configDirectory,
            ),
            now: () => runtimeDependencies.clock.now(),
          });

          return createAlarmComposition(alarmStore, runtimeDependencies);
        },
        parseConfig: parseFileAlarmStoreConfig,
      }),
      local: defineFeatureAdapterEntry({
        create: ({ dependencies: runtimeDependencies }) => {
          const alarmStore = createInMemoryAlarmStore({
            now: () => runtimeDependencies.clock.now(),
          });
          return createAlarmComposition(alarmStore, runtimeDependencies);
        },
        parseConfig: () => {},
      }),
    },
  };
}

function createAlarmComposition(
  alarmStore: AlarmStore,
  dependencies: FeatureAdapterDependencies,
) {
  const feature = createAlarmFeature(alarmStore);
  if (!dependencies.notificationDelivery) {
    return { feature };
  }

  const notificationDelivery = dependencies.notificationDelivery;
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
          }),
      },
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
