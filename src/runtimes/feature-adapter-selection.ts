import { createCapabilityInfoFeature } from "../features/assistant/capability-info-feature.js";
import {
  createCapabilityRoutingIndex,
  type CapabilityRoutingIndex,
} from "../application/capability-catalog.js";
import type { FeaturePlugin } from "../ports/feature.js";
import type { LoadedRuntimeConfig } from "./config/config.js";
import type { FeatureAdapterRuntimeContext } from "./feature-adapter-registry.js";
import type { RuntimeBackgroundTask } from "./background-task.js";
import {
  createRuntimeServiceRegistry,
  type RuntimeServiceRegistry,
} from "./runtime-service-registry.js";

export {
  defineFeatureAdapterEntry,
  type FeatureAdapterRuntimeContext,
  type FeatureAdapterRegistry,
} from "./feature-adapter-registry.js";

interface ConfiguredFeatureSelection {
  backgroundTasks: RuntimeBackgroundTask[];
  capabilityRouting: CapabilityRoutingIndex<FeaturePlugin>;
  features: FeaturePlugin[];
  services: RuntimeServiceRegistry;
}

interface CreateConfiguredFeaturesOptions {
  runtime: FeatureAdapterRuntimeContext;
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
  const configuredAdapters = createAdapterBackedFeatures(config, options);
  const configuredFeatures = configuredAdapters.compositions.map(
    ({ feature }) => feature,
  );
  const backgroundTasks = configuredAdapters.compositions.flatMap(
    ({ backgroundTasks }) => backgroundTasks ?? [],
  );
  const capabilityInfoFeature = createCapabilityInfoFeature();
  const features = [...configuredFeatures, capabilityInfoFeature];
  const capabilityRouting = createCapabilityRoutingIndex(features);

  return {
    backgroundTasks,
    capabilityRouting,
    features,
    services: configuredAdapters.services,
  };
}

export function validateConfiguredFeatureAdapters(
  config: LoadedRuntimeConfig,
): void {
  for (const featureConfig of Object.values(config.features)) {
    if (featureConfig.enabled) {
      featureConfig.resolvedAdapter.validateStartup?.();
    }
  }
}

function createAdapterBackedFeatures(
  config: LoadedRuntimeConfig,
  options: CreateConfiguredFeaturesOptions,
): {
  compositions: Array<{
    backgroundTasks?: RuntimeBackgroundTask[];
    feature: FeaturePlugin;
  }>;
  services: RuntimeServiceRegistry;
} {
  const enabled = Object.entries(config.features).filter(
    (
      entry,
    ): entry is [
      string,
      Extract<LoadedRuntimeConfig["features"][string], { enabled: true }>,
    ] => entry[1].enabled,
  );
  const services = createRuntimeServiceRegistry(
    enabled.flatMap(
      ([, featureConfig]) =>
        featureConfig.resolvedAdapter.provideServices?.(options.runtime) ?? [],
    ),
  );
  return {
    compositions: enabled.map(([featureId, featureConfig]) =>
      selectConfiguredFeatureAdapter(
        featureId,
        featureConfig,
        options.runtime,
        services,
      ),
    ),
    services,
  };
}

function selectConfiguredFeatureAdapter(
  featureId: string,
  featureConfig: Extract<
    LoadedRuntimeConfig["features"][string],
    { enabled: true }
  >,
  runtime: FeatureAdapterRuntimeContext,
  services: RuntimeServiceRegistry,
): { backgroundTasks?: RuntimeBackgroundTask[]; feature: FeaturePlugin } {
  const created = featureConfig.resolvedAdapter.create(runtime, services);
  const composition = isFeatureAdapterComposition(created)
    ? created
    : { feature: created };
  const { feature } = composition;

  if (feature.id !== featureId) {
    throw new Error(
      `Config feature "${featureId}" adapter created feature "${feature.id}" instead.`,
    );
  }

  return composition;
}

function isFeatureAdapterComposition(
  created: ReturnType<
    Extract<
      LoadedRuntimeConfig["features"][string],
      { enabled: true }
    >["resolvedAdapter"]["create"]
  >,
): created is {
  backgroundTasks?: RuntimeBackgroundTask[];
  feature: FeaturePlugin;
} {
  return "feature" in created;
}
