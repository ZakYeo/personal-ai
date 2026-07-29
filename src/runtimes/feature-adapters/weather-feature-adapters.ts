import {
  createFileWeatherWatchStore,
  type FileWeatherWatchStoreDependencies,
} from "../../adapters/local/file-weather-watch-store.js";
import { createInMemoryWeatherWatchStore } from "../../adapters/local/in-memory-weather-watch-store.js";
import { createMockWeatherProvider } from "../../adapters/mock/mock-weather.js";
import { createOpenMeteoWeatherProvider } from "../../adapters/open-meteo/open-meteo-weather.js";
import { createWeatherFeature } from "../../features/weather/weather-feature.js";
import type { PersonalContextReaderPort } from "../../ports/personal-context.js";
import type { NotificationDeliveryPort } from "../../ports/notification-delivery.js";
import type { WeatherWatchStore } from "../../ports/weather-watch-store.js";
import type { WeatherProviderPort } from "../../ports/weather.js";
import type { RuntimeBackgroundTaskContext } from "../background-task.js";
import {
  defineFeatureAdapterEntry,
  type FeatureRegistryEntry,
} from "../feature-adapter-registry.js";
import { resolveLocalStatePath } from "../local-state-path.js";
import { runWeatherWatchEvaluator } from "../weather/weather-watch-evaluator.js";
import {
  parseWeatherFeatureConfig,
  parseWeatherOpenMeteoAdapterConfig,
  type WeatherWatchStoreConfig,
} from "./weather-feature-adapter-config.js";

interface WeatherFeatureRegistryDependencies {
  configDirectory?: string;
  fetch: typeof fetch;
  notificationDelivery?: NotificationDeliveryPort;
  personalContextReader?: PersonalContextReaderPort;
  watchStore?: FileWeatherWatchStoreDependencies;
}

export function createWeatherFeatureRegistryEntry(
  registryDependencies: WeatherFeatureRegistryDependencies,
): FeatureRegistryEntry {
  return {
    adapters: {
      mock: defineFeatureAdapterEntry({
        create: ({ adapterConfig, runtime }) => {
          const { watchStore, ...featureConfig } = adapterConfig;
          return createWeatherComposition(
            createMockWeatherProvider(),
            createWeatherWatchStore(
              watchStore,
              runtime,
              registryDependencies.configDirectory,
              registryDependencies.watchStore ?? {},
            ),
            featureConfig.maxForecastAgeMinutes,
            registryDependencies.notificationDelivery,
            registryDependencies.personalContextReader,
          );
        },
        parseConfig: parseWeatherFeatureConfig,
      }),
      openMeteo: defineFeatureAdapterEntry({
        create: ({ adapterConfig, runtime }) => {
          const { openMeteo, watchStore, ...featureConfig } = adapterConfig;
          return createWeatherComposition(
            createOpenMeteoWeatherProvider({
              config: openMeteo,
              fetch: registryDependencies.fetch,
              now: () => runtime.clock.now(),
            }),
            createWeatherWatchStore(
              watchStore,
              runtime,
              registryDependencies.configDirectory,
              registryDependencies.watchStore ?? {},
            ),
            featureConfig.maxForecastAgeMinutes,
            registryDependencies.notificationDelivery,
            registryDependencies.personalContextReader,
          );
        },
        parseConfig: parseWeatherOpenMeteoAdapterConfig,
      }),
    },
  };
}

function createWeatherComposition(
  provider: WeatherProviderPort,
  watchStore: WeatherWatchStore,
  maxForecastAgeMinutes: number,
  notificationDelivery: NotificationDeliveryPort | undefined,
  personalContext?: PersonalContextReaderPort,
) {
  const feature = createWeatherFeature(provider, {
    maxForecastAgeMinutes,
    ...(personalContext ? { personalContext } : {}),
    watchStore,
  });
  if (!notificationDelivery) return feature;
  const delivery = notificationDelivery;
  return {
    backgroundTasks: [
      {
        failureReason: "weather watch evaluation failed",
        id: "weather.watches",
        run: (context: RuntimeBackgroundTaskContext) =>
          runWeatherWatchEvaluator({
            clock: context.clock,
            delivery,
            intervalMs: 15 * 60_000,
            maxForecastAgeMs: maxForecastAgeMinutes * 60_000,
            provider,
            reportFailure: (error) => {
              context.reportFailure(error);
            },
            shutdownSignal: context.shutdownSignal,
            store: watchStore,
            ...(context.timer ? { timer: context.timer } : {}),
          }),
      },
    ],
    feature,
  };
}

function createWeatherWatchStore(
  config: WeatherWatchStoreConfig,
  runtime: { clock: { now(): Date } },
  configDirectory: string | undefined,
  storeDependencies: FileWeatherWatchStoreDependencies,
): WeatherWatchStore {
  const now = () => runtime.clock.now();
  return config.adapter === "file"
    ? createFileWeatherWatchStore({
        ...storeDependencies,
        filePath: resolveLocalStatePath(config.filePath, configDirectory),
        now,
      })
    : createInMemoryWeatherWatchStore({ now });
}
