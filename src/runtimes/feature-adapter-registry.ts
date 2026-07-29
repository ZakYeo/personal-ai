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

interface FeatureAdapterBinding<TAdapterConfig> {
  create(
    context: FeatureAdapterContext<TAdapterConfig>,
  ): FeaturePlugin | FeatureAdapterComposition;
  validateStartup?(adapterConfig: TAdapterConfig): void;
}

interface FeatureAdapterEntryDefinition<
  TAdapterConfig,
> extends FeatureAdapterBinding<TAdapterConfig> {
  parseConfig(featureConfig: Record<string, unknown>): TAdapterConfig;
}

export interface ResolvedFeatureAdapter {
  create(
    runtime: FeatureAdapterRuntimeContext,
  ): FeaturePlugin | FeatureAdapterComposition;
  validateStartup?(): void;
}

export interface FeatureAdapterComposition {
  backgroundTasks?: RuntimeBackgroundTask[];
  feature: FeaturePlugin;
}

export interface FeatureAdapterEntry {
  parse(featureConfig: Record<string, unknown>): ResolvedFeatureAdapter;
  rebind(resolved: ResolvedFeatureAdapter): ResolvedFeatureAdapter;
}

export interface FeatureRegistryEntry {
  adapters: Record<string, FeatureAdapterEntry>;
}

export type FeatureAdapterRegistry = Record<string, FeatureRegistryEntry>;

export function defineFeatureAdapter<TAdapterConfig>(definition: {
  parseConfig(featureConfig: Record<string, unknown>): TAdapterConfig;
}) {
  const parsedConfigs = new WeakMap<
    ResolvedFeatureAdapter,
    { value: TAdapterConfig }
  >();

  return {
    bind(binding: FeatureAdapterBinding<TAdapterConfig>): FeatureAdapterEntry {
      const resolve = (
        adapterConfig: TAdapterConfig,
      ): ResolvedFeatureAdapter => {
        const resolved: ResolvedFeatureAdapter = {
          create: (runtime) =>
            binding.create({
              adapterConfig,
              runtime,
            }),
          ...(binding.validateStartup
            ? {
                validateStartup: () => binding.validateStartup?.(adapterConfig),
              }
            : {}),
        };
        parsedConfigs.set(resolved, { value: adapterConfig });
        return resolved;
      };

      return {
        parse: (featureConfig) =>
          resolve(definition.parseConfig(featureConfig)),
        rebind: (resolved) => {
          const parsedConfig = parsedConfigs.get(resolved);
          return parsedConfig ? resolve(parsedConfig.value) : resolved;
        },
      };
    },
  };
}

export function defineFeatureAdapterEntry<TAdapterConfig>(
  entry: FeatureAdapterEntryDefinition<TAdapterConfig>,
): FeatureAdapterEntry {
  return defineFeatureAdapter({
    parseConfig: (featureConfig) => entry.parseConfig(featureConfig),
  }).bind(entry);
}
