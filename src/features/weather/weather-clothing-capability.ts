import {
  assessWeatherClothing,
  weatherClothingCategories,
} from "../../application/weather-clothing-policy.js";
import { createWeatherClothingPeriodPlan } from "../../application/weather-clothing-period.js";
import {
  metricWeatherUnits,
  validateWeatherForecast,
  weatherForecastIsStale,
} from "../../application/weather-policy.js";
import {
  defineCapability,
  type FeatureArgsFromParameters,
  type FeatureCapabilityParameters,
  type FeatureExecutionContext,
  type FeatureResult,
} from "../../application/feature.js";
import type { PersonalContextReaderPort } from "../../ports/personal-context.js";
import type {
  CurrentWeatherObservation,
  HourlyWeatherForecast,
  WeatherForecast,
  WeatherPeriod,
  WeatherProviderPort,
} from "../../ports/weather.js";
import { resolveWeatherLocation } from "./weather-location-resolution.js";
import { withWeatherLocationReference } from "./weather-result-reference.js";

const clothingTimeParameters = {
  endAt: {
    description:
      "Optional inclusive period end as an exact ISO timestamp; valid only with startAt.",
    type: "string",
  },
  location: { type: "string" },
  startAt: {
    description:
      "Optional exact ISO time. With no endAt it is a point; with endAt it begins an inclusive period. Omit both for current conditions.",
    type: "string",
  },
} as const satisfies FeatureCapabilityParameters;

const clothingParameters = {
  category: {
    allowedValues: weatherClothingCategories,
    description: "The bounded clothing category that controls weather policy.",
    required: true,
    type: "string",
  },
  ...clothingTimeParameters,
  item: {
    description: "The user's specific clothing or accessory item.",
    required: true,
    type: "string",
  },
} as const satisfies FeatureCapabilityParameters;

type ClothingArgs = FeatureArgsFromParameters<typeof clothingParameters>;

interface WeatherClothingCapabilityOptions {
  maxForecastAgeMs: number;
  personalContext?: PersonalContextReaderPort;
}

export function createWeatherClothingCapabilities(
  provider: WeatherProviderPort,
  options: WeatherClothingCapabilityOptions,
) {
  return {
    "weather.clothing": defineCapability({
      description:
        "Advise on a user-named clothing or accessory item for current conditions, one future instant, or an inclusive future period. Location may be explicit, recent weather context, or explicitly stored home.",
      execute: (request, context) =>
        executeWeatherClothing(provider, request.args, context, options),
      parameters: clothingParameters,
      risk: "low",
      spokenSummary: "check whether clothing suits the weather",
      summary:
        "Check whether a clothing item suits bounded weather conditions.",
    }),
    "weather.coat": defineCapability({
      description:
        "Compatibility route for coat advice using current conditions, one future instant, or an inclusive future period. Location may be explicit, recent weather context, or explicitly stored home.",
      execute: (request, context) =>
        executeWeatherClothing(
          provider,
          {
            ...request.args,
            category: "insulating_outerwear",
            item: "coat",
          },
          context,
          options,
        ),
      parameters: clothingTimeParameters,
      risk: "low",
      spokenSummary: "check whether a coat suits the weather",
      summary: "Check whether a coat suits bounded weather conditions.",
    }),
  };
}

