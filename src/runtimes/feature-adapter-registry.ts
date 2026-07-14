import type { FeaturePlugin } from "../ports/feature.js";
import type { ClockPort } from "../ports/assistant.js";
import type { NotificationDeliveryPort } from "../ports/notification-delivery.js";
import type { RuntimeBackgroundTask } from "./background-task.js";

export interface FeatureAdapterDependencies {
  clock: ClockPort;
  configDirectory?: string;
  env: Record<string, string | undefined>;
  fetch: typeof fetch;
  notificationDelivery?: NotificationDeliveryPort;
}

interface FeatureAdapterContext<TAdapterConfig> {
  adapterConfig: TAdapterConfig;
  dependencies: FeatureAdapterDependencies;
}

interface FeatureAdapterDefinition<TAdapterConfig> {
  create(
    context: FeatureAdapterContext<TAdapterConfig>,
  ): FeaturePlugin | FeatureAdapterComposition;
  parseConfig(featureConfig: Record<string, unknown>): TAdapterConfig;
  validateStartup?(context: FeatureAdapterContext<TAdapterConfig>): void;
}

export interface ResolvedFeatureAdapter {
  create(
    dependencies: FeatureAdapterDependencies,
  ): FeaturePlugin | FeatureAdapterComposition;
  validateStartup?(dependencies: FeatureAdapterDependencies): void;
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
        create: (dependencies) => entry.create({ adapterConfig, dependencies }),
        ...(entry.validateStartup
          ? {
              validateStartup: (dependencies: FeatureAdapterDependencies) =>
                entry.validateStartup?.({ adapterConfig, dependencies }),
            }
          : {}),
      };
    },
  };
}
