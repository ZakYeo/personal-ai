import { createWeatherProviderFixture } from "../../test-support/weather.js";
import type { WeatherForecast } from "../../ports/weather.js";
import {
  metricWeatherUnits,
  validateWeatherForecast,
  validateWeatherLocations,
  weatherForecastIsStale,
} from "../../application/weather-policy.js";
import { createForecastWeatherPeriod } from "./weather-validation.js";

const location = {
  countryCode: "GB",
  latitude: 51.5074,
  longitude: -0.1278,
  name: "London",
  timezone: "Europe/London",
};
const period = {
  endAt: "2026-07-29T12:00:00.000Z",
  startAt: "2026-07-28T12:00:00.000Z",
};

describe("weather validation", () => {
  it("requires exact bounded forecast periods", () => {
    expect(() =>
      createForecastWeatherPeriod(
        { startAt: "tomorrow" },
        new Date(period.startAt),
      ),
    ).toThrow("Weather startAt must be an exact ISO timestamp.");
    expect(() =>
      createForecastWeatherPeriod(
        {
          endAt: "2026-08-14T12:00:00.000Z",
          startAt: period.startAt,
        },
        new Date(period.startAt),
      ),
    ).toThrow(
      "Weather forecast periods must be ordered and no longer than 16 days.",
    );
  });

  it("rejects malformed geocoding fields and provider fact mismatches", async () => {
    expect(() =>
      validateWeatherLocations([
        { ...location, timezone: "not/a-real-timezone" },
      ]),
    ).toThrow("Weather location results were malformed or ambiguous.");

    const forecast = await createWeatherProviderFixture().getForecast(
      { location, period, units: metricWeatherUnits },
      {},
    );
    expect(() =>
      validateWeatherForecast(
        {
          ...forecast,
          units: { ...forecast.units, temperature: "fahrenheit" },
        },
        location,
        period,
      ),
    ).toThrow("Weather provider returned malformed forecast data.");
  });

  it("compares exact provider facts structurally rather than by property order", async () => {
    const forecast = await createWeatherProviderFixture().getForecast(
      { location, period, units: metricWeatherUnits },
      {},
    );
    const reorderedLocation = {
      timezone: location.timezone,
      name: location.name,
      longitude: location.longitude,
      latitude: location.latitude,
      countryCode: location.countryCode,
    };

    expect(() =>
      validateWeatherForecast(
        { ...forecast, location: reorderedLocation },
        location,
        period,
      ),
    ).not.toThrow();
  });

  it.each([
    [
      "an impossible daily calendar date",
      (forecast: WeatherForecast) => ({
        ...forecast,
        daily: [{ ...forecast.daily[0]!, date: "2026-02-30" }],
      }),
    ],
    [
      "negative precipitation",
      (forecast: WeatherForecast) => ({
        ...forecast,
        current: { ...forecast.current, precipitation: -0.1 },
      }),
    ],
    [
      "negative wind speed",
      (forecast: WeatherForecast) => ({
        ...forecast,
        hourly: [{ ...forecast.hourly[0]!, windSpeed: -1 }],
      }),
    ],
    [
      "a duplicate hourly timestamp",
      (forecast: WeatherForecast) => ({
        ...forecast,
        hourly: [forecast.hourly[0]!, { ...forecast.hourly[0]! }],
      }),
    ],
    [
      "unordered hourly timestamps",
      (forecast: WeatherForecast) => ({
        ...forecast,
        hourly: [
          {
            ...forecast.hourly[0]!,
            forecastAt: "2026-07-29T10:00:00.000Z",
          },
          forecast.hourly[0]!,
        ],
      }),
    ],
    [
      "an hourly timestamp outside the requested period",
      (forecast: WeatherForecast) => ({
        ...forecast,
        hourly: [
          {
            ...forecast.hourly[0]!,
            forecastAt: "2026-07-30T09:00:00.000Z",
          },
        ],
      }),
    ],
  ])("rejects %s", async (_label, mutate) => {
    const forecast = await createWeatherProviderFixture().getForecast(
      { location, period, units: metricWeatherUnits },
      {},
    );

    expect(() =>
      validateWeatherForecast(mutate(forecast), location, period),
    ).toThrow("Weather provider returned malformed forecast data.");
  });

  it("identifies stale observation freshness", async () => {
    const forecast = await createWeatherProviderFixture().getForecast(
      { location, period, units: metricWeatherUnits },
      {},
    );

    expect(
      weatherForecastIsStale(
        forecast,
        new Date("2026-07-28T18:01:00.000Z"),
        360 * 60_000,
      ),
    ).toBe(true);
    expect(
      weatherForecastIsStale(
        forecast,
        new Date("2026-07-28T12:05:00.000Z"),
        360 * 60_000,
      ),
    ).toBe(false);
    expect(() =>
      weatherForecastIsStale(
        forecast,
        new Date("2026-07-28T11:54:59.000Z"),
        360 * 60_000,
      ),
    ).toThrow("Weather provider returned future-dated freshness data.");
  });
});
