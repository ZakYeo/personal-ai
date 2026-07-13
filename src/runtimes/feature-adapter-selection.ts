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
      featureConfig.resolvedAdapter?.validateStartup?.(dependencies);
    }
  }
}

function createAdapterBackedFeatures(
  config: LoadedRuntimeConfig,
  options: CreateConfiguredFeaturesOptions,
): ConfiguredFeatureSelection {
  return {
    features: Object.entries(config.features)
      .filter(([, featureConfig]) => featureConfig.enabled)
      .map(([featureId, featureConfig]) =>
        selectConfiguredFeatureAdapter(
          featureId,
          featureConfig,
          options.dependencies,
        ),
      ),
  };
}

function selectConfiguredFeatureAdapter(
  featureId: string,
  featureConfig: LoadedRuntimeConfig["features"][string],
  dependencies: FeatureAdapterDependencies,
): FeaturePlugin {
  if (!featureConfig.resolvedAdapter) {
    throw new Error(`Config feature "${featureId}" adapter was not resolved.`);
  }

  return featureConfig.resolvedAdapter.create(dependencies);
}
