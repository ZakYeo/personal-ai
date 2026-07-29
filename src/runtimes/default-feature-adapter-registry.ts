import type { FileAlarmStoreDependencies } from "../adapters/local/file-alarm-store.js";
import type { FileWeatherWatchStoreDependencies } from "../adapters/local/file-weather-watch-store.js";
import type { FileTaskStoreDependencies } from "../adapters/local/file-task-store.js";
import type { PersonalContextReaderPort } from "../ports/personal-context.js";
import { createAlarmFeatureRegistryEntry } from "./feature-adapters/alarm-feature-adapters.js";
import { createCalendarFeatureRegistryEntry } from "./feature-adapters/calendar-feature-adapters.js";
import { createMessagingFeatureRegistryEntry } from "./feature-adapters/messaging-feature-adapters.js";
import { createInternetSearchFeatureRegistryEntry } from "./feature-adapters/internet-search-feature-adapters.js";
import { createWeatherFeatureRegistryEntry } from "./feature-adapters/weather-feature-adapters.js";
import { createTaskFeatureRegistryEntry } from "./feature-adapters/task-feature-adapters.js";
import type { FeatureAdapterRegistry } from "./feature-adapter-registry.js";

interface DefaultFeatureAdapterRegistryOptions {
  alarms?: { store?: FileAlarmStoreDependencies };
  tasks?: { store?: FileTaskStoreDependencies };
  weather?: {
    personalContextReader?: PersonalContextReaderPort;
    watchStore?: FileWeatherWatchStoreDependencies;
  };
}

export function createDefaultFeatureAdapterRegistry(
  options: DefaultFeatureAdapterRegistryOptions = {},
): FeatureAdapterRegistry {
  return {
    alarms: createAlarmFeatureRegistryEntry(options.alarms?.store),
    calendar: createCalendarFeatureRegistryEntry(),
    internetSearch: createInternetSearchFeatureRegistryEntry(),
    messaging: createMessagingFeatureRegistryEntry(),
    tasks: createTaskFeatureRegistryEntry(options.tasks?.store),
    weather: createWeatherFeatureRegistryEntry({
      ...(options.weather?.personalContextReader
        ? { personalContextReader: options.weather.personalContextReader }
        : {}),
      ...(options.weather?.watchStore
        ? { watchStore: options.weather.watchStore }
        : {}),
    }),
  };
}
