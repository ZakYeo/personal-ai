import { isSpokenTextSafe } from "./human-text.js";
import type {
  WeatherClothingAdvice,
  WeatherClothingAdviceGoal,
} from "../ports/weather-clothing-advisor.js";

export const weatherClothingAdviceLimits = Object.freeze({
  itemCharacters: 80,
  outfitItems: 4,
});

const itemRecommendations = new Set([
  "not_recommended",
  "recommended",
  "uncertain",
]);

export function parseWeatherClothingAdvice(
  value: unknown,
  goal: "assess_item",
): Extract<WeatherClothingAdvice, { kind: "item_assessment" }>;
export function parseWeatherClothingAdvice(
  value: unknown,
  goal: "recommend_outfit",
): Extract<WeatherClothingAdvice, { kind: "outfit_recommendation" }>;
export function parseWeatherClothingAdvice(
  value: unknown,
  goal: WeatherClothingAdviceGoal["kind"],
): WeatherClothingAdvice;
export function parseWeatherClothingAdvice(
  value: unknown,
  goal: WeatherClothingAdviceGoal["kind"],
): WeatherClothingAdvice {
  if (!isRecord(value) || typeof value.kind !== "string") {
    throw new Error("Weather clothing advice must be an object with a kind.");
  }

  if (value.kind === "item_assessment") {
    if (goal !== "assess_item") {
      throw new Error("Weather clothing advice must match the requested goal.");
    }
    if (
      typeof value.recommendation !== "string" ||
      !itemRecommendations.has(value.recommendation)
    ) {
      throw new Error(
        "Weather clothing item advice must contain a valid recommendation.",
      );
    }
    if (!hasOnlyFields(value, ["kind", "recommendation"])) {
      throw new Error("Weather clothing item advice contained unknown fields.");
    }
    return Object.freeze({
      kind: "item_assessment",
      recommendation: value.recommendation as Extract<
        WeatherClothingAdvice,
        { kind: "item_assessment" }
      >["recommendation"],
    });
  }

  if (value.kind === "outfit_recommendation") {
    if (goal !== "recommend_outfit") {
      throw new Error("Weather clothing advice must match the requested goal.");
    }
    const items = value.items;
    if (
      !Array.isArray(items) ||
      items.length < 1 ||
      items.length > weatherClothingAdviceLimits.outfitItems
    ) {
      throw new Error(
        "Weather clothing outfit advice must contain between 1 and 4 items.",
      );
    }
    if (
      !items.every(
        (item): item is string =>
          typeof item === "string" &&
          item.trim().length >= 1 &&
          item.length <= weatherClothingAdviceLimits.itemCharacters,
      )
    ) {
      throw new Error(
        "Weather clothing outfit items must contain 1 to 80 characters.",
      );
    }
    if (!items.every(isSpokenTextSafe)) {
      throw new Error(
        "Weather clothing advice must contain spoken-safe items.",
      );
    }
    const normalized = items.map((item) => item.trim().toLowerCase());
    if (new Set(normalized).size !== normalized.length) {
      throw new Error("Weather clothing advice must contain unique items.");
    }
    if (!hasOnlyFields(value, ["items", "kind"])) {
      throw new Error(
        "Weather clothing outfit advice contained unknown fields.",
      );
    }
    return Object.freeze({
      items: Object.freeze(items.map((item) => item.trim())),
      kind: "outfit_recommendation",
    });
  }

  throw new Error("Weather clothing advice kind is not supported.");
}

function hasOnlyFields(
  value: Record<string, unknown>,
  fields: readonly string[],
): boolean {
  return Object.keys(value).every((field) => fields.includes(field));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
