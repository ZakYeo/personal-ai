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
import type { WeatherClothingAdvisorPort } from "../../ports/weather-clothing-advisor.js";
import type { RuntimeBackgroundTaskContext } from "../background-task.js";
import {
  defineFeatureAdapter,
  type FeatureRegistryEntry,
} from "../feature-adapter-registry.js";
import { resolveLocalStatePath } from "../local-state-path.js";
import { runWeatherWatchEvaluator } from "../weather/weather-watch-evaluator.js";
import { personalContextReaderService } from "../profile-runtime-services.js";
import type { RuntimeServiceRegistry } from "../runtime-service-registry.js";
import {
  parseWeatherFeatureConfig,
  parseWeatherOpenMeteoAdapterConfig,
  type WeatherWatchStoreConfig,
} from "./weather-feature-adapter-config.js";
import type { ResolvedWeatherClothingAdvisorProvider } from "./weather-clothing-advisor-provider.js";
import { weatherProviderService } from "../briefing/briefing-source-services.js";
import { bindRuntimeService } from "../runtime-service-registry.js";

interface WeatherFeatureRegistryDependencies {
  configDirectory?: string;
  fetch: typeof fetch;
  env: Record<string, string | undefined>;
  notificationDelivery?: NotificationDeliveryPort;
  personalContextReader?: PersonalContextReaderPort;
  watchStore?: FileWeatherWatchStoreDependencies;
}

const mockWeatherAdapter = defineFeatureAdapter({
  parseConfig: parseWeatherFeatureConfig,
});
const openMeteoWeatherAdapter = defineFeatureAdapter({
  parseConfig: parseWeatherOpenMeteoAdapterConfig,
});

export function createWeatherFeatureRegistryEntry(
  registryDependencies: WeatherFeatureRegistryDependencies,
): FeatureRegistryEntry {
  const resolveClothingAdvisor = (
    provider: ResolvedWeatherClothingAdvisorProvider,
  ) =>
    provider.create({
      env: registryDependencies.env,
      fetch: registryDependencies.fetch,
    });
  return {
    adapters: {
      mock: mockWeatherAdapter.bind({
        create: ({ adapterConfig, runtime }, services) => {
          const { watchStore, ...featureConfig } = adapterConfig;
          return createWeatherComposition(
            services.require(weatherProviderService),
            createWeatherWatchStore(
              watchStore,
              runtime,
              registryDependencies.configDirectory,
              registryDependencies.watchStore ?? {},
            ),
            featureConfig.maxForecastAgeMinutes,
            resolveClothingAdvisor(featureConfig.clothingAdvisor).adviser,
            registryDependencies.notificationDelivery,
            resolvePersonalContext(registryDependencies, services),
          );
        },
        provideServices: () => [
          bindRuntimeService(
            weatherProviderService,
            createMockWeatherProvider(),
          ),
        ],
        validateStartup: (adapterConfig) =>
          resolveClothingAdvisor(
            adapterConfig.clothingAdvisor,
          ).validateStartup(),
      }),
      openMeteo: openMeteoWeatherAdapter.bind({
        create: ({ adapterConfig, runtime }, services) => {
          const {
            openMeteo: _openMeteo,
            watchStore,
            ...featureConfig
          } = adapterConfig;
          void _openMeteo;
          return createWeatherComposition(
            services.require(weatherProviderService),
            createWeatherWatchStore(
              watchStore,
              runtime,
              registryDependencies.configDirectory,
              registryDependencies.watchStore ?? {},
            ),
            featureConfig.maxForecastAgeMinutes,
            resolveClothingAdvisor(featureConfig.clothingAdvisor).adviser,
            registryDependencies.notificationDelivery,
            resolvePersonalContext(registryDependencies, services),
          );
        },
        provideServices: ({ adapterConfig, runtime }) => [
          bindRuntimeService(
            weatherProviderService,
            createOpenMeteoWeatherProvider({
              config: adapterConfig.openMeteo,
              fetch: registryDependencies.fetch,
              now: () => runtime.clock.now(),
            }),
          ),
        ],
        validateStartup: (adapterConfig) =>
          resolveClothingAdvisor(
            adapterConfig.clothingAdvisor,
          ).validateStartup(),
      }),
    },
  };
}

function resolvePersonalContext(
  dependencies: WeatherFeatureRegistryDependencies,
  services: RuntimeServiceRegistry,
): PersonalContextReaderPort | undefined {
  return (
    dependencies.personalContextReader ??
    services.get(personalContextReaderService)
  );
}

function createWeatherComposition(
  provider: WeatherProviderPort,
  watchStore: WeatherWatchStore,
  maxForecastAgeMinutes: number,
  clothingAdviser: WeatherClothingAdvisorPort,
  notificationDelivery: NotificationDeliveryPort | undefined,
  personalContext?: PersonalContextReaderPort,
) {
  const feature = createWeatherFeature(provider, {
    clothingAdviser,
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
