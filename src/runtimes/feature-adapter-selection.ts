import { createInMemoryAlarmStore } from "../adapters/local/in-memory-alarm-store.js";
import { createAlarmFeature } from "../features/alarms/alarm-feature.js";
import { createCalendarFeature } from "../features/calendar/calendar-feature.js";
import { createMessagingFeature } from "../features/messaging/messaging-feature.js";
import type { FeaturePlugin } from "../ports/feature.js";
import type { LoadedRuntimeConfig } from "./config/config.js";

export function createConfiguredFeatures(
  config: LoadedRuntimeConfig,
): FeaturePlugin[] {
  const alarmStore = createInMemoryAlarmStore();
  const featureFactories: Record<string, () => FeaturePlugin> = {
    "alarms:local": () => createAlarmFeature(alarmStore),
    "calendar:mock": createCalendarFeature,
    "messaging:mock": createMessagingFeature,
  };

  return Object.entries(config.features)
    .filter(([, featureConfig]) => featureConfig.enabled)
    .map(([featureId, featureConfig]) =>
      selectConfiguredFeatureAdapter(
        featureId,
        featureConfig,
        featureFactories,
      ),
    );
}

function selectConfiguredFeatureAdapter(
  featureId: string,
  featureConfig: LoadedRuntimeConfig["features"][string],
  registry: Record<string, () => FeaturePlugin>,
): FeaturePlugin {
  if (!featureConfig.adapter) {
    throw new Error(
      `Config feature "${featureId}".adapter must be set for enabled features.`,
    );
  }

  const factory = registry[`${featureId}:${featureConfig.adapter}`];

  if (!factory) {
    throw new Error(
      `Config feature "${featureId}" adapter "${featureConfig.adapter}" is not registered.`,
    );
  }

  return factory();
}
