import type { WeatherClothingConditionSummary } from "../../application/weather-clothing-condition-summary.js";
import type { WeatherClothingAdvice } from "../../ports/weather-clothing-advisor.js";
import type { FeatureResult } from "../../ports/feature.js";
import type { WeatherForecast, WeatherPeriod } from "../../ports/weather.js";
import type { SelectedClothingConditions } from "./weather-clothing-selection.js";
import {
  weatherAttributionText,
  weatherResultEnvelope,
} from "./weather-result-envelope.js";

interface ClothingResultContext {
  readonly forecast: WeatherForecast;
  readonly goal: "assess_item" | "recommend_outfit";
  readonly item?: string;
  readonly occasion?: string;
  readonly requestedPeriod: WeatherPeriod;
}

interface AvailableClothingResultContext extends ClothingResultContext {
  readonly advice: WeatherClothingAdvice;
  readonly conditionSummary: WeatherClothingConditionSummary;
  readonly mode: "current" | "period" | "point";
  readonly selected: readonly SelectedClothingConditions[];
}

export function availableClothingResult(
  context: AvailableClothingResultContext,
): FeatureResult {
  return {
    ...weatherResultEnvelope(context.forecast, {
      data: {
        clothingAdviceGoal: context.goal,
        clothingRecommendationAvailable: true,
        ...(context.item ? { clothingItem: context.item } : {}),
        ...(context.occasion ? { clothingOccasion: context.occasion } : {}),
        ...adviceData(context.advice),
        decidingMaximumPrecipitation:
          context.conditionSummary.maximumPrecipitation,
        decidingMaximumTemperature: context.conditionSummary.maximumTemperature,
        decidingMaximumWindSpeed: context.conditionSummary.maximumWindSpeed,
        decidingMinimumTemperature: context.conditionSummary.minimumTemperature,
        decidingSnowy: context.conditionSummary.snowy,
        decidingTemperatureBand: context.conditionSummary.temperatureBand,
        decidingWet: context.conditionSummary.wet,
        decidingWindy: context.conditionSummary.windy,
        queryPeriodEndAt: context.forecast.period.endAt,
        queryPeriodStartAt: context.forecast.period.startAt,
        requestedPeriodEndAt: context.requestedPeriod.endAt,
        requestedPeriodStartAt: context.requestedPeriod.startAt,
        ...flattenSelectedConditions(context.selected),
      },
      text: clothingRecommendationText(context),
    }),
    responseRewrite: "disabled",
  };
}

export function unavailableClothingResult(
  context: ClothingResultContext & {
    readonly failure?: { readonly cause?: unknown; readonly message: string };
    readonly selected?: readonly SelectedClothingConditions[];
    readonly text: string;
  },
): FeatureResult {
  return {
    ...weatherResultEnvelope(context.forecast, {
      data: {
        clothingAdviceGoal: context.goal,
        clothingRecommendationAvailable: false,
        ...(context.item ? { clothingItem: context.item } : {}),
        ...(context.occasion ? { clothingOccasion: context.occasion } : {}),
        queryPeriodEndAt: context.forecast.period.endAt,
        queryPeriodStartAt: context.forecast.period.startAt,
        requestedPeriodEndAt: context.requestedPeriod.endAt,
        requestedPeriodStartAt: context.requestedPeriod.startAt,
        ...(context.selected
          ? flattenSelectedConditions(context.selected)
          : {}),
      },
      text: `${context.text} ${weatherAttributionText(context.forecast)}`,
    }),
    ...(context.failure ? { failure: context.failure } : {}),
    responseRewrite: "disabled",
  };
}

export function clothingArticle(item: string): "a" | "an" {
  return ["a", "e", "i", "o", "u"].includes(item[0]?.toLowerCase() ?? "")
    ? "an"
    : "a";
}

function adviceData(advice: WeatherClothingAdvice) {
  return advice.kind === "item_assessment"
    ? { clothingRecommendation: advice.recommendation }
    : advice.items.reduce<Record<string, string | number>>(
        (data, item, index) => ({
          ...data,
          [`outfitItem${index}`]: item,
        }),
        { outfitItemCount: advice.items.length },
      );
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
  const timing =
    context.mode === "current"
      ? "right now"
      : context.mode === "point"
        ? `at ${context.requestedPeriod.startAt}`
        : `from ${context.requestedPeriod.startAt} to ${context.requestedPeriod.endAt}`;
  const advice =
    context.advice.kind === "outfit_recommendation"
      ? `I recommend ${joinItems(context.advice.items)}`
      : itemAssessmentText(
          context.item ?? "item",
          context.advice.recommendation,
        );
  return `${advice} in ${context.forecast.location.name} ${timing} for the ${context.conditionSummary.description}. ${weatherAttributionText(context.forecast)}`;
}

function itemAssessmentText(
  item: string,
  recommendation: Extract<
    WeatherClothingAdvice,
    { kind: "item_assessment" }
  >["recommendation"],
): string {
  const subject = `${clothingArticle(item)} ${item}`;
  if (recommendation === "recommended") return `I recommend ${subject}`;
  if (recommendation === "not_recommended") {
    return `I would not recommend ${subject}`;
  }
  return `I cannot confidently assess ${subject}`;
}

function joinItems(items: readonly string[]): string {
  if (items.length === 1) return items[0]!;
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items.at(-1)}`;
}
