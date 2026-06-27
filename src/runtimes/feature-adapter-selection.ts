import { createInMemoryAlarmStore } from "../adapters/local/in-memory-alarm-store.js";
import { createMockCalendar } from "../adapters/mock/mock-calendar.js";
import { createAlarmFeature } from "../features/alarms/alarm-feature.js";
import { createCalendarFeature } from "../features/calendar/calendar-feature.js";
import { createMessagingFeature } from "../features/messaging/messaging-feature.js";
import type { AlarmStore } from "../ports/alarm-store.js";
import type { FeaturePlugin } from "../ports/feature.js";
import type { LoadedRuntimeConfig } from "./config/config.js";
import { selectConfiguredRuntimeEntry } from "./runtime-selector.js";

export interface FeatureAdapterDependencies {
  alarmStore: AlarmStore;
}

export interface FeatureAdapterContext {
  dependencies: FeatureAdapterDependencies;
  featureConfig: LoadedRuntimeConfig["features"][string];
}

export type FeatureAdapterFactory = (
  context: FeatureAdapterContext,
) => FeaturePlugin;

export type FeatureAdapterRegistry = Record<
  string,
  Record<string, FeatureAdapterFactory>
>;

interface CreateConfiguredFeaturesOptions {
  dependencies?: FeatureAdapterDependencies;
  registry?: FeatureAdapterRegistry;
}

export function createConfiguredFeatures(
  config: LoadedRuntimeConfig,
  options: CreateConfiguredFeaturesOptions = {},
): FeaturePlugin[] {
  const dependencies =
    options.dependencies ?? createFeatureAdapterDependencies();
  const registry = options.registry ?? createDefaultFeatureAdapterRegistry();

  return Object.entries(config.features)
    .filter(([, featureConfig]) => featureConfig.enabled)
    .map(([featureId, featureConfig]) =>
      selectConfiguredFeatureAdapter(featureId, featureConfig, registry, {
        dependencies,
        featureConfig,
      }),
    );
}

function createFeatureAdapterDependencies(): FeatureAdapterDependencies {
  return {
    alarmStore: createInMemoryAlarmStore(),
  };
}

function createDefaultFeatureAdapterRegistry(): FeatureAdapterRegistry {
  return {
    alarms: {
      local: (context) => createAlarmFeature(context.dependencies.alarmStore),
    },
    calendar: {
      mock: () => createCalendarFeature(createMockCalendar()),
    },
    messaging: {
      mock: () => createMessagingFeature(),
    },
  };
}

function selectConfiguredFeatureAdapter(
  featureId: string,
  featureConfig: LoadedRuntimeConfig["features"][string],
  registry: FeatureAdapterRegistry,
  context: FeatureAdapterContext,
): FeaturePlugin {
  const adapterRegistry = registry[featureId];

  if (!adapterRegistry) {
    throw new Error(`Config feature "${featureId}" is not registered.`);
  }

  const factory = selectConfiguredRuntimeEntry({
    configuredId: featureConfig.adapter,
    missingMessage: `Config feature "${featureId}".adapter must be set for enabled features.`,
    registry: adapterRegistry,
    unknownMessage: (adapterId) =>
      `Config feature "${featureId}" adapter "${adapterId}" is not registered.`,
  });

  return factory(context);
}