async function executeWeatherClothing(
  provider: WeatherProviderPort,
  args: ClothingArgs,
  context: FeatureExecutionContext,
  options: WeatherClothingCapabilityOptions,
): Promise<FeatureResult> {
  const item = args.item.trim();
  if (item.length === 0 || item.length > 80) {
    throw new Error("Weather clothing items must contain 1 to 80 characters.");
  }
  const resolution = await resolveWeatherLocation(
    provider,
    args.location,
    context,
    {
      ...(options.personalContext
        ? { personalContext: options.personalContext }
        : {}),
      selection: "ranked",
    },
  );
  if ("result" in resolution) return resolution.result;

  const plan = createWeatherClothingPeriodPlan(
    args,
    context.clock.now(),
    resolution.location.timezone,
  );
  const forecast = await provider.getForecast(
    {
      location: resolution.location,
      period: plan.queryPeriod,
      units: metricWeatherUnits,
    },
    context.signal ? { signal: context.signal } : {},
  );
  validateWeatherForecast(forecast, resolution.location, plan.queryPeriod);
  if (
    weatherForecastIsStale(
      forecast,
      context.clock.now(),
      options.maxForecastAgeMs,
    )
  ) {
    return withWeatherLocationReference(
      unavailableClothingResult(
        forecast,
        args.category,
        item,
        plan.requestedPeriod,
        "The available weather observation is stale, so I cannot make a current clothing recommendation.",
      ),
      forecast.location,
    );
  }

  const selected = selectClothingConditions(
    forecast,
    plan.mode,
    plan.requestedPeriod,
  );
  if (selected.length === 0) {
    return withWeatherLocationReference(
      unavailableClothingResult(
        forecast,
        args.category,
        item,
        plan.requestedPeriod,
        `I cannot assess ${articleFor(item)} ${item} because no weather interval is available close enough to the requested time.`,
      ),
      forecast.location,
    );
  }

  const assessment = assessWeatherClothing(args.category, selected);
  return withWeatherLocationReference(
    {
      citations: [weatherCitation(forecast)],
      data: {
        attributionName: forecast.attribution.name,
        attributionUrl: forecast.attribution.url,
        clothingCategory: args.category,
        clothingItem: item,
        clothingRecommendation: assessment.recommendation,
        clothingRecommendationAvailable:
          assessment.recommendation !== "limited",
        currentObservedAt: forecast.current.observedAt,
        decidingMaximumPrecipitation:
          assessment.decidingMeasurements.maximumPrecipitation,
        decidingMaximumWindSpeed:
          assessment.decidingMeasurements.maximumWindSpeed,
        decidingMinimumTemperature:
          assessment.decidingMeasurements.minimumTemperature,
        decidingSnowy: assessment.decidingMeasurements.snowy,
        decidingWet: assessment.decidingMeasurements.wet,
        decidingWindy: assessment.decidingMeasurements.windy,
        fetchedAt: forecast.fetchedAt,
        latitude: forecast.location.latitude,
        location: forecast.location.name,
        longitude: forecast.location.longitude,
        precipitationUnit: forecast.units.precipitation,
        queryPeriodEndAt: forecast.period.endAt,
        queryPeriodStartAt: forecast.period.startAt,
        requestedPeriodEndAt: plan.requestedPeriod.endAt,
        requestedPeriodStartAt: plan.requestedPeriod.startAt,
        ...flattenSelectedConditions(selected),
        temperatureUnit: forecast.units.temperature,
        timezone: forecast.location.timezone,
        windSpeedUnit: forecast.units.windSpeed,
      },
      spokenText: {
        dateStyle: "contextual",
        timeZone: forecast.location.timezone,
      },
      text: clothingRecommendationText(
        assessment.recommendation,
        assessment.reason,
        item,
        forecast,
        plan.mode,
        plan.requestedPeriod,
      ),
    },
    forecast.location,
  );
}

interface SelectedClothingConditions {
  readonly at: string;
  readonly precipitation: number;
  readonly temperature: number;
  readonly weather: string;
  readonly windSpeed: number;
}

