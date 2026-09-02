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
import type { WeatherProviderPort } from "../../ports/weather.js";
import {
  availableClothingResult,
  clothingArticle,
  unavailableClothingResult,
} from "./weather-clothing-response.js";
import { selectClothingConditions } from "./weather-clothing-selection.js";
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
      unavailableClothingResult({
        category: args.category,
        forecast,
        item,
        requestedPeriod: plan.requestedPeriod,
        text: "The available weather observation is stale, so I cannot make a current clothing recommendation.",
      }),
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
      unavailableClothingResult({
        category: args.category,
        forecast,
        item,
        requestedPeriod: plan.requestedPeriod,
        text: `I cannot assess ${clothingArticle(item)} ${item} because no weather interval is available close enough to the requested time.`,
      }),
      forecast.location,
    );
  }

  const assessment = assessWeatherClothing(args.category, selected);
  return withWeatherLocationReference(
    availableClothingResult({
      assessment,
      category: args.category,
      forecast,
      item,
      mode: plan.mode,
      requestedPeriod: plan.requestedPeriod,
      selected,
    }),
    forecast.location,
  );
}
