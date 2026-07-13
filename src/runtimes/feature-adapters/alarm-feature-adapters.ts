import {
  createFileAlarmStore,
  type FileAlarmStoreDependencies,
} from "../../adapters/local/file-alarm-store.js";
import { createInMemoryAlarmStore } from "../../adapters/local/in-memory-alarm-store.js";
import { createAlarmFeature } from "../../features/alarms/alarm-feature.js";
import { isRecord } from "../config/config-parse-utils.js";
import { resolveLocalStatePath } from "../local-state-path.js";
import {
  defineFeatureAdapterEntry,
  type FeatureRegistryEntry,
} from "../feature-adapter-registry.js";

export function createAlarmFeatureRegistryEntry(
  dependencies: FileAlarmStoreDependencies = {},
): FeatureRegistryEntry {
  return {
    adapters: {
      file: defineFeatureAdapterEntry({
        create: ({ adapterConfig, dependencies: runtimeDependencies }) =>
          createAlarmFeature(
            createFileAlarmStore({
              ...dependencies,
              filePath: resolveLocalStatePath(
                adapterConfig.filePath,
                runtimeDependencies.configDirectory,
              ),
            }),
          ),
        parseConfig: parseFileAlarmStoreConfig,
      }),
      local: defineFeatureAdapterEntry({
        create: () => createAlarmFeature(createInMemoryAlarmStore()),
        parseConfig: () => {},
      }),
    },
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
