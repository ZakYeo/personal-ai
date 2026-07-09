import type { FeaturePlugin } from "../ports/feature.js";
import type { ParsedFeatureConfig } from "./config/feature-config.js";

export interface FeatureAdapterDependencies {
  env: Record<string, string | undefined>;
  fetch: typeof fetch;
}

interface FeatureAdapterContext<TAdapterConfig> {
  adapterConfig: TAdapterConfig;
  dependencies: FeatureAdapterDependencies;
}

interface FeatureAdapterDefinition<TAdapterConfig> {
  create(context: FeatureAdapterContext<TAdapterConfig>): FeaturePlugin;
  resolveConfig(context: {
    featureConfig: ParsedFeatureConfig;
    rawFeatureConfig: Record<string, unknown>;
  }): TAdapterConfig;
}

export interface FeatureAdapterEntry {
  create(
    featureConfig: ParsedFeatureConfig,
    rawFeatureConfig: Record<string, unknown>,
    dependencies: FeatureAdapterDependencies,
  ): FeaturePlugin;
}

export interface FeatureRegistryEntry {
  adapters: Record<string, FeatureAdapterEntry>;
}

export type FeatureAdapterRegistry = Record<string, FeatureRegistryEntry>;

export function defineFeatureAdapterEntry<TAdapterConfig>(
  entry: FeatureAdapterDefinition<TAdapterConfig>,
): FeatureAdapterEntry {
  return {
    create: (featureConfig, rawFeatureConfig, dependencies) => {
      return entry.create({
        adapterConfig: entry.resolveConfig({
          featureConfig,
          rawFeatureConfig,
        }),
        dependencies,
      });
    },
  };
}
