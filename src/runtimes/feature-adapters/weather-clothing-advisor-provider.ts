import { createMockWeatherClothingAdvisor } from "../../adapters/mock/mock-weather-clothing-advisor.js";
import { resolveOpenAIApiKey } from "../../adapters/openai/openai-client.js";
import type { OpenAIResponsesConfig } from "../../adapters/openai/openai-responses-config.js";
import { OpenAIWeatherClothingAdvisor } from "../../adapters/openai/openai-weather-clothing-advisor.js";
import type { WeatherClothingAdvisorPort } from "../../ports/weather-clothing-advisor.js";
import { isRecord } from "../config/config-parse-utils.js";
import { parseOpenAIResponsesConfig } from "../config/openai-responses-config.js";
import {
  defineConfiglessRuntimeProvider,
  defineRuntimeProvider,
  resolveConfiguredRuntimeProvider,
  type ResolvedRuntimeProvider,
  type RuntimeProviderEntry,
} from "../runtime-provider-registry.js";

export interface WeatherClothingAdvisorProviderDependencies {
  readonly env: Record<string, string | undefined>;
  readonly fetch: typeof fetch;
}

export interface WeatherClothingAdvisorProviderBinding {
  readonly adviser: WeatherClothingAdvisorPort;
  validateStartup(): void;
}

export type ResolvedWeatherClothingAdvisorProvider = ResolvedRuntimeProvider<
  WeatherClothingAdvisorProviderDependencies,
  WeatherClothingAdvisorProviderBinding
>;

type WeatherClothingAdvisorProviderRegistry = Record<
  string,
  RuntimeProviderEntry<
    WeatherClothingAdvisorProviderDependencies,
    WeatherClothingAdvisorProviderBinding
  >
>;

export function resolveWeatherClothingAdvisorProvider(
  value: unknown,
): ResolvedWeatherClothingAdvisorProvider {
  if (!isRecord(value)) {
    throw new Error(
      'Config feature "weather".clothingAdvisor must be a JSON object.',
    );
  }
  return resolveConfiguredRuntimeProvider({
    configuredId: typeof value.provider === "string" ? value.provider : "",
    operationName: 'feature "weather".clothingAdvisor',
    rawOperationConfig: value,
    registry: weatherClothingAdvisorProviderRegistry,
  });
}

const weatherClothingAdvisorProviderRegistry: WeatherClothingAdvisorProviderRegistry =
  {
    mock: defineConfiglessRuntimeProvider(() => ({
      adviser: createMockWeatherClothingAdvisor(),
      validateStartup: () => {},
    })),
    openai: defineRuntimeProvider({
      configKey: "openai",
      create: (
        config: OpenAIResponsesConfig,
        dependencies: WeatherClothingAdvisorProviderDependencies,
      ) => ({
        adviser: new OpenAIWeatherClothingAdvisor({
          config,
          env: dependencies.env,
          fetch: dependencies.fetch,
        }),
        validateStartup: () => {
          resolveOpenAIApiKey(
            config,
            dependencies.env,
            (message) =>
              new Error(
                message.replace(
                  "OpenAI API key environment variable",
                  "OpenAI weather clothing adviser is selected but",
                ),
              ),
          );
        },
      }),
      parseConfig: (rawConfig) =>
        parseOpenAIResponsesConfig(
          rawConfig,
          'Config feature "weather".clothingAdvisor.openai',
        ),
    }),
  };
