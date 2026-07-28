import { createWeatherProviderFixture } from "../../test-support/weather.js";
import {
  createForecastWeatherPeriod,
  metricWeatherUnits,
  validateWeatherForecast,
  validateWeatherLocations,
  weatherForecastIsStale,
} from "./weather-validation.js";

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

  it("distinguishes stale data from invalid future freshness", async () => {
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
    expect(() =>
      weatherForecastIsStale(
        forecast,
        new Date("2026-07-28T11:54:59.000Z"),
        360 * 60_000,
      ),
    ).toThrow("Weather provider returned future-dated freshness data.");
  });
});
