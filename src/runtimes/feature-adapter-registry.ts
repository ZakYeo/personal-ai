import type { FeaturePlugin } from "../ports/feature.js";
import type { ClockPort } from "../ports/assistant.js";
import type { RuntimeBackgroundTask } from "./background-task.js";

export interface FeatureAdapterRuntimeContext {
  clock: ClockPort;
}

interface FeatureAdapterContext<TAdapterConfig> {
  adapterConfig: TAdapterConfig;
  runtime: FeatureAdapterRuntimeContext;
}

interface FeatureAdapterDefinition<TAdapterConfig> {
  create(
    context: FeatureAdapterContext<TAdapterConfig>,
  ): FeaturePlugin | FeatureAdapterComposition;
  parseConfig(featureConfig: Record<string, unknown>): TAdapterConfig;
  validateStartup?(adapterConfig: TAdapterConfig): void;
}

export interface ResolvedFeatureAdapter {
  create(
    runtime: FeatureAdapterRuntimeContext,
  ): FeaturePlugin | FeatureAdapterComposition;
  validateStartup?(): void;
  rebind(entry: FeatureAdapterEntry): ResolvedFeatureAdapter;
}

export interface FeatureAdapterComposition {
  backgroundTasks?: RuntimeBackgroundTask[];
  feature: FeaturePlugin;
}

export interface FeatureAdapterEntry {
  parse(featureConfig: Record<string, unknown>): ResolvedFeatureAdapter;
}

export interface FeatureRegistryEntry {
  adapters: Record<string, FeatureAdapterEntry>;
}

export type FeatureAdapterRegistry = Record<string, FeatureRegistryEntry>;

export function defineFeatureAdapterEntry<TAdapterConfig>(
  entry: FeatureAdapterDefinition<TAdapterConfig>,
): FeatureAdapterEntry {
  return {
    parse: (featureConfig) => {
      const adapterConfig = entry.parseConfig(featureConfig);
      return {
        create: (runtime) =>
          entry.create({
            adapterConfig,
            runtime,
          }),
        ...(entry.validateStartup
          ? {
              validateStartup: () => entry.validateStartup?.(adapterConfig),
            }
          : {}),
        rebind: (replacement) => replacement.parse(featureConfig),
      };
    },
  };
}
