import type { WeatherWatchCondition } from "../ports/weather-watch-store.js";
import type { HourlyWeatherForecast } from "../ports/weather.js";

interface WeatherWatchConditionInput {
  metric: string;
  operator: string;
  threshold: number;
  unit?: string;
}

export function decodeWeatherWatchCondition(
  input: WeatherWatchConditionInput,
): WeatherWatchCondition {
  if (!Number.isFinite(input.threshold)) throw invalidCondition();
  switch (input.metric) {
    case "precipitation":
      if (
        input.operator !== "atLeast" ||
        (input.unit !== undefined && input.unit !== "mm") ||
        input.threshold < 0 ||
        input.threshold > 1_000
      ) {
        throw invalidCondition();
      }
      return {
        metric: input.metric,
        operator: input.operator,
        threshold: input.threshold,
        unit: "mm",
      };
    case "temperature":
      if (
        (input.operator !== "atLeast" && input.operator !== "atMost") ||
        (input.unit !== undefined && input.unit !== "celsius") ||
        input.threshold < -100 ||
        input.threshold > 100
      ) {
        throw invalidCondition();
      }
      return {
        metric: input.metric,
        operator: input.operator,
        threshold: input.threshold,
        unit: "celsius",
      };
    case "windSpeed":
      if (
        input.operator !== "atLeast" ||
        (input.unit !== undefined && input.unit !== "km/h") ||
        input.threshold < 0 ||
        input.threshold > 500
      ) {
        throw invalidCondition();
      }
      return {
        metric: input.metric,
        operator: input.operator,
        threshold: input.threshold,
        unit: "km/h",
      };
    default:
      throw invalidCondition();
  }
}

export function assertValidWeatherWatchCondition(
  condition: WeatherWatchCondition,
): void {
  decodeWeatherWatchCondition(condition);
}

export function weatherWatchConditionMatches(
  condition: WeatherWatchCondition,
  forecast: HourlyWeatherForecast,
): boolean {
  const value = weatherWatchConditionValue(condition, forecast);
  return condition.operator === "atLeast"
    ? value >= condition.threshold
    : value <= condition.threshold;
}

export function weatherWatchConditionValue(
  condition: WeatherWatchCondition,
  forecast: HourlyWeatherForecast,
): number {
  switch (condition.metric) {
    case "precipitation":
      return forecast.precipitation;
    case "temperature":
      return forecast.temperature;
    case "windSpeed":
      return forecast.windSpeed;
  }
}

export function weatherWatchMetricLabel(
  condition: WeatherWatchCondition,
): string {
  return condition.metric === "windSpeed" ? "wind speed" : condition.metric;
}

function invalidCondition(): Error {
  return new Error("Weather watch condition is invalid.");
}
