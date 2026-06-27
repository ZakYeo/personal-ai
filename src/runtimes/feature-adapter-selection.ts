import { createInMemoryAlarmStore } from "../adapters/local/in-memory-alarm-store.js";
import { createGoogleCalendarAdapter } from "../adapters/google-calendar/google-calendar-adapter.js";
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
  env: Record<string, string | undefined>;
  fetch: typeof fetch;
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
  dependencies?: Partial<FeatureAdapterDependencies>;
  registry?: FeatureAdapterRegistry;
}

export function createConfiguredFeatures(
  config: LoadedRuntimeConfig,
  options: CreateConfiguredFeaturesOptions = {},
): FeaturePlugin[] {
  const dependencies = mergeFeatureAdapterDependencies(options.dependencies);
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
    env: process.env,
    fetch: globalThis.fetch,
  };
}

function mergeFeatureAdapterDependencies(
  overrides: Partial<FeatureAdapterDependencies> = {},
): FeatureAdapterDependencies {
  return {
    ...createFeatureAdapterDependencies(),
    ...overrides,
  };
}

function createDefaultFeatureAdapterRegistry(): FeatureAdapterRegistry {
  return {
    alarms: {
      local: (context) => createAlarmFeature(context.dependencies.alarmStore),
    },
    calendar: {
      google: (context) => {
        if (!context.featureConfig.google) {
          throw new Error(
            'Config feature "calendar".google must be configured.',
          );
        }

        return createCalendarFeature(
          createGoogleCalendarAdapter({
            config: context.featureConfig.google,
            env: context.dependencies.env,
            fetch: context.dependencies.fetch,
          }),
        );
      },
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
