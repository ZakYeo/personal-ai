import { createAlarmFeatureRegistryEntry } from "./feature-adapters/alarm-feature-adapters.js";
import { createCalendarFeatureRegistryEntry } from "./feature-adapters/calendar-feature-adapters.js";
import { createMessagingFeatureRegistryEntry } from "./feature-adapters/messaging-feature-adapters.js";
import type { FeatureAdapterRegistry } from "./feature-adapter-registry.js";

export function createDefaultFeatureAdapterRegistry(): FeatureAdapterRegistry {
  return {
    alarms: createAlarmFeatureRegistryEntry(),
    calendar: createCalendarFeatureRegistryEntry(),
    messaging: createMessagingFeatureRegistryEntry(),
  };
}
