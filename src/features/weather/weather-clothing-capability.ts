import {
  parseWeatherClothingAdvice,
  weatherClothingAdviceLimits,
} from "../../application/weather-clothing-advice-policy.js";
import { summarizeWeatherClothingConditions } from "../../application/weather-clothing-condition-summary.js";
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
import type { WeatherClothingAdvisorPort } from "../../ports/weather-clothing-advisor.js";
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
  goal: {
    allowedValues: ["assess_item", "recommend_outfit"],
    description:
      "Assess one named item, or recommend a complete outfit without requiring an item.",
    required: true,
    type: "string",
  },
  ...clothingTimeParameters,
  item: {
    description: "The specific item to assess; required only for assess_item.",
    type: "string",
  },
  occasion: {
    description:
      "An optional activity or occasion for an outfit recommendation.",
    type: "string",
  },
} as const satisfies FeatureCapabilityParameters;

type ClothingArgs = FeatureArgsFromParameters<typeof clothingParameters>;

interface WeatherClothingCapabilityOptions {
  clothingAdviser: WeatherClothingAdvisorPort;
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
        "Assess any user-named clothing item or recommend one concise outfit for current conditions, one future instant, or an inclusive future period. Location may be explicit, recent weather context, or explicitly stored home.",
      execute: (request, context) =>
        executeWeatherClothing(provider, request.args, context, options),
      parameters: clothingParameters,
      risk: "low",
      spokenSummary: "recommend what to wear for the weather",
      summary:
        "Assess clothing or recommend an outfit for bounded weather conditions.",
    }),
    "weather.coat": defineCapability({
      description:
        "Compatibility route for coat advice using current conditions, one future instant, or an inclusive future period. Location may be explicit, recent weather context, or explicitly stored home.",
      execute: (request, context) =>
        executeWeatherClothing(
          provider,
          { ...request.args, goal: "assess_item", item: "coat" },
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
  const item = normalizeItem(args);
  if (typeof item !== "string") return item;
  const occasion = normalizeOccasion(args.occasion);
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
  const resultContext = {
    forecast,
    goal: args.goal,
    ...(item ? { item } : {}),
    ...(occasion ? { occasion } : {}),
    requestedPeriod: plan.requestedPeriod,
  } as const;
  if (
    weatherForecastIsStale(
      forecast,
      context.clock.now(),
      options.maxForecastAgeMs,
    )
  ) {
    return withWeatherLocationReference(
      unavailableClothingResult({
        ...resultContext,
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
    const subject = item ? `${clothingArticle(item)} ${item}` : "an outfit";
    return withWeatherLocationReference(
      unavailableClothingResult({
        ...resultContext,
        selected,
        text: `I cannot recommend ${subject} because no weather interval is available close enough to the requested time.`,
      }),
      forecast.location,
    );
  }

  const conditions = selected.map(
    ({ at, precipitation, temperature, weather, windSpeed }) => ({
      at,
      precipitation,
      temperature,
      weather,
      windSpeed,
    }),
  );
  const goal =
    args.goal === "assess_item"
      ? { kind: "assess_item" as const, item }
      : {
          kind: "recommend_outfit" as const,
          ...(occasion ? { occasion } : {}),
        };
  try {
    const rawAdvice = await options.clothingAdviser.advise(
      { conditions, goal, units: metricWeatherUnits },
      context.signal ? { signal: context.signal } : {},
    );
    const advice = parseWeatherClothingAdvice(rawAdvice, args.goal);
    return withWeatherLocationReference(
      availableClothingResult({
        ...resultContext,
        advice,
        conditionSummary: summarizeWeatherClothingConditions(conditions),
        mode: plan.mode,
        selected,
      }),
      forecast.location,
    );
  } catch (cause) {
    return withWeatherLocationReference(
      unavailableClothingResult({
        ...resultContext,
        failure: { cause, message: "Weather clothing adviser failed." },
        selected,
        text: `I found the weather for ${forecast.location.name}, but clothing advice is temporarily unavailable.`,
      }),
      forecast.location,
    );
  }
}

function normalizeItem(args: ClothingArgs): string | FeatureResult {
  if (args.goal !== "assess_item") return "";
  if (args.item === undefined) {
    return {
      kind: "resumable_clarification",
      parameter: "item",
      text: "Which clothing item would you like me to assess?",
    };
  }
  const item = args.item.trim();
  if (
    item.length === 0 ||
    item.length > weatherClothingAdviceLimits.itemCharacters
  ) {
    throw new Error(
      `Weather clothing items must contain 1 to ${weatherClothingAdviceLimits.itemCharacters} characters.`,
    );
  }
  return item;
}

function normalizeOccasion(occasion: string | undefined): string | undefined {
  if (occasion === undefined) return undefined;
  const normalized = occasion.trim();
  if (normalized.length === 0 || normalized.length > 160) {
    throw new Error(
      "Weather clothing occasions must contain 1 to 160 characters.",
    );
  }
  return normalized;
}
