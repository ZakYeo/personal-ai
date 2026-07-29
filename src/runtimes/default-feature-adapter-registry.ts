import type { FileAlarmStoreDependencies } from "../adapters/local/file-alarm-store.js";
import type { FileWeatherWatchStoreDependencies } from "../adapters/local/file-weather-watch-store.js";
import type { FileTaskStoreDependencies } from "../adapters/local/file-task-store.js";
import type { PersonalContextReaderPort } from "../ports/personal-context.js";
import type { NotificationDeliveryPort } from "../ports/notification-delivery.js";
import { createAlarmFeatureRegistryEntry } from "./feature-adapters/alarm-feature-adapters.js";
import { createCalendarFeatureRegistryEntry } from "./feature-adapters/calendar-feature-adapters.js";
import { createMessagingFeatureRegistryEntry } from "./feature-adapters/messaging-feature-adapters.js";
import { createInternetSearchFeatureRegistryEntry } from "./feature-adapters/internet-search-feature-adapters.js";
import { createWeatherFeatureRegistryEntry } from "./feature-adapters/weather-feature-adapters.js";
import { createTaskFeatureRegistryEntry } from "./feature-adapters/task-feature-adapters.js";
import type { FeatureAdapterRegistry } from "./feature-adapter-registry.js";

interface DefaultFeatureAdapterRegistryOptions {
  alarms?: {
    configDirectory?: string;
    notificationDelivery?: NotificationDeliveryPort;
    store?: FileAlarmStoreDependencies;
  };
  calendar?: {
    env?: Record<string, string | undefined>;
    fetch?: typeof fetch;
  };
  internetSearch?: {
    env?: Record<string, string | undefined>;
    fetch?: typeof fetch;
  };
  tasks?: {
    configDirectory?: string;
    notificationDelivery?: NotificationDeliveryPort;
    store?: FileTaskStoreDependencies;
  };
  weather?: {
    configDirectory?: string;
    fetch?: typeof fetch;
    notificationDelivery?: NotificationDeliveryPort;
    personalContextReader?: PersonalContextReaderPort;
    watchStore?: FileWeatherWatchStoreDependencies;
  };
}

export function createDefaultFeatureAdapterRegistry(
  options: DefaultFeatureAdapterRegistryOptions = {},
): FeatureAdapterRegistry {
  return {
    alarms: createAlarmFeatureRegistryEntry({
      ...options.alarms?.store,
      ...(options.alarms?.configDirectory
        ? { configDirectory: options.alarms.configDirectory }
        : {}),
      ...(options.alarms?.notificationDelivery
        ? { notificationDelivery: options.alarms.notificationDelivery }
        : {}),
    }),
    calendar: createCalendarFeatureRegistryEntry({
      env: options.calendar?.env ?? process.env,
      fetch: options.calendar?.fetch ?? globalThis.fetch,
    }),
    internetSearch: createInternetSearchFeatureRegistryEntry({
      env: options.internetSearch?.env ?? process.env,
      fetch: options.internetSearch?.fetch ?? globalThis.fetch,
    }),
    messaging: createMessagingFeatureRegistryEntry(),
    tasks: createTaskFeatureRegistryEntry({
      ...options.tasks?.store,
      ...(options.tasks?.configDirectory
        ? { configDirectory: options.tasks.configDirectory }
        : {}),
      ...(options.tasks?.notificationDelivery
        ? { notificationDelivery: options.tasks.notificationDelivery }
        : {}),
    }),
    weather: createWeatherFeatureRegistryEntry({
      fetch: options.weather?.fetch ?? globalThis.fetch,
      ...(options.weather?.configDirectory
        ? { configDirectory: options.weather.configDirectory }
        : {}),
      ...(options.weather?.notificationDelivery
        ? { notificationDelivery: options.weather.notificationDelivery }
        : {}),
      ...(options.weather?.personalContextReader
        ? { personalContextReader: options.weather.personalContextReader }
        : {}),
      ...(options.weather?.watchStore
        ? { watchStore: options.weather.watchStore }
        : {}),
    }),
  };
}

export function createRuntimeFeatureAdapterRegistry(dependencies: {
  configDirectory?: string;
  env: Record<string, string | undefined>;
  fetch: typeof fetch;
  notificationDelivery?: NotificationDeliveryPort;
}): FeatureAdapterRegistry {
  const localStateDependencies = {
    ...(dependencies.configDirectory
      ? { configDirectory: dependencies.configDirectory }
      : {}),
    ...(dependencies.notificationDelivery
      ? { notificationDelivery: dependencies.notificationDelivery }
      : {}),
  };

  return createDefaultFeatureAdapterRegistry({
    alarms: localStateDependencies,
    calendar: { env: dependencies.env, fetch: dependencies.fetch },
    internetSearch: { env: dependencies.env, fetch: dependencies.fetch },
    tasks: localStateDependencies,
    weather: {
      ...localStateDependencies,
      fetch: dependencies.fetch,
    },
  });
}
