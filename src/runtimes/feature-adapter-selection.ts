import {
  createCapabilityInfoCatalogFeature,
  createCapabilityInfoFeature,
} from "../features/assistant/capability-info-feature.js";
import { createCapabilityCatalog } from "../ports/capability-catalog.js";
import type { FeaturePlugin } from "../ports/feature.js";
import type { LoadedRuntimeConfig } from "./config/config.js";
import type { FeatureAdapterDependencies } from "./feature-adapter-registry.js";

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
  const configuredFeatures = createAdapterBackedFeatures(
    config,
    options,
  ).features;
  const catalog = createCapabilityCatalog([
    ...configuredFeatures,
    createCapabilityInfoCatalogFeature(),
  ]);
  const capabilityInfoFeature = createCapabilityInfoFeature(catalog);

  return {
    features: [...configuredFeatures, capabilityInfoFeature],
  };
}

export function validateConfiguredFeatureAdapters(
  config: LoadedRuntimeConfig,
  dependencies: FeatureAdapterDependencies,
): void {
  for (const featureConfig of Object.values(config.features)) {
    if (featureConfig.enabled) {
      featureConfig.resolvedAdapter.validateStartup?.(dependencies);
    }
  }
}

function createAdapterBackedFeatures(
  config: LoadedRuntimeConfig,
  options: CreateConfiguredFeaturesOptions,
): ConfiguredFeatureSelection {
  return {
    features: Object.entries(config.features).flatMap(
      ([featureId, featureConfig]) =>
        featureConfig.enabled
          ? [
              selectConfiguredFeatureAdapter(
                featureId,
                featureConfig,
                options.dependencies,
              ),
            ]
          : [],
    ),
  };
}

function selectConfiguredFeatureAdapter(
  featureId: string,
  featureConfig: Extract<
    LoadedRuntimeConfig["features"][string],
    { enabled: true }
  >,
  dependencies: FeatureAdapterDependencies,
): FeaturePlugin {
  const feature = featureConfig.resolvedAdapter.create(dependencies);

  if (feature.id !== featureId) {
    throw new Error(
      `Config feature "${featureId}" adapter created feature "${feature.id}" instead.`,
    );
  }

  return feature;
}
