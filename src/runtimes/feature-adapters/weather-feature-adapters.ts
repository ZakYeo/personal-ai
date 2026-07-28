import { createMockWeatherProvider } from "../../adapters/mock/mock-weather.js";
import { createOpenMeteoWeatherProvider } from "../../adapters/open-meteo/open-meteo-weather.js";
import { createInMemoryWeatherWatchStore } from "../../adapters/local/in-memory-weather-watch-store.js";
import { createWeatherFeature } from "../../features/weather/weather-feature.js";
import {
  defineFeatureAdapterEntry,
  type FeatureRegistryEntry,
} from "../feature-adapter-registry.js";
import {
  parseWeatherFeatureConfig,
  parseWeatherOpenMeteoAdapterConfig,
  type WeatherFeatureConfig,
  type WeatherOpenMeteoAdapterConfig,
} from "./weather-feature-adapter-config.js";

export function createWeatherFeatureRegistryEntry(): FeatureRegistryEntry {
  return {
    adapters: {
      mock: defineFeatureAdapterEntry<WeatherFeatureConfig>({
        create: ({ adapterConfig, dependencies }) =>
          createWeatherFeature(createMockWeatherProvider(), {
            ...adapterConfig,
            watchStore: createInMemoryWeatherWatchStore({
              now: () => dependencies.clock.now(),
            }),
          }),
        parseConfig: parseWeatherFeatureConfig,
      }),
      openMeteo: defineFeatureAdapterEntry<WeatherOpenMeteoAdapterConfig>({
        create: ({ adapterConfig, dependencies }) =>
          createWeatherFeature(
            createOpenMeteoWeatherProvider({
              config: adapterConfig.openMeteo,
              fetch: dependencies.fetch,
              now: () => dependencies.clock.now(),
            }),
            {
              ...adapterConfig,
              watchStore: createInMemoryWeatherWatchStore({
                now: () => dependencies.clock.now(),
              }),
            },
          ),
        parseConfig: parseWeatherOpenMeteoAdapterConfig,
      }),
    },
  };
}
