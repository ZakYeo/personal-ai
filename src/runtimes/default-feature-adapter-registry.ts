import type { FileAlarmStoreDependencies } from "../adapters/local/file-alarm-store.js";
import { createAlarmFeatureRegistryEntry } from "./feature-adapters/alarm-feature-adapters.js";
import { createCalendarFeatureRegistryEntry } from "./feature-adapters/calendar-feature-adapters.js";
import { createMessagingFeatureRegistryEntry } from "./feature-adapters/messaging-feature-adapters.js";
import type { FeatureAdapterRegistry } from "./feature-adapter-registry.js";

interface DefaultFeatureAdapterRegistryOptions {
  alarmStore?: FileAlarmStoreDependencies;
}

export function createDefaultFeatureAdapterRegistry(
  options: DefaultFeatureAdapterRegistryOptions = {},
): FeatureAdapterRegistry {
  return {
    alarms: createAlarmFeatureRegistryEntry(options.alarmStore),
    calendar: createCalendarFeatureRegistryEntry(),
    messaging: createMessagingFeatureRegistryEntry(),
  };
}
