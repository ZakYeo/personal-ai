import {
  createFileTaskStore,
  type FileTaskStoreDependencies,
} from "../../adapters/local/file-task-store.js";
import { createInMemoryTaskStore } from "../../adapters/local/in-memory-task-store.js";
import { createTaskFeature } from "../../features/tasks/task-feature.js";
import { isRecord } from "../config/config-parse-utils.js";
import {
  defineFeatureAdapterEntry,
  type FeatureRegistryEntry,
} from "../feature-adapter-registry.js";
import { resolveLocalStatePath } from "../local-state-path.js";

export function createTaskFeatureRegistryEntry(
  dependencies: FileTaskStoreDependencies = {},
): FeatureRegistryEntry {
  return {
    adapters: {
      file: defineFeatureAdapterEntry({
        create: ({ adapterConfig, dependencies: runtimeDependencies }) =>
          createTaskFeature(
            createFileTaskStore({
              ...dependencies,
              filePath: resolveLocalStatePath(
                adapterConfig.filePath,
                runtimeDependencies.configDirectory,
              ),
              now: () => runtimeDependencies.clock.now(),
            }),
          ),
        parseConfig: parseFileTaskStoreConfig,
      }),
      local: defineFeatureAdapterEntry({
        create: ({ dependencies: runtimeDependencies }) =>
          createTaskFeature(
            createInMemoryTaskStore({
              now: () => runtimeDependencies.clock.now(),
            }),
          ),
        parseConfig: () => {},
      }),
    },
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
