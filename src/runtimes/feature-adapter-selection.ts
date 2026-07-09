import {
  createCapabilityInfoCatalogFeature,
  createCapabilityInfoFeature,
} from "../features/assistant/capability-info-feature.js";
import { createCapabilityCatalog } from "../ports/capability-catalog.js";
import type { FeaturePlugin } from "../ports/feature.js";
import type { LoadedRuntimeConfig } from "./config/config.js";
import type { ParsedFeatureConfig } from "./config/feature-config.js";
import { createDefaultFeatureAdapterRegistry } from "./default-feature-adapter-registry.js";
import {
  type FeatureAdapterDependencies,
  type FeatureAdapterRegistry,
} from "./feature-adapter-registry.js";
import { selectConfiguredRuntimeEntry } from "./runtime-selector.js";

export {
  defineFeatureAdapterEntry,
  type FeatureAdapterDependencies,
  type FeatureAdapterRegistry,
} from "./feature-adapter-registry.js";

interface ConfiguredFeatureSelection {
  features: FeaturePlugin[];
}

interface CreateConfiguredFeaturesOptions {
  dependencies: FeatureAdapterDependencies;
  registry?: FeatureAdapterRegistry;
}

export function createConfiguredFeatures(
  config: LoadedRuntimeConfig,
  options: CreateConfiguredFeaturesOptions,
): FeaturePlugin[] {
  return createConfiguredFeatureSelection(config, options).features;
}

export function createConfiguredFeatureSelection(
  config: LoadedRuntimeConfig,
  options: CreateConfiguredFeaturesOptions,
): ConfiguredFeatureSelection {
  const registry = options.registry ?? createDefaultFeatureAdapterRegistry();
  const configuredFeatures = createAdapterBackedFeatures(config, {
    ...options,
    registry,
  }).features;
  const catalog = createCapabilityCatalog([
    ...configuredFeatures,
    createCapabilityInfoCatalogFeature(),
  ]);
  const capabilityInfoFeature = createCapabilityInfoFeature(catalog);

  return {
    features: [...configuredFeatures, capabilityInfoFeature],
  };
}

function createAdapterBackedFeatures(
  config: LoadedRuntimeConfig,
  options: CreateConfiguredFeaturesOptions,
): ConfiguredFeatureSelection {
  const registry = options.registry ?? createDefaultFeatureAdapterRegistry();

  return {
    features: Object.entries(config.features)
      .filter(([, featureConfig]) => featureConfig.enabled)
      .map(([featureId, featureConfig]) =>
        selectConfiguredFeatureAdapter(
          featureId,
          featureConfig,
          config.rawFeatures?.[featureId] ?? {},
          registry,
          options.dependencies,
        ),
      ),
  };
}

function selectConfiguredFeatureAdapter(
  featureId: string,
  featureConfig: ParsedFeatureConfig,
  rawFeatureConfig: Record<string, unknown>,
  registry: FeatureAdapterRegistry,
  dependencies: FeatureAdapterDependencies,
): FeaturePlugin {
  const featureRegistry = registry[featureId];

  if (!featureRegistry) {
    throw new Error(`Config feature "${featureId}" is not registered.`);
  }

  const adapter = selectConfiguredRuntimeEntry({
    configuredId: featureConfig.adapter,
    missingMessage: `Config feature "${featureId}".adapter must be set for enabled features.`,
    registry: featureRegistry.adapters,
    unknownMessage: (adapterId) =>
      `Config feature "${featureId}" adapter "${adapterId}" is not registered.`,
  });

  return adapter.create(featureConfig, rawFeatureConfig, dependencies);
}
