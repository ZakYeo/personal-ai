import type {
  WeatherClothingAssessment,
  WeatherClothingCategory,
} from "../../application/weather-clothing-policy.js";
import type { FeatureResult } from "../../ports/feature.js";
import type { WeatherForecast, WeatherPeriod } from "../../ports/weather.js";
import type { SelectedClothingConditions } from "./weather-clothing-selection.js";
import {
  weatherAttributionText,
  weatherResultEnvelope,
} from "./weather-result-envelope.js";

interface ClothingResultContext {
  readonly category: WeatherClothingCategory;
  readonly forecast: WeatherForecast;
  readonly item: string;
  readonly requestedPeriod: WeatherPeriod;
}

interface AvailableClothingResultContext extends ClothingResultContext {
  readonly assessment: WeatherClothingAssessment;
  readonly mode: "current" | "period" | "point";
  readonly selected: readonly SelectedClothingConditions[];
}

export function availableClothingResult(
  context: AvailableClothingResultContext,
): FeatureResult {
  const { assessment, forecast, selected } = context;
  return weatherResultEnvelope(forecast, {
    data: {
      clothingCategory: context.category,
      clothingItem: context.item,
      clothingRecommendation: assessment.recommendation,
      clothingRecommendationAvailable: assessment.recommendation !== "limited",
      decidingMaximumPrecipitation:
        assessment.decidingMeasurements.maximumPrecipitation,
      decidingMaximumWindSpeed:
        assessment.decidingMeasurements.maximumWindSpeed,
      decidingMinimumTemperature:
        assessment.decidingMeasurements.minimumTemperature,
      decidingSnowy: assessment.decidingMeasurements.snowy,
      decidingWet: assessment.decidingMeasurements.wet,
      decidingWindy: assessment.decidingMeasurements.windy,
      queryPeriodEndAt: forecast.period.endAt,
      queryPeriodStartAt: forecast.period.startAt,
      requestedPeriodEndAt: context.requestedPeriod.endAt,
      requestedPeriodStartAt: context.requestedPeriod.startAt,
      ...flattenSelectedConditions(selected),
    },
    text: clothingRecommendationText(context),
  });
}

export function unavailableClothingResult(
  context: ClothingResultContext & { readonly text: string },
): FeatureResult {
  return weatherResultEnvelope(context.forecast, {
    data: {
      clothingCategory: context.category,
      clothingItem: context.item,
      clothingRecommendationAvailable: false,
      queryPeriodEndAt: context.forecast.period.endAt,
      queryPeriodStartAt: context.forecast.period.startAt,
      requestedPeriodEndAt: context.requestedPeriod.endAt,
      requestedPeriodStartAt: context.requestedPeriod.startAt,
    },
    text: `${context.text} ${weatherAttributionText(context.forecast)}`,
  });
}

export function clothingArticle(item: string): "a" | "an" {
  return ["a", "e", "i", "o", "u"].includes(item[0]?.toLowerCase() ?? "")
    ? "an"
    : "a";
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

function clothingRecommendationText(
  context: AvailableClothingResultContext,
): string {
  const subject = `${clothingArticle(context.item)} ${context.item}`;
  const timing =
    context.mode === "current"
      ? "right now"
      : context.mode === "point"
        ? `at ${context.requestedPeriod.startAt}`
        : `from ${context.requestedPeriod.startAt} to ${context.requestedPeriod.endAt}`;
  const advice =
    context.assessment.recommendation === "recommended"
      ? `Yes, I recommend ${subject}`
      : context.assessment.recommendation === "not_recommended"
        ? `I would not recommend ${subject}`
        : `I cannot make a dependable recommendation for ${subject}`;
  return `${advice} in ${context.forecast.location.name} ${timing} because ${context.assessment.reason}. ${weatherAttributionText(context.forecast)}`;
}
