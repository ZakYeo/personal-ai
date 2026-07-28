import {
  createFeatureContext,
  executeFeature,
  expectCapabilityMetadata,
} from "../../test-support/feature-contract.js";
import { createWeatherProviderFixture } from "../../test-support/weather.js";
import { createWeatherFeature } from "./weather-feature.js";

const now = new Date("2026-07-28T12:00:00.000Z");
const context = {
  ...createFeatureContext(),
  clock: { now: () => now },
};

describe("createWeatherFeature", () => {
  it("declares low-risk current and forecast capabilities", () => {
    const feature = createWeatherFeature(createWeatherProviderFixture());

    expectCapabilityMetadata(feature, {
      name: "weather.current",
      parameters: { location: { type: "string" } },
      risk: "low",
    });
    expectCapabilityMetadata(feature, {
      name: "weather.forecast",
      parameters: {
        endAt: {
          description:
            "Optional inclusive forecast-window end as an ISO timestamp.",
          type: "string",
        },
        location: { type: "string" },
        startAt: {
          description: "Optional forecast-window start as an ISO timestamp.",
          type: "string",
        },
      },
      risk: "low",
    });
  });

  it("clarifies rather than inferring a missing location", async () => {
    await expect(
      executeFeature(
        createWeatherFeature(createWeatherProviderFixture()),
        "weather.current",
        {},
        context,
      ),
    ).resolves.toEqual({
      expectsFollowUp: true,
      text: "Which location should I check?",
    });
  });

  it("returns current conditions with exact protected provider facts", async () => {
    const result = await executeFeature(
      createWeatherFeature(createWeatherProviderFixture()),
      "weather.current",
      { location: "London" },
      context,
    );

    expect(result.text).toContain(
      "In London, it is 21°C and partly cloudy, with 0 mm precipitation",
    );
    expect(result.text).toContain(
      "Source: Deterministic weather fixture (https://example.test/weather-source).",
    );
    expect(result.data).toMatchObject({
      attributionName: "Deterministic weather fixture",
      attributionUrl: "https://example.test/weather-source",
      fetchedAt: "2026-07-28T12:00:05.000Z",
      generatedAt: "2026-07-28T12:00:00.000Z",
      latitude: 51.5074,
      location: "London",
      longitude: -0.1278,
      observedAt: "2026-07-28T12:00:00.000Z",
      periodEndAt: "2026-07-28T12:00:00.000Z",
      periodStartAt: "2026-07-28T12:00:00.000Z",
      precipitation: 0,
      precipitationUnit: "mm",
      temperature: 21,
      temperatureUnit: "celsius",
      timezone: "Europe/London",
      weather: "partly cloudy",
      windSpeed: 12,
      windSpeedUnit: "km/h",
    });
  });

  it("returns an exact bounded forecast period and hourly/daily facts", async () => {
    const result = await executeFeature(
      createWeatherFeature(createWeatherProviderFixture()),
      "weather.forecast",
      {
        endAt: "2026-07-29T12:00:00.000Z",
        location: "London",
        startAt: "2026-07-28T12:00:00.000Z",
      },
      context,
    );

    expect(result.text).toContain(
      "London's forecast from 2026-07-28T12:00:00.000Z to 2026-07-29T12:00:00.000Z",
    );
    expect(result.data).toMatchObject({
      daily0Date: "2026-07-29",
      daily0Precipitation: 1.2,
      daily0TemperatureMax: 23,
      daily0TemperatureMin: 15,
      daily0Weather: "light rain",
      daily0WindSpeedMax: 18,
      dailyCount: 1,
      fetchedAt: "2026-07-28T12:00:05.000Z",
      generatedAt: "2026-07-28T12:00:00.000Z",
      hourly0ForecastAt: "2026-07-29T09:00:00.000Z",
      hourly0Precipitation: 0.4,
      hourly0Temperature: 17,
      hourly0Weather: "light rain",
      hourly0WindSpeed: 14,
      hourlyCount: 1,
      location: "London",
      periodEndAt: "2026-07-29T12:00:00.000Z",
      periodStartAt: "2026-07-28T12:00:00.000Z",
      timezone: "Europe/London",
    });
  });

  it("identifies ambiguous, unavailable, and stale forecasts", async () => {
    const ambiguousProvider = createWeatherProviderFixture();
    ambiguousProvider.findLocations = () =>
      Promise.resolve([
        {
          countryCode: "GB",
          latitude: 51.5,
          longitude: -0.1,
          name: "London, England",
          timezone: "Europe/London",
        },
        {
          countryCode: "CA",
          latitude: 42.98,
          longitude: -81.25,
          name: "London, Ontario",
          timezone: "America/Toronto",
        },
      ]);

    await expect(
      executeFeature(
        createWeatherFeature(ambiguousProvider),
        "weather.current",
        { location: "London" },
        context,
      ),
    ).resolves.toEqual({
      expectsFollowUp: true,
      text: "I found multiple locations for London: London, England (GB), London, Ontario (CA). Which one did you mean?",
    });

    await expect(
      executeFeature(
        createWeatherFeature(createWeatherProviderFixture()),
        "weather.current",
        { location: "Nowhere" },
        context,
      ),
    ).resolves.toEqual({
      expectsFollowUp: true,
      text: 'I could not find a weather location for "Nowhere". Which location should I use?',
    });

    const staleContext = {
      ...context,
      clock: { now: () => new Date("2026-07-28T18:01:00.000Z") },
    };
    await expect(
      executeFeature(
        createWeatherFeature(createWeatherProviderFixture(), {
          maxForecastAgeMinutes: 360,
        }),
        "weather.current",
        { location: "London" },
        staleContext,
      ),
    ).resolves.toEqual({
      data: {
        fetchedAt: "2026-07-28T12:00:05.000Z",
        generatedAt: "2026-07-28T12:00:00.000Z",
        location: "London",
        timezone: "Europe/London",
      },
      text: "The available weather data for London is stale, so I will not present it as current.",
    });
  });
});
