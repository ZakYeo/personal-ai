import { createInMemoryAlarmStore } from "../adapters/local/in-memory-alarm-store.js";
import { createGoogleCalendarAdapter } from "../adapters/google-calendar/google-calendar-adapter.js";
import { createMockCalendar } from "../adapters/mock/mock-calendar.js";
import { createCapabilityInfoFeature } from "../features/assistant/capability-info-feature.js";
import { createAlarmFeature } from "../features/alarms/alarm-feature.js";
import { createCalendarFeature } from "../features/calendar/calendar-feature.js";
import { createMessagingFeature } from "../features/messaging/messaging-feature.js";
import type { GoogleCalendarConfig } from "../ports/calendar.js";
import type { FeaturePlugin } from "../ports/feature.js";
import { parseCalendarFeatureConfig } from "./config/calendar-feature-config.js";
import type { LoadedRuntimeConfig } from "./config/config.js";
import type { ParsedFeatureConfig } from "./config/feature-config.js";
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
  resolveConfig(context: {
    featureConfig: ParsedFeatureConfig;
    rawFeatureConfig: Record<string, unknown>;
  }): TAdapterConfig;
}

interface FeatureAdapterEntry {
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

interface ConfiguredFeatureSelection {
  features: FeaturePlugin[];
}

interface CreateConfiguredFeaturesOptions {
  dependencies: FeatureAdapterDependencies;
  registry?: FeatureAdapterRegistry;
}

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

export function createConfiguredFeatures(
  config: LoadedRuntimeConfig,
  options: CreateConfiguredFeaturesOptions,
): FeaturePlugin[] {
  return createAdapterBackedFeatures(config, options).features;
}

export function createConfiguredFeatureSelection(
  config: LoadedRuntimeConfig,
  options: CreateConfiguredFeaturesOptions,
): ConfiguredFeatureSelection {
  const registry = options.registry ?? createDefaultFeatureAdapterRegistry();
  let features: FeaturePlugin[] = [];

  const configuredFeatures = createAdapterBackedFeatures(config, {
    ...options,
    registry,
  }).features;
  const capabilityInfoFeature = createCapabilityInfoFeature(() => features);

  features = [...configuredFeatures, capabilityInfoFeature];

  return {
    features,
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

interface CalendarGoogleAdapterConfig {
  google: GoogleCalendarConfig;
}

function requireCalendarGoogleAdapterConfig(context: {
  rawFeatureConfig: Record<string, unknown>;
}): CalendarGoogleAdapterConfig {
  const featureConfig = parseCalendarFeatureConfig(context.rawFeatureConfig);

  if (!featureConfig.google) {
    throw new Error('Config feature "calendar".google must be configured.');
  }

  return {
    google: featureConfig.google,
  };
}
