import { createInMemoryAlarmStore } from "../adapters/local/in-memory-alarm-store.js";
import { createAlarmFeature } from "../features/alarms/alarm-feature.js";
import { createCalendarFeature } from "../features/calendar/calendar-feature.js";
import { createMessagingFeature } from "../features/messaging/messaging-feature.js";
import type { FeaturePlugin } from "../ports/feature.js";
import type { LoadedRuntimeConfig } from "./config/config.js";
import { selectConfiguredRuntimeEntry } from "./runtime-selector.js";

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
  const adapterRegistry = Object.fromEntries(
    Object.entries(registry)
      .filter(([registryKey]) => registryKey.startsWith(`${featureId}:`))
      .map(([registryKey, factory]) => [
        registryKey.slice(featureId.length + 1),
        factory,
      ]),
  );
  const factory = selectConfiguredRuntimeEntry({
    configuredId: featureConfig.adapter,
    missingMessage: `Config feature "${featureId}".adapter must be set for enabled features.`,
    registry: adapterRegistry,
    unknownMessage: (adapterId) =>
      `Config feature "${featureId}" adapter "${adapterId}" is not registered.`,
  });

  return factory();
}
