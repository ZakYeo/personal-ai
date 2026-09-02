import {
  createFeatureContext,
  executeFeature,
  expectCapabilityMetadata,
} from "../../test-support/feature-contract.js";
import { createWeatherProviderFixture } from "../../test-support/weather.js";
import { createWeatherWatchStoreFixture } from "../../test-support/weather-watch-store.js";
import { createWeatherClothingAdvisorFixture } from "../../test-support/weather-clothing-advisor.js";
import type { PersonalContextReaderPort } from "../../ports/personal-context.js";
import { createWeatherFeature } from "./weather-feature.js";

const now = new Date("2026-07-28T12:00:00.000Z");
const context = {
  ...createFeatureContext(),
  clock: { now: () => now },
};

describe("createWeatherFeature", () => {
  it("declares low-risk current and forecast capabilities", () => {
    const feature = createTestWeatherFeature();

    expectCapabilityMetadata(feature, {
      name: "weather.current",
      parameters: {
        includePrecipitation: {
          description:
            "Include the exact precipitation amount only when explicitly requested.",
          type: "boolean",
        },
        includeWind: {
          description:
            "Include the exact wind speed only when explicitly requested.",
          type: "boolean",
        },
        location: { type: "string" },
      },
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
        includePrecipitation: {
          description:
            "Include the exact precipitation amount only when explicitly requested.",
          type: "boolean",
        },
        includeWind: {
          description:
            "Include the exact wind speed only when explicitly requested.",
          type: "boolean",
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

  it("uses only an explicitly authored home location for current coat advice", async () => {
    const readHomeLocation = vi.fn(() =>
      Promise.resolve({
        place: "London",
        provenance: "user-authored" as const,
      }),
    );

    const result = await executeFeature(
      createTestWeatherFeature(createWeatherProviderFixture(), {
        personalContext: { readHomeLocation },
      }),
      "weather.coat",
      { location: "home" },
      context,
    );

    expect(readHomeLocation).toHaveBeenCalledOnce();
    expect(result.text).toContain(
      "Weather recommendation for a coat: uncertain",
    );
    expect(result.data).toMatchObject({
      clothingAdviceGoal: "assess_item",
      clothingItem: "a coat",
      clothingRecommendation: "uncertain",
      fetchedAt: "2026-07-28T12:00:05.000Z",
      location: "London",
      requestedPeriodEndAt: "2026-07-28T12:00:00.000Z",
      requestedPeriodStartAt: "2026-07-28T12:00:00.000Z",
      selected0Temperature: 21,
      timezone: "Europe/London",
    });
  });

  it("clarifies a home request when no explicitly authored location exists", async () => {
    const personalContext: PersonalContextReaderPort = {
      readHomeLocation: () => Promise.resolve(undefined),
    };

    await expect(
      executeFeature(
        createTestWeatherFeature(createWeatherProviderFixture(), {
          personalContext,
        }),
        "weather.coat",
        { location: "home" },
        context,
      ),
    ).resolves.toEqual({
      kind: "resumable_clarification",
      parameter: "location",
      text: "I do not have an explicitly stored home location. Which location should I check?",
    });
  });

  it("does not infer coat advice when the requested period has no hourly forecast", async () => {
    const backingProvider = createWeatherProviderFixture();
    const provider = {
      ...backingProvider,
      getForecast: async (
        ...args: Parameters<typeof backingProvider.getForecast>
      ) => ({
        ...(await backingProvider.getForecast(...args)),
        hourly: [],
      }),
    };

    const result = await executeFeature(
      createTestWeatherFeature(provider),
      "weather.coat",
      {
        location: "London",
        startAt: "2026-07-29T09:00:00.000Z",
      },
      context,
    );

    expect(result.text).toContain(
      "no weather interval is available close enough to the requested time",
    );
    expect(result.data).toMatchObject({
      clothingRecommendationAvailable: false,
      requestedPeriodEndAt: "2026-07-29T09:00:00.000Z",
      requestedPeriodStartAt: "2026-07-29T09:00:00.000Z",
    });
    expect(result.data).not.toHaveProperty("clothingRecommendation");
  });

  it("clarifies rather than inferring a missing location", async () => {
    await expect(
      executeFeature(
        createTestWeatherFeature(),
        "weather.current",
        {},
        context,
      ),
    ).resolves.toEqual({
      kind: "resumable_clarification",
      parameter: "location",
      text: "Which location should I check?",
    });
  });

  it("reuses the latest weather location when the current request omits one", async () => {
    const provider = createWeatherProviderFixture();
    const findLocations = vi.spyOn(provider, "findLocations");
    const eastbourne = {
      countryCode: "GB",
      latitude: 50.768,
      longitude: 0.29,
      name: "Eastbourne",
      timezone: "Europe/London",
    };

    const result = await executeFeature(
      createTestWeatherFeature(provider),
      "weather.current",
      {},
      {
        ...context,
        selectResultReference: () => ({
          publicReference: {
            facts: {
              countryCode: "GB",
              name: "Eastbourne",
              timezone: "Europe/London",
            },
            kind: "weather_location",
            ordinal: 1,
            reference: "weather-location-1",
          },
          target: { kind: "weather_location", location: eastbourne },
        }),
        trustedInputText: "Could I wear a coat if I left now?",
      },
    );

    expect(findLocations).not.toHaveBeenCalled();
    expect(result.data).toMatchObject({ location: "Eastbourne" });
  });

  it("uses an explicitly requested home instead of the latest weather location", async () => {
    const selectResultReference = vi.fn();
    const readHomeLocation = vi.fn(() =>
      Promise.resolve({
        place: "London",
        provenance: "user-authored" as const,
      }),
    );

    const result = await executeFeature(
      createTestWeatherFeature(createWeatherProviderFixture(), {
        personalContext: { readHomeLocation },
      }),
      "weather.current",
      { location: "home" },
      { ...context, selectResultReference },
    );

    expect(selectResultReference).not.toHaveBeenCalled();
    expect(readHomeLocation).toHaveBeenCalledOnce();
    expect(result.data).toMatchObject({ location: "London" });
  });

  it("returns current conditions with exact protected provider facts", async () => {
    const result = await executeFeature(
      createTestWeatherFeature(),
      "weather.current",
      { location: "London" },
      context,
    );

    expect(result.text).toContain(
      "In London, it is 21°C and partly cloudy right now.",
    );
    expect(result.text).not.toMatch(/precipitation|wind|Fetched|Observed/iu);
    expect(result.text).toContain("Source: Deterministic weather fixture.");
    expect(result.text).not.toContain("https://");
    expect(result.citations).toEqual([
      {
        title: "Deterministic weather fixture",
        url: "https://example.test/weather-source",
      },
    ]);
    expect(result.resultReferences).toEqual({
      items: [
        {
          facts: {
            countryCode: "GB",
            name: "London",
            timezone: "Europe/London",
          },
          target: {
            kind: "weather_location",
            location: {
              countryCode: "GB",
              latitude: 51.5074,
              longitude: -0.1278,
              name: "London",
              timezone: "Europe/London",
            },
          },
        },
      ],
      kind: "weather_locations",
    });
    expect(result.data).toMatchObject({
      attributionName: "Deterministic weather fixture",
      attributionUrl: "https://example.test/weather-source",
      fetchedAt: "2026-07-28T12:00:05.000Z",
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

  it("describes only notable rain and wind without exposing exact measurements", async () => {
    const backingProvider = createWeatherProviderFixture();
    const provider = {
      ...backingProvider,
      getForecast: async (
        ...args: Parameters<typeof backingProvider.getForecast>
      ) => ({
        ...(await backingProvider.getForecast(...args)),
        current: {
          ...(await backingProvider.getForecast(...args)).current,
          precipitation: 0.4,
          weather: "light rain showers",
          windSpeed: 35,
        },
      }),
    };

    const result = await executeFeature(
      createTestWeatherFeature(provider),
      "weather.current",
      { location: "London" },
      context,
    );

    expect(result.text).toContain("There are showers. It is windy.");
    expect(result.text).not.toMatch(/0\.4|35 km\/h/iu);
  });

  it("includes exact weather measurements only when requested", async () => {
    const result = await executeFeature(
      createTestWeatherFeature(),
      "weather.current",
      { includePrecipitation: true, includeWind: true, location: "London" },
      context,
    );

    expect(result.text).toContain("Precipitation is 0 mm.");
    expect(result.text).toContain("Wind is 12 km/h.");
  });

  it("renders older current observations with relative freshness", async () => {
    const backingProvider = createWeatherProviderFixture();
    const provider = {
      ...backingProvider,
      getForecast: async (
        ...args: Parameters<typeof backingProvider.getForecast>
      ) => {
        const forecast = await backingProvider.getForecast(...args);
        return {
          ...forecast,
          current: {
            ...forecast.current,
            observedAt: "2026-07-28T11:00:00.000Z",
          },
        };
      },
    };

    const result = await executeFeature(
      createTestWeatherFeature(provider),
      "weather.current",
      { location: "London" },
      context,
    );

    expect(result.text).toContain("about an hour ago");
  });

  it("returns an exact bounded forecast period and hourly/daily facts", async () => {
    const result = await executeFeature(
      createTestWeatherFeature(),
      "weather.forecast",
      {
        endAt: "2026-07-29T12:00:00.000Z",
        location: "London",
        startAt: "2026-07-28T12:00:00.000Z",
      },
      context,
    );

    expect(result.text).toContain("London's forecast:");
    expect(result.text).not.toContain("Fetched at");
    expect(result.data).toMatchObject({
      daily0Date: "2026-07-29",
      daily0Precipitation: 1.2,
      daily0TemperatureMax: 23,
      daily0TemperatureMin: 15,
      daily0Weather: "light rain",
      daily0WindSpeedMax: 18,
      dailyCount: 1,
      fetchedAt: "2026-07-28T12:00:05.000Z",
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
          countryName: "United Kingdom",
          featureCode: "PPLC",
          location: {
            countryCode: "GB",
            latitude: 51.5,
            longitude: -0.1,
            name: "London, England",
            timezone: "Europe/London",
          },
          population: 8_961_989,
          providerRank: 1,
          searchName: "London",
        },
        {
          countryName: "Canada",
          featureCode: "PPLA2",
          location: {
            countryCode: "CA",
            latitude: 42.98,
            longitude: -81.25,
            name: "London, Ontario",
            timezone: "America/Toronto",
          },
          population: 422_324,
          providerRank: 2,
          searchName: "London",
        },
      ]);

    await expect(
      executeFeature(
        createTestWeatherFeature(ambiguousProvider),
        "weather.current",
        { location: "London" },
        context,
      ),
    ).resolves.toMatchObject({
      data: { location: "London, England" },
      text: expect.stringContaining("In London, England") as string,
    });

    await expect(
      executeFeature(
        createTestWeatherFeature(ambiguousProvider),
        "weather.current",
        { location: "London, Canada" },
        context,
      ),
    ).resolves.toMatchObject({
      data: { location: "London, Ontario" },
      text: expect.stringContaining("In London, Ontario") as string,
    });

    await expect(
      executeFeature(
        createTestWeatherFeature(),
        "weather.current",
        { location: "Nowhere" },
        context,
      ),
    ).resolves.toEqual({
      kind: "resumable_clarification",
      parameter: "location",
      text: 'I could not find a weather location for "Nowhere". Which location should I use?',
    });

    const staleContext = {
      ...context,
      clock: { now: () => new Date("2026-07-28T18:01:00.000Z") },
    };
    await expect(
      executeFeature(
        createTestWeatherFeature(createWeatherProviderFixture(), {
          maxForecastAgeMinutes: 360,
        }),
        "weather.current",
        { location: "London" },
        staleContext,
      ),
    ).resolves.toMatchObject({
      citations: [
        {
          title: "Deterministic weather fixture",
          url: "https://example.test/weather-source",
        },
      ],
      data: {
        attributionName: "Deterministic weather fixture",
        attributionUrl: "https://example.test/weather-source",
        currentObservedAt: "2026-07-28T12:00:00.000Z",
        fetchedAt: "2026-07-28T12:00:05.000Z",
        latitude: 51.5074,
        location: "London",
        longitude: -0.1278,
        precipitationUnit: "mm",
        periodEndAt: "2026-07-28T18:01:00.000Z",
        periodStartAt: "2026-07-28T18:01:00.000Z",
        temperatureUnit: "celsius",
        timezone: "Europe/London",
        windSpeedUnit: "km/h",
      },
      spokenText: {
        dateStyle: "contextual",
        timeZone: "Europe/London",
      },
      resultReferences: {
        items: [
          {
            facts: { countryCode: "GB", name: "London" },
            target: { kind: "weather_location" },
          },
        ],
        kind: "weather_locations",
      },
      text: "The available weather data for London is stale, so I will not present it as current.",
    });
  });
});

function createTestWeatherFeature(
  provider = createWeatherProviderFixture(),
  options: {
    maxForecastAgeMinutes?: number;
    personalContext?: PersonalContextReaderPort;
  } = {},
) {
  return createWeatherFeature(provider, {
    ...options,
    clothingAdviser: createWeatherClothingAdvisorFixture(),
    watchStore: createWeatherWatchStoreFixture({ now: () => now }),
  });
}
