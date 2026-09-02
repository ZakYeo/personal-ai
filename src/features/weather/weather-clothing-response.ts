import type { WeatherClothingConditionSummary } from "../../application/weather-clothing-condition-summary.js";
import type { WeatherClothingAdvice } from "../../ports/weather-clothing-advisor.js";
import type { FeatureResult } from "../../ports/feature.js";
import type { WeatherForecast, WeatherPeriod } from "../../ports/weather.js";
import type { SelectedClothingConditions } from "./weather-clothing-selection.js";
import {
  weatherAttributionText,
  weatherResultEnvelope,
} from "./weather-result-envelope.js";

interface ClothingResultBase {
  readonly forecast: WeatherForecast;
  readonly requestedPeriod: WeatherPeriod;
}

type ClothingResultContext = ClothingResultBase &
  (
    | { readonly goal: "assess_item"; readonly item: string }
    | {
        readonly goal: "recommend_outfit";
        readonly occasion?: string;
      }
  );

type AvailableClothingResultContext = ClothingResultBase & {
  readonly conditionSummary: WeatherClothingConditionSummary;
  readonly mode: "current" | "period" | "point";
  readonly selected: readonly SelectedClothingConditions[];
} & (
    | {
        readonly advice: Extract<
          WeatherClothingAdvice,
          { kind: "item_assessment" }
        >;
        readonly goal: "assess_item";
        readonly item: string;
      }
    | {
        readonly advice: Extract<
          WeatherClothingAdvice,
          { kind: "outfit_recommendation" }
        >;
        readonly goal: "recommend_outfit";
        readonly occasion?: string;
      }
  );

export function availableClothingResult(
  context: AvailableClothingResultContext,
): FeatureResult {
  return {
    ...weatherResultEnvelope(context.forecast, {
      data: {
        clothingAdviceGoal: context.goal,
        clothingRecommendationAvailable: true,
        ...clothingGoalData(context),
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
  const result = {
    ...weatherResultEnvelope(context.forecast, {
      data: {
        clothingAdviceGoal: context.goal,
        clothingRecommendationAvailable: false,
        ...clothingGoalData(context),
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
    responseRewrite: "disabled" as const,
  };
  return context.failure ? { ...result, failure: context.failure } : result;
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

function clothingGoalData(context: ClothingResultContext) {
  return context.goal === "assess_item"
    ? { clothingItem: context.item }
    : context.occasion
      ? { clothingOccasion: context.occasion }
      : {};
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
    context.goal === "recommend_outfit"
      ? `I recommend ${joinItems(context.advice.items)}`
      : itemAssessmentText(context.item, context.advice.recommendation);
  return `${advice} in ${context.forecast.location.name} ${timing} for the ${context.conditionSummary.description}. ${weatherAttributionText(context.forecast)}`;
}

function itemAssessmentText(
  item: string,
  recommendation: Extract<
    WeatherClothingAdvice,
    { kind: "item_assessment" }
  >["recommendation"],
): string {
  if (recommendation === "recommended") return `I recommend wearing ${item}`;
  if (recommendation === "not_recommended") {
    return `I would not recommend wearing ${item}`;
  }
  return `I cannot confidently assess ${item}`;
}

function joinItems(items: readonly string[]): string {
  if (items.length === 1) return items[0]!;
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items.at(-1)}`;
}
