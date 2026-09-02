import type { WeatherClothingAdviceRequest } from "../ports/weather-clothing-advisor.js";

type ClothingCondition = WeatherClothingAdviceRequest["conditions"][number];

export interface WeatherClothingConditionSummary {
  readonly description: string;
  readonly maximumPrecipitation: number;
  readonly maximumTemperature: number;
  readonly maximumWindSpeed: number;
  readonly minimumTemperature: number;
  readonly snowy: boolean;
  readonly temperatureBand: "cold" | "cool" | "hot" | "mild" | "warm";
  readonly wet: boolean;
  readonly windy: boolean;
}

const windyThresholdKmH = 29;

export function summarizeWeatherClothingConditions(
  conditions: readonly ClothingCondition[],
): WeatherClothingConditionSummary {
  if (conditions.length === 0) {
    throw new Error("Weather clothing condition summary requires conditions.");
  }
  const minimumTemperature = Math.min(
    ...conditions.map((condition) => condition.temperature),
  );
  const maximumTemperature = Math.max(
    ...conditions.map((condition) => condition.temperature),
  );
  const maximumPrecipitation = Math.max(
    ...conditions.map((condition) => condition.precipitation),
  );
  const maximumWindSpeed = Math.max(
    ...conditions.map((condition) => condition.windSpeed),
  );
  const wet = conditions.some(isWet);
  const snowy = conditions.some((condition) =>
    /\b(?:sleet|snow)\b/iu.test(condition.weather),
  );
  const windy = maximumWindSpeed >= windyThresholdKmH;
  const temperatureBand = classifyTemperature(minimumTemperature);
  return {
    description: `${temperatureBand}, ${wet ? "wet" : "dry"} and ${windy ? "windy" : "calm"} conditions`,
    maximumPrecipitation,
    maximumTemperature,
    maximumWindSpeed,
    minimumTemperature,
    snowy,
    temperatureBand,
    wet,
    windy,
  };
}

function classifyTemperature(
  temperature: number,
): WeatherClothingConditionSummary["temperatureBand"] {
  if (temperature <= 8) return "cold";
  if (temperature <= 14) return "cool";
  if (temperature <= 18) return "mild";
  if (temperature < 25) return "warm";
  return "hot";
}

function isWet(condition: ClothingCondition): boolean {
  return (
    condition.precipitation > 0 ||
    /\b(?:rain|sleet|snow|showers?|thunder(?:storms?)?)\b/iu.test(
      condition.weather,
    )
  );
}
