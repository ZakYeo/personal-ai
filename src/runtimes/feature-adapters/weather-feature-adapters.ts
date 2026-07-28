import {
  createFileWeatherWatchStore,
  type FileWeatherWatchStoreDependencies,
} from "../../adapters/local/file-weather-watch-store.js";
import { createInMemoryWeatherWatchStore } from "../../adapters/local/in-memory-weather-watch-store.js";
import { createMockWeatherProvider } from "../../adapters/mock/mock-weather.js";
import { createOpenMeteoWeatherProvider } from "../../adapters/open-meteo/open-meteo-weather.js";
import { createWeatherFeature } from "../../features/weather/weather-feature.js";
import type { WeatherWatchStore } from "../../ports/weather-watch-store.js";
import type { WeatherProviderPort } from "../../ports/weather.js";
import type { RuntimeBackgroundTaskContext } from "../background-task.js";
import {
  defineFeatureAdapterEntry,
  type FeatureAdapterDependencies,
  type FeatureRegistryEntry,
} from "../feature-adapter-registry.js";
import { resolveLocalStatePath } from "../local-state-path.js";
import { runWeatherWatchEvaluator } from "../weather/weather-watch-evaluator.js";
import {
  parseWeatherFeatureConfig,
  parseWeatherOpenMeteoAdapterConfig,
  type WeatherFeatureConfig,
  type WeatherOpenMeteoAdapterConfig,
  type WeatherWatchStoreConfig,
} from "./weather-feature-adapter-config.js";

export function createWeatherFeatureRegistryEntry(
  storeDependencies: FileWeatherWatchStoreDependencies = {},
): FeatureRegistryEntry {
  return {
    adapters: {
      mock: defineFeatureAdapterEntry<WeatherFeatureConfig>({
        create: ({ adapterConfig, dependencies }) => {
          const { watchStore, ...featureConfig } = adapterConfig;
          return createWeatherComposition(
            createMockWeatherProvider(),
            createWeatherWatchStore(
              watchStore,
              dependencies,
              storeDependencies,
            ),
            featureConfig.maxForecastAgeMinutes,
            dependencies,
          );
        },
        parseConfig: parseWeatherFeatureConfig,
      }),
      openMeteo: defineFeatureAdapterEntry<WeatherOpenMeteoAdapterConfig>({
        create: ({ adapterConfig, dependencies }) => {
          const { openMeteo, watchStore, ...featureConfig } = adapterConfig;
          return createWeatherComposition(
            createOpenMeteoWeatherProvider({
              config: openMeteo,
              fetch: dependencies.fetch,
              now: () => dependencies.clock.now(),
            }),
            createWeatherWatchStore(
              watchStore,
              dependencies,
              storeDependencies,
            ),
            featureConfig.maxForecastAgeMinutes,
            dependencies,
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
  dependencies: FeatureAdapterDependencies,
) {
  const feature = createWeatherFeature(provider, {
    maxForecastAgeMinutes,
    watchStore,
  });
  if (!dependencies.notificationDelivery) return feature;
  const delivery = dependencies.notificationDelivery;
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
  dependencies: FeatureAdapterDependencies,
  storeDependencies: FileWeatherWatchStoreDependencies,
): WeatherWatchStore {
  const now = () => dependencies.clock.now();
  return config.adapter === "file"
    ? createFileWeatherWatchStore({
        ...storeDependencies,
        filePath: resolveLocalStatePath(
          config.filePath,
          dependencies.configDirectory,
        ),
        now,
      })
    : createInMemoryWeatherWatchStore({ now });
}
