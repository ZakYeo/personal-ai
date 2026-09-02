import {
  defineDeterministicFeatureRules,
  type DeterministicFeatureRule,
} from "../../application/deterministic-feature-rules.js";
import {
  defineCapability,
  defineFeature,
  type FeatureArgsFromParameters,
  type FeatureCapabilityParameters,
  type FeatureExecutionContext,
} from "../../application/feature.js";
import type { WeatherProviderPort } from "../../ports/weather.js";
import {
  metricWeatherUnits,
  validateWeatherForecast,
  weatherForecastIsStale,
} from "../../application/weather-policy.js";
import type { WeatherWatchStore } from "../../ports/weather-watch-store.js";
import type { PersonalContextReaderPort } from "../../ports/personal-context.js";
import {
  currentWeatherResult,
  forecastWeatherResult,
} from "./weather-response.js";
import { weatherResultEnvelope } from "./weather-result-envelope.js";
import {
  createCurrentWeatherPeriod,
  createForecastWeatherPeriod,
} from "./weather-validation.js";
import { resolveWeatherLocation } from "./weather-location-resolution.js";
import { withWeatherLocationReference } from "./weather-result-reference.js";
import { createWeatherClothingCapabilities } from "./weather-clothing-capability.js";
import {
  createWeatherWatchCapabilities,
  weatherWatchDeterministicRules,
} from "./weather-watch-capabilities.js";

const weatherDetailParameters = {
  includePrecipitation: {
    description:
      "Include the exact precipitation amount only when explicitly requested.",
    type: "boolean",
  },
  includeWind: {
    description: "Include the exact wind speed only when explicitly requested.",
    type: "boolean",
  },
} as const satisfies FeatureCapabilityParameters;

const currentParameters = {
  ...weatherDetailParameters,
  location: { type: "string" },
} as const satisfies FeatureCapabilityParameters;
type CurrentArgs = FeatureArgsFromParameters<typeof currentParameters>;

const forecastParameters = {
  ...weatherDetailParameters,
  endAt: {
    description: "Optional inclusive forecast-window end as an ISO timestamp.",
    type: "string",
  },
  location: { type: "string" },
  startAt: {
    description: "Optional forecast-window start as an ISO timestamp.",
    type: "string",
  },
} as const satisfies FeatureCapabilityParameters;
type ForecastArgs = FeatureArgsFromParameters<typeof forecastParameters>;

interface WeatherFeatureOptions {
  maxForecastAgeMinutes?: number;
  personalContext?: PersonalContextReaderPort;
  watchStore: WeatherWatchStore;
}

const deterministicRules = [
  {
    capability: "weather.coat",
    match: (text) => {
      const match =
        /^(?:will i need|do i need) a coat(?: at (.+?))? (?:right )?now\??$/u.exec(
          text,
        );
      return match ? (match[1] ? { location: match[1] } : {}) : undefined;
    },
  },
  {
    capability: "weather.forecast",
    match: (text) => {
      const match = /^(?:what(?:'s| is) the )?forecast (?:for|in) (.+)$/u.exec(
        text,
      );
      return match?.[1] ? { location: match[1] } : undefined;
    },
  },
  {
    capability: "weather.current",
    match: (text) => {
      const match =
        /^(?:what(?:'s| is) the )?(?:current )?weather (?:for|in) (.+)$/u.exec(
          text,
        );
      return match?.[1] ? { location: match[1] } : undefined;
    },
  },
] as const satisfies readonly DeterministicFeatureRule[];

export function createWeatherFeature(
  provider: WeatherProviderPort,
  options: WeatherFeatureOptions,
) {
  const maxForecastAgeMs = (options.maxForecastAgeMinutes ?? 360) * 60_000;
  const watchCapabilities = createWeatherWatchCapabilities(
    provider,
    options.watchStore,
  );
  const clothingCapabilities = createWeatherClothingCapabilities(provider, {
    maxForecastAgeMs,
    ...(options.personalContext
      ? { personalContext: options.personalContext }
      : {}),
  });

  return defineDeterministicFeatureRules(
    defineFeature({
      capabilities: {
        ...clothingCapabilities,
        "weather.current": defineCapability({
          description:
            "Read current weather for an explicit place, the recent weather location, or explicitly stored home. Omit optional location when the dialogue context resolves it.",
          execute: (request, context) =>
            executeWeatherRequest(
              provider,
              request.args,
              context,
              maxForecastAgeMs,
              "current",
              options.personalContext,
            ),
          parameters: currentParameters,
          risk: "low",
          spokenSummary: "check current weather for a location",
          summary: "Check current weather for a resolved location.",
        }),
        "weather.forecast": defineCapability({
          description:
            "Read a bounded forecast for an explicit place, the recent weather location, or explicitly stored home, with an optional exact ISO time window.",
          execute: (request, context) =>
            executeWeatherRequest(
              provider,
              request.args,
              context,
              maxForecastAgeMs,
              "forecast",
              options.personalContext,
            ),
          parameters: forecastParameters,
          risk: "low",
          spokenSummary: "check a forecast for a location",
          summary: "Check a bounded forecast for a resolved location.",
        }),
        ...watchCapabilities,
      },
      displayName: "Weather",
      spokenSummary: "check weather and manage weather watches",
      id: "weather",
    }),
    [...deterministicRules, ...weatherWatchDeterministicRules],
  );
}

async function executeWeatherRequest(
  provider: WeatherProviderPort,
  args: CurrentArgs | ForecastArgs,
  context: FeatureExecutionContext,
  maxForecastAgeMs: number,
  mode: "current" | "forecast",
  personalContext?: PersonalContextReaderPort,
) {
  const resolution = await resolveWeatherLocation(
    provider,
    args.location,
    context,
    {
      ...(personalContext ? { personalContext } : {}),
      selection: "ranked",
    },
  );
  if ("result" in resolution) return resolution.result;
  const { location } = resolution;
  const period =
    mode === "current"
      ? createCurrentWeatherPeriod(context.clock.now())
      : createForecastWeatherPeriod(args, context.clock.now());
  const forecast = await provider.getForecast(
    { location, period, units: metricWeatherUnits },
    context.signal ? { signal: context.signal } : {},
  );
  validateWeatherForecast(forecast, location, period);

  if (weatherForecastIsStale(forecast, context.clock.now(), maxForecastAgeMs)) {
    return withWeatherLocationReference(
      weatherResultEnvelope(forecast, {
        text: `The available weather data for ${forecast.location.name} is stale, so I will not present it as current.`,
      }),
      forecast.location,
    );
  }

  const responseOptions = {
    includePrecipitation: args.includePrecipitation === true,
    includeWind: args.includeWind === true,
    now: context.clock.now(),
  };
  if (mode === "current")
    return withWeatherLocationReference(
      currentWeatherResult(forecast, responseOptions),
      forecast.location,
    );
  const forecastResult = forecastWeatherResult(forecast, responseOptions);
  return withWeatherLocationReference(forecastResult, forecast.location);
}
