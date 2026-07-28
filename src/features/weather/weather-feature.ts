import {
  defineDeterministicFeatureRules,
  type DeterministicFeatureRule,
} from "../../ports/deterministic-feature-rules.js";
import {
  defineCapability,
  defineFeature,
  type FeatureArgsFromParameters,
  type FeatureCapabilityParameters,
  type FeatureExecutionContext,
} from "../../ports/feature.js";
import type { WeatherProviderPort } from "../../ports/weather.js";
import type { WeatherWatchStore } from "../../ports/weather-watch-store.js";
import {
  currentWeatherResult,
  forecastWeatherResult,
} from "./weather-response.js";
import {
  createCurrentWeatherPeriod,
  createForecastWeatherPeriod,
  metricWeatherUnits,
  validateWeatherForecast,
  weatherForecastIsStale,
} from "./weather-validation.js";
import { resolveWeatherLocation } from "./weather-location-resolution.js";
import {
  createWeatherWatchCapabilities,
  weatherWatchDeterministicRules,
} from "./weather-watch-capabilities.js";

const currentParameters = {
  location: { type: "string" },
} as const satisfies FeatureCapabilityParameters;
type CurrentArgs = FeatureArgsFromParameters<typeof currentParameters>;

const forecastParameters = {
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
  watchStore: WeatherWatchStore;
}

const deterministicRules = [
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

  return defineDeterministicFeatureRules(
    defineFeature({
      capabilities: {
        "weather.current": defineCapability({
          description:
            "Read current weather for an explicit place. Never infer a location.",
          execute: (request, context) =>
            executeWeatherRequest(
              provider,
              request.args,
              context,
              maxForecastAgeMs,
              "current",
            ),
          parameters: currentParameters,
          risk: "low",
          spokenSummary: "check current weather for a location",
          summary: "Check current weather for an explicit location.",
        }),
        "weather.forecast": defineCapability({
          description:
            "Read a bounded forecast for an explicit place and optional exact ISO time window.",
          execute: (request, context) =>
            executeWeatherRequest(
              provider,
              request.args,
              context,
              maxForecastAgeMs,
              "forecast",
            ),
          parameters: forecastParameters,
          risk: "low",
          spokenSummary: "check a forecast for a location",
          summary: "Check a bounded forecast for an explicit location.",
        }),
        ...watchCapabilities,
      },
      displayName: "Weather",
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
) {
  const resolution = await resolveWeatherLocation(
    provider,
    args.location,
    context,
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
    return {
      data: {
        fetchedAt: forecast.fetchedAt,
        location: forecast.location.name,
        timezone: forecast.location.timezone,
      },
      text: `The available weather data for ${forecast.location.name} is stale, so I will not present it as current.`,
    };
  }

  return mode === "current"
    ? currentWeatherResult(forecast)
    : forecastWeatherResult(forecast);
}
