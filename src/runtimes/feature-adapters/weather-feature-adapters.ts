import {
  createFileWeatherWatchStore,
  type FileWeatherWatchStoreDependencies,
} from "../../adapters/local/file-weather-watch-store.js";
import { createInMemoryWeatherWatchStore } from "../../adapters/local/in-memory-weather-watch-store.js";
import { createMockWeatherProvider } from "../../adapters/mock/mock-weather.js";
import { createOpenMeteoWeatherProvider } from "../../adapters/open-meteo/open-meteo-weather.js";
import { createWeatherFeature } from "../../features/weather/weather-feature.js";
import type { WeatherWatchStore } from "../../ports/weather-watch-store.js";
import {
  defineFeatureAdapterEntry,
  type FeatureAdapterDependencies,
  type FeatureRegistryEntry,
} from "../feature-adapter-registry.js";
import { resolveLocalStatePath } from "../local-state-path.js";
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
          return createWeatherFeature(createMockWeatherProvider(), {
            ...featureConfig,
            watchStore: createWeatherWatchStore(
              watchStore,
              dependencies,
              storeDependencies,
            ),
          });
        },
        parseConfig: parseWeatherFeatureConfig,
      }),
      openMeteo: defineFeatureAdapterEntry<WeatherOpenMeteoAdapterConfig>({
        create: ({ adapterConfig, dependencies }) => {
          const { openMeteo, watchStore, ...featureConfig } = adapterConfig;
          return createWeatherFeature(
            createOpenMeteoWeatherProvider({
              config: openMeteo,
              fetch: dependencies.fetch,
              now: () => dependencies.clock.now(),
            }),
            {
              ...featureConfig,
              watchStore: createWeatherWatchStore(
                watchStore,
                dependencies,
                storeDependencies,
              ),
            },
          );
        },
        parseConfig: parseWeatherOpenMeteoAdapterConfig,
      }),
    },
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