function selectClothingConditions(
  forecast: WeatherForecast,
  mode: "current" | "period" | "point",
  requestedPeriod: WeatherPeriod,
): SelectedClothingConditions[] {
  if (mode === "current") {
    return [selectedCurrent(forecast.current)];
  }
  if (mode === "point") {
    const target = new Date(requestedPeriod.startAt).getTime();
    const nearest = [...forecast.hourly].sort((left, right) => {
      const distance =
        Math.abs(new Date(left.forecastAt).getTime() - target) -
        Math.abs(new Date(right.forecastAt).getTime() - target);
      return distance === 0
        ? left.forecastAt.localeCompare(right.forecastAt)
        : distance;
    })[0];
    return nearest &&
      Math.abs(new Date(nearest.forecastAt).getTime() - target) <= 60 * 60_000
      ? [selectedHourly(nearest)]
      : [];
  }

  const inside = forecast.hourly.filter(
    (item) =>
      item.forecastAt >= requestedPeriod.startAt &&
      item.forecastAt <= requestedPeriod.endAt,
  );
  if (inside.length > 0) return inside.map(selectedHourly);
  const midpoint =
    (new Date(requestedPeriod.startAt).getTime() +
      new Date(requestedPeriod.endAt).getTime()) /
    2;
  const nearest = [...forecast.hourly].sort(
    (left, right) =>
      Math.abs(new Date(left.forecastAt).getTime() - midpoint) -
        Math.abs(new Date(right.forecastAt).getTime() - midpoint) ||
      left.forecastAt.localeCompare(right.forecastAt),
  )[0];
  return nearest &&
    Math.abs(new Date(nearest.forecastAt).getTime() - midpoint) <= 60 * 60_000
    ? [selectedHourly(nearest)]
    : [];
}

function selectedCurrent(
  observation: CurrentWeatherObservation,
): SelectedClothingConditions {
  return { ...observation, at: observation.observedAt };
}

function selectedHourly(
  forecast: HourlyWeatherForecast,
): SelectedClothingConditions {
  return { ...forecast, at: forecast.forecastAt };
}

function flattenSelectedConditions(
  selected: readonly SelectedClothingConditions[],
) {
  return selected.reduce<Record<string, string | number>>(
    (facts, item, index) => ({
      ...facts,
      [`selected${index}At`]: item.at,
      [`selected${index}Precipitation`]: item.precipitation,
      [`selected${index}Temperature`]: item.temperature,
      [`selected${index}Weather`]: item.weather,
      [`selected${index}WindSpeed`]: item.windSpeed,
    }),
    { selectedCount: selected.length },
  );
}

function unavailableClothingResult(
  forecast: WeatherForecast,
  category: ClothingArgs["category"],
  item: string,
  requestedPeriod: WeatherPeriod,
  text: string,
): FeatureResult {
  return {
    citations: [weatherCitation(forecast)],
    data: {
      attributionName: forecast.attribution.name,
      attributionUrl: forecast.attribution.url,
      clothingCategory: category,
      clothingItem: item,
      clothingRecommendationAvailable: false,
      currentObservedAt: forecast.current.observedAt,
      fetchedAt: forecast.fetchedAt,
      location: forecast.location.name,
      requestedPeriodEndAt: requestedPeriod.endAt,
      requestedPeriodStartAt: requestedPeriod.startAt,
      timezone: forecast.location.timezone,
    },
    spokenText: {
      dateStyle: "contextual",
      timeZone: forecast.location.timezone,
    },
    text: `${text} Source: ${forecast.attribution.name}.`,
  };
}

function clothingRecommendationText(
  recommendation: "limited" | "not_recommended" | "recommended",
  reason: string,
  item: string,
  forecast: WeatherForecast,
  mode: "current" | "period" | "point",
  requestedPeriod: WeatherPeriod,
): string {
  const subject = `${articleFor(item)} ${item}`;
  const timing =
    mode === "current"
      ? "right now"
      : mode === "point"
        ? `at ${requestedPeriod.startAt}`
        : `from ${requestedPeriod.startAt} to ${requestedPeriod.endAt}`;
  const advice =
    recommendation === "recommended"
      ? `Yes, I recommend ${subject}`
      : recommendation === "not_recommended"
        ? `I would not recommend ${subject}`
        : `I cannot make a dependable recommendation for ${subject}`;
  return `${advice} in ${forecast.location.name} ${timing} because ${reason}. Source: ${forecast.attribution.name}.`;
}

function articleFor(item: string): "a" | "an" {
  return ["a", "e", "i", "o", "u"].includes(item[0]?.toLowerCase() ?? "")
    ? "an"
    : "a";
}

function weatherCitation(forecast: WeatherForecast) {
  return {
    title: forecast.attribution.name,
    url: forecast.attribution.url,
  };
}
