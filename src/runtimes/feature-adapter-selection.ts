import { createInMemoryAlarmStore } from "../adapters/local/in-memory-alarm-store.js";
import { createGoogleCalendarAdapter } from "../adapters/google-calendar/google-calendar-adapter.js";
import { createMockCalendar } from "../adapters/mock/mock-calendar.js";
import {
  alarmDeterministicIntentRules,
  createAlarmFeature,
} from "../features/alarms/alarm-feature.js";
import {
  calendarDeterministicIntentRules,
  createCalendarFeature,
} from "../features/calendar/calendar-feature.js";
import {
  createMessagingFeature,
  messagingDeterministicIntentRules,
} from "../features/messaging/messaging-feature.js";
import type { AlarmStore } from "../ports/alarm-store.js";
import type { GoogleCalendarConfig } from "../ports/calendar.js";
import type {
  DeterministicFeatureRule,
  FeaturePlugin,
} from "../ports/feature.js";
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

interface FeatureAdapterEntry {
  create(context: FeatureAdapterContext): FeaturePlugin;
}

export interface FeatureRegistryEntry {
  adapters: Record<string, FeatureAdapterEntry>;
  deterministicRules?: DeterministicFeatureRule[];
}

export type FeatureAdapterRegistry = Record<string, FeatureRegistryEntry>;

interface ConfiguredFeatureSelection {
  deterministicIntentRules: DeterministicFeatureRule[];
  features: FeaturePlugin[];
}

interface CreateConfiguredFeaturesOptions {
  dependencies?: Partial<FeatureAdapterDependencies>;
  registry?: FeatureAdapterRegistry;
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
    deterministicIntentRules: createConfiguredDeterministicIntentRules(
      config,
      registry,
    ),
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
      adapters: {
        local: {
          create: (context) =>
            createAlarmFeature(context.dependencies.alarmStore),
        },
      },
      deterministicRules: alarmDeterministicIntentRules,
    },
    calendar: {
      adapters: {
        google: {
          create: (context) => {
            const adapterConfig = requireCalendarGoogleAdapterConfig(
              context.featureConfig,
            );

            return createCalendarFeature(
              createGoogleCalendarAdapter({
                config: adapterConfig.google,
                env: context.dependencies.env,
                fetch: context.dependencies.fetch,
              }),
            );
          },
        },
        mock: {
          create: () => createCalendarFeature(createMockCalendar()),
        },
      },
      deterministicRules: calendarDeterministicIntentRules,
    },
    messaging: {
      adapters: {
        mock: {
          create: () => createMessagingFeature(),
        },
      },
      deterministicRules: messagingDeterministicIntentRules,
    },
  };
}

function createConfiguredDeterministicIntentRules(
  config: LoadedRuntimeConfig,
  registry: FeatureAdapterRegistry,
): DeterministicFeatureRule[] {
  return Object.keys(config.features).flatMap(
    (featureId) => registry[featureId]?.deterministicRules ?? [],
  );
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

  return adapter.create({
    dependencies,
    featureConfig,
  });
}

interface CalendarGoogleAdapterConfig {
  google: GoogleCalendarConfig;
}

function requireCalendarGoogleAdapterConfig(
  featureConfig: LoadedRuntimeConfig["features"][string],
): CalendarGoogleAdapterConfig {
  if (!featureConfig.google) {
    throw new Error('Config feature "calendar".google must be configured.');
  }

  return {
    google: featureConfig.google,
  };
}
