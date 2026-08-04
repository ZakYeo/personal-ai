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
import {
  metricWeatherUnits,
  validateWeatherForecast,
  weatherForecastIsStale,
} from "../../ports/weather-policy.js";
import type { WeatherWatchStore } from "../../ports/weather-watch-store.js";
import type { PersonalContextReaderPort } from "../../ports/personal-context.js";
import {
  resolveLocalDateTime,
  zonedParts,
} from "../../ports/local-date-time.js";
import {
  currentWeatherResult,
  forecastWeatherResult,
} from "./weather-response.js";
import {
  createCurrentWeatherPeriod,
  createForecastWeatherPeriod,
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
  personalContext?: PersonalContextReaderPort;
  watchStore: WeatherWatchStore;
}

const coatParameters = {
  location: { type: "string" },
} as const satisfies FeatureCapabilityParameters;
type CoatArgs = FeatureArgsFromParameters<typeof coatParameters>;

const deterministicRules = [
  {
    capability: "weather.coat",
    match: (text) =>
      /^(?:will i need|do i need) a coat at home tomorrow morning\??$/u.test(
        text,
      )
        ? { location: "home" }
        : undefined,
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

  return defineDeterministicFeatureRules(
    defineFeature({
      capabilities: {
        "weather.coat": defineCapability({
          description:
            "Advise whether to take a coat for tomorrow morning at an explicit place or explicitly stored home location.",
          execute: (request, context) =>
            executeWeatherRequest(
              provider,
              request.args,
              context,
              maxForecastAgeMs,
              "coat",
              options.personalContext,
            ),
          parameters: coatParameters,
          risk: "low",
          spokenSummary: "check whether a coat is needed tomorrow morning",
          summary: "Check whether tomorrow morning's forecast suggests a coat.",
        }),
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
              options.personalContext,
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
              options.personalContext,
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
  args: CoatArgs | CurrentArgs | ForecastArgs,
  context: FeatureExecutionContext,
  maxForecastAgeMs: number,
  mode: "coat" | "current" | "forecast",
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
      : mode === "coat"
        ? createTomorrowMorningPeriod(
            context.clock.now(),
            context.config.assistant.timeZone,
          )
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

  if (mode === "current") return currentWeatherResult(forecast);
  const forecastResult = forecastWeatherResult(forecast);
  if (mode === "forecast") return forecastResult;
  const hourlyForPeriod = forecast.hourly.filter(
    (item) =>
      item.forecastAt >= period.startAt && item.forecastAt <= period.endAt,
  );
  if (hourlyForPeriod.length === 0) {
    return {
      ...forecastResult,
      data: {
        ...forecastResult.data,
        coatRecommendationAvailable: false,
      },
      text: `I cannot determine whether you need a coat because no hourly forecast is available for that period. ${forecastResult.text}`,
    };
  }
  const coatRecommended = hourlyForPeriod.some(
    (item) =>
      item.precipitation > 0 ||
      item.temperature <= 12 ||
      /\b(?:rain|sleet|snow)\b/iu.test(item.weather),
  );
  return {
    ...forecastResult,
    data: {
      ...forecastResult.data,
      coatRecommendationAvailable: true,
      coatRecommended,
    },
    text: `${
      coatRecommended
        ? "Yes, take a coat: the forecast includes rain or cool conditions."
        : "No coat is indicated by the available forecast."
    } ${forecastResult.text}`,
  };
}

function createTomorrowMorningPeriod(
  now: Date,
  timeZone: string,
): { endAt: string; startAt: string } {
  const today = zonedParts(now, timeZone);
  const tomorrow = new Date(
    Date.UTC(today.year, today.month - 1, today.day + 1),
  );
  const date = {
    day: tomorrow.getUTCDate(),
    month: tomorrow.getUTCMonth() + 1,
    year: tomorrow.getUTCFullYear(),
  };
  return {
    endAt: resolveLocalDateTime(
      {
        ...date,
        hour: 12,
        millisecond: 0,
        minute: 0,
        second: 0,
      },
      timeZone,
    ).toISOString(),
    startAt: resolveLocalDateTime(
      {
        ...date,
        hour: 6,
        millisecond: 0,
        minute: 0,
        second: 0,
      },
      timeZone,
    ).toISOString(),
  };
}
