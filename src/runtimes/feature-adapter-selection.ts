import { createInMemoryAlarmStore } from "../adapters/local/in-memory-alarm-store.js";
import { createGoogleCalendarAdapter } from "../adapters/google-calendar/google-calendar-adapter.js";
import { createMockCalendar } from "../adapters/mock/mock-calendar.js";
import { createAlarmFeature } from "../features/alarms/alarm-feature.js";
import { createCalendarFeature } from "../features/calendar/calendar-feature.js";
import { createMessagingFeature } from "../features/messaging/messaging-feature.js";
import type { GoogleCalendarConfig } from "../ports/calendar.js";
import type { FeaturePlugin } from "../ports/feature.js";
import { parseCalendarFeatureConfig } from "./config/calendar-feature-config.js";
import type { LoadedRuntimeConfig } from "./config/config.js";
import { selectConfiguredRuntimeEntry } from "./runtime-selector.js";

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
  resolveConfig(
    featureConfig: LoadedRuntimeConfig["features"][string],
  ): TAdapterConfig;
}

interface FeatureAdapterEntry {
  create(
    featureConfig: LoadedRuntimeConfig["features"][string],
    dependencies: FeatureAdapterDependencies,
  ): FeaturePlugin;
}

export interface FeatureRegistryEntry {
  adapters: Record<string, FeatureAdapterEntry>;
}

export type FeatureAdapterRegistry = Record<string, FeatureRegistryEntry>;

interface ConfiguredFeatureSelection {
  features: FeaturePlugin[];
}

interface CreateConfiguredFeaturesOptions {
  dependencies?: Partial<FeatureAdapterDependencies>;
  registry?: FeatureAdapterRegistry;
}

export function defineFeatureAdapterEntry<TAdapterConfig>(
  entry: FeatureAdapterDefinition<TAdapterConfig>,
): FeatureAdapterEntry {
  return {
    create: (featureConfig, dependencies) =>
      entry.create({
        adapterConfig: entry.resolveConfig(featureConfig),
        dependencies,
      }),
  };
}

export function createConfiguredFeatures(
  config: LoadedRuntimeConfig,
  options: CreateConfiguredFeaturesOptions = {},
): FeaturePlugin[] {
  return createConfiguredFeatureSelection(config, options).features;
}

export function createConfiguredFeatureSelection(
  config: LoadedRuntimeConfig,
  options: CreateConfiguredFeaturesOptions = {},
): ConfiguredFeatureSelection {
  const dependencies = mergeFeatureAdapterDependencies(options.dependencies);
  const registry = options.registry ?? createDefaultFeatureAdapterRegistry();

  return {
    features: Object.entries(config.features)
      .filter(([, featureConfig]) => featureConfig.enabled)
      .map(([featureId, featureConfig]) =>
        selectConfiguredFeatureAdapter(
          featureId,
          featureConfig,
          registry,
          dependencies,
        ),
      ),
  };
}

function createFeatureAdapterDependencies(): FeatureAdapterDependencies {
  return {
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
      adapters: {
        local: defineFeatureAdapterEntry({
          create: () => createAlarmFeature(createInMemoryAlarmStore()),
          resolveConfig: () => {},
        }),
      },
    },
    calendar: {
      adapters: {
        google: defineFeatureAdapterEntry({
          create: (context) => {
            return createCalendarFeature(
              createGoogleCalendarAdapter({
                config: context.adapterConfig.google,
                env: context.dependencies.env,
                fetch: context.dependencies.fetch,
              }),
            );
          },
          resolveConfig: requireCalendarGoogleAdapterConfig,
        }),
        mock: defineFeatureAdapterEntry({
          create: () => createCalendarFeature(createMockCalendar()),
          resolveConfig: () => {},
        }),
      },
    },
    messaging: {
      adapters: {
        mock: defineFeatureAdapterEntry({
          create: () => createMessagingFeature(),
          resolveConfig: () => {},
        }),
      },
    },
  };
}

function selectConfiguredFeatureAdapter(
  featureId: string,
  featureConfig: LoadedRuntimeConfig["features"][string],
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

  return adapter.create(featureConfig, dependencies);
}

interface CalendarGoogleAdapterConfig {
  google: GoogleCalendarConfig;
}

function requireCalendarGoogleAdapterConfig(
  featureConfig: LoadedRuntimeConfig["features"][string],
): CalendarGoogleAdapterConfig {
  const calendarConfig = parseCalendarFeatureConfig(featureConfig);

  if (!calendarConfig.google) {
    throw new Error('Config feature "calendar".google must be configured.');
  }

  return {
    google: calendarConfig.google,
  };
}
