import type { HourlyWeatherForecast } from "./weather.js";
import {
  decodeWeatherWatchCondition,
  weatherWatchConditionMatches,
  weatherWatchConditionValue,
  weatherWatchMetricLabel,
} from "./weather-watch-condition-policy.js";

const forecast: HourlyWeatherForecast = {
  forecastAt: "2026-07-29T09:00:00.000Z",
  precipitation: 0.4,
  temperature: 17,
  weather: "light rain",
  windSpeed: 14,
};

describe("weather watch condition policy", () => {
  it.each([
    [
      { metric: "precipitation", operator: "atLeast", threshold: 0.4 },
      {
        metric: "precipitation",
        operator: "atLeast",
        threshold: 0.4,
        unit: "mm",
      },
      true,
      0.4,
      "precipitation",
    ],
    [
      { metric: "temperature", operator: "atMost", threshold: 17 },
      {
        metric: "temperature",
        operator: "atMost",
        threshold: 17,
        unit: "celsius",
      },
      true,
      17,
      "temperature",
    ],
    [
      { metric: "windSpeed", operator: "atLeast", threshold: 14 },
      {
        metric: "windSpeed",
        operator: "atLeast",
        threshold: 14,
        unit: "km/h",
      },
      true,
      14,
      "wind speed",
    ],
  ] as const)(
    "decodes and evaluates $input.metric",
    (input, expected, matches, value, label) => {
      const condition = decodeWeatherWatchCondition(input);

      expect(condition).toEqual(expected);
      expect(weatherWatchConditionMatches(condition, forecast)).toBe(matches);
      expect(weatherWatchConditionValue(condition, forecast)).toBe(value);
      expect(weatherWatchMetricLabel(condition)).toBe(label);
    },
  );

  it.each([
    {
      metric: "precipitation",
      operator: "atMost",
      threshold: 1,
    },
    {
      metric: "precipitation",
      operator: "atLeast",
      threshold: -1,
    },
    {
      metric: "temperature",
      operator: "atLeast",
      threshold: 101,
    },
    {
      metric: "windSpeed",
      operator: "atLeast",
      threshold: 14,
      unit: "mph",
    },
    {
      metric: "humidity",
      operator: "atLeast",
      threshold: 80,
    },
  ])("rejects invalid condition input %#", (input) => {
    expect(() => decodeWeatherWatchCondition(input)).toThrow(
      "Weather watch condition is invalid.",
    );
  });
});
