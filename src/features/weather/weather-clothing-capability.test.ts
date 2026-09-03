import {
  createFeatureContext,
  executeFeature,
  expectCapabilityMetadata,
} from "../../test-support/feature-contract.js";
import { createWeatherProviderFixture } from "../../test-support/weather.js";
import { createWeatherWatchStoreFixture } from "../../test-support/weather-watch-store.js";
import type { HourlyWeatherForecast } from "../../ports/weather.js";
import type { WeatherClothingAdvisorPort } from "../../ports/weather-clothing-advisor.js";
import { createWeatherFeature } from "./weather-feature.js";

const now = new Date("2026-07-28T12:00:00.000Z");
const context = {
  ...createFeatureContext(),
  clock: { now: () => now },
};

describe("weather clothing capability", () => {
  it("declares a bounded generalized clothing contract and compatible coat contract", () => {
    const feature = createTestFeature();

    expectCapabilityMetadata(feature, {
      name: "weather.clothing",
      parameters: {
        goal: {
          allowedValues: ["assess_item", "recommend_outfit"],
          description: expect.any(String) as string,
          required: true,
          type: "string",
        },
        endAt: { description: expect.any(String) as string, type: "string" },
        item: {
          description: expect.any(String) as string,
          type: "string",
        },
        location: { type: "string" },
        occasion: { description: expect.any(String) as string, type: "string" },
        startAt: {
          description: expect.any(String) as string,
          type: "string",
        },
      },
      risk: "low",
    });
    expectCapabilityMetadata(feature, {
      name: "weather.coat",
      parameters: {
        endAt: { description: expect.any(String) as string, type: "string" },
        location: { type: "string" },
        startAt: {
          description: expect.any(String) as string,
          type: "string",
        },
      },
      risk: "low",
    });
  });

  it("uses current observations when no time is supplied", async () => {
    const provider = createWeatherProviderFixture();
    const getForecast = vi.spyOn(provider, "getForecast");
    const adviser = createAdviser();
    const advise = vi.spyOn(adviser, "advise");

    const result = await executeFeature(
      createTestFeature(provider, adviser),
      "weather.clothing",
      {
        goal: "assess_item",
        item: "T-shirt",
        location: "London",
      },
      context,
    );

    expect(getForecast).toHaveBeenCalledWith(
      expect.objectContaining({
        period: {
          endAt: "2026-07-28T12:00:00.000Z",
          startAt: "2026-07-28T12:00:00.000Z",
        },
      }),
      {},
    );
    expect(advise).toHaveBeenCalledWith(
      {
        conditions: [
          {
            at: "2026-07-28T12:00:00.000Z",
            precipitation: 0,
            temperature: 21,
            weather: "partly cloudy",
            windSpeed: 12,
          },
        ],
        goal: { item: "T-shirt", kind: "assess_item" },
        units: {
          precipitation: "mm",
          temperature: "celsius",
          windSpeed: "km/h",
        },
      },
      {},
    );
    expect(result.text).toContain(
      "Weather recommendation for T-shirt: recommended",
    );
    expect(result.data).toMatchObject({
      clothingAdviceGoal: "assess_item",
      clothingItem: "T-shirt",
      clothingRecommendation: "recommended",
      currentObservedAt: "2026-07-28T12:00:00.000Z",
      requestedPeriodEndAt: "2026-07-28T12:00:00.000Z",
      requestedPeriodStartAt: "2026-07-28T12:00:00.000Z",
      selected0At: "2026-07-28T12:00:00.000Z",
      selected0Temperature: 21,
      selectedCount: 1,
    });
  });

  it("uses current observations when the exact current instant is supplied", async () => {
    const provider = createWeatherProviderFixture();
    const adviser = createAdviser();
    const advise = vi.spyOn(adviser, "advise");

    const result = await executeFeature(
      createTestFeature(provider, adviser),
      "weather.coat",
      {
        location: "London",
        startAt: "2026-07-28T12:00:00.000Z",
      },
      context,
    );

    expect(advise).toHaveBeenCalledWith(
      expect.objectContaining({
        conditions: [
          expect.objectContaining({
            at: "2026-07-28T12:00:00.000Z",
            temperature: 21,
          }),
        ],
      }),
      {},
    );
    expect(result.data).toMatchObject({
      requestedPeriodStartAt: "2026-07-28T12:00:00.000Z",
      selected0At: "2026-07-28T12:00:00.000Z",
    });
  });

  it("queries around a future point and selects the nearest hourly forecast", async () => {
    const provider = createWeatherProviderFixture();
    const getForecast = vi.spyOn(provider, "getForecast");

    const result = await executeFeature(
      createTestFeature(provider),
      "weather.clothing",
      {
        goal: "assess_item",
        item: "umbrella",
        location: "London",
        startAt: "2026-07-29T09:00:00.000Z",
      },
      context,
    );

    expect(getForecast).toHaveBeenCalledWith(
      expect.objectContaining({
        period: {
          endAt: "2026-07-29T10:00:00.000Z",
          startAt: "2026-07-29T08:00:00.000Z",
        },
      }),
      {},
    );
    expect(result.text).toContain(
      "Weather recommendation for umbrella: recommended",
    );
    expect(result.data).toMatchObject({
      clothingRecommendation: "recommended",
      requestedPeriodEndAt: "2026-07-29T09:00:00.000Z",
      requestedPeriodStartAt: "2026-07-29T09:00:00.000Z",
      selected0At: "2026-07-29T09:00:00.000Z",
    });
  });

  it("uses the earlier hourly forecast when a future-point tie is exact", async () => {
    const result = await executeFeature(
      createTestFeature(
        providerWithHourly([
          hourly("2026-07-29T08:00:00.000Z", 12),
          hourly("2026-07-29T10:00:00.000Z", 24),
        ]),
      ),
      "weather.clothing",
      {
        goal: "assess_item",
        item: "jumper",
        location: "London",
        startAt: "2026-07-29T09:00:00.000Z",
      },
      context,
    );

    expect(result.data).toMatchObject({
      clothingRecommendation: "recommended",
      selected0At: "2026-07-29T08:00:00.000Z",
      selected0Temperature: 12,
    });
  });

  it("uses every hourly forecast inside an inclusive period", async () => {
    const result = await executeFeature(
      createTestFeature(
        providerWithHourly([
          hourly("2026-07-29T08:00:00.000Z", 23),
          {
            ...hourly("2026-07-29T09:00:00.000Z", 21),
            precipitation: 0.4,
            weather: "light rain",
          },
          hourly("2026-07-29T10:00:00.000Z", 22),
        ]),
        createAdviser({
          kind: "item_assessment",
          recommendation: "not_recommended",
        }),
      ),
      "weather.clothing",
      {
        goal: "assess_item",
        endAt: "2026-07-29T10:00:00.000Z",
        item: "shorts",
        location: "London",
        startAt: "2026-07-29T08:00:00.000Z",
      },
      context,
    );

    expect(result.data).toMatchObject({
      clothingRecommendation: "not_recommended",
      selected0At: "2026-07-29T08:00:00.000Z",
      selected1At: "2026-07-29T09:00:00.000Z",
      selected2At: "2026-07-29T10:00:00.000Z",
      selectedCount: 3,
    });
  });

  it("falls back to the nearest midpoint forecast within one hour for an empty period", async () => {
    const result = await executeFeature(
      createTestFeature(
        providerWithHourly([hourly("2026-07-29T09:00:00.000Z", 14)]),
      ),
      "weather.clothing",
      {
        goal: "assess_item",
        endAt: "2026-07-29T09:20:00.000Z",
        item: "hoodie",
        location: "London",
        startAt: "2026-07-29T09:10:00.000Z",
      },
      context,
    );

    expect(result.data).toMatchObject({
      clothingRecommendation: "recommended",
      selected0At: "2026-07-29T09:00:00.000Z",
      selectedCount: 1,
    });
  });

  it("preserves canonical weather facts when no suitable interval is available", async () => {
    const result = await executeFeature(
      createTestFeature(providerWithHourly([])),
      "weather.clothing",
      {
        goal: "assess_item",
        item: "jumper",
        location: "London",
        startAt: "2026-07-29T09:00:00.000Z",
      },
      context,
    );

    expect(result).toMatchObject({
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
        queryPeriodEndAt: "2026-07-29T10:00:00.000Z",
        queryPeriodStartAt: "2026-07-29T08:00:00.000Z",
        temperatureUnit: "celsius",
        timezone: "Europe/London",
        windSpeedUnit: "km/h",
      },
      spokenText: {
        dateStyle: "contextual",
        timeZone: "Europe/London",
      },
    });
  });

  it("handles exact instants across a daylight-saving transition", async () => {
    const provider = createWeatherProviderFixture();
    const getForecast = vi.spyOn(provider, "getForecast");
    await executeFeature(
      createTestFeature(provider),
      "weather.coat",
      {
        location: "London",
        startAt: "2026-10-25T01:30:00.000Z",
      },
      {
        ...context,
        clock: { now: () => new Date("2026-10-24T12:00:00.000Z") },
      },
    );

    expect(getForecast).toHaveBeenCalledWith(
      expect.objectContaining({
        period: {
          endAt: "2026-10-25T02:30:00.000Z",
          startAt: "2026-10-25T00:30:00.000Z",
        },
      }),
      {},
    );
  });

  it.each([
    [{ endAt: "2026-07-29T10:00:00.000Z" }, "requires startAt"],
    [
      {
        endAt: "2026-07-29T08:00:00.000Z",
        startAt: "2026-07-29T10:00:00.000Z",
      },
      "must be ordered",
    ],
    [{ startAt: "2026-08-14T12:00:00.001Z" }, "within 16 days"],
    [
      {
        endAt: "2026-08-13T12:00:00.000Z",
        startAt: "2026-07-28T12:00:00.000Z",
      },
      "at most 16 local calendar dates",
    ],
  ])("rejects an invalid clothing period", async (period, message) => {
    await expect(
      executeFeature(
        createTestFeature(),
        "weather.coat",
        { location: "London", ...period },
        context,
      ),
    ).rejects.toThrow(message);
  });

  it("supports arbitrary named items without classifying them", async () => {
    const result = await executeFeature(
      createTestFeature(
        createWeatherProviderFixture(),
        createAdviser({
          kind: "item_assessment",
          recommendation: "uncertain",
        }),
      ),
      "weather.clothing",
      {
        goal: "assess_item",
        item: "ceremonial sash",
        location: "London",
      },
      context,
    );

    expect(result.data).toMatchObject({ clothingRecommendation: "uncertain" });
    expect(result.text).toContain(
      "Weather recommendation for ceremonial sash: uncertain",
    );
  });

  it.each([
    "hoodie",
    "T-shirt",
    "umbrella",
    "shorts",
    "trousers",
    "my coat",
    "a hoodie",
  ])(
    "phrases the arbitrary item %s without guessing an article",
    async (item) => {
      const result = await executeFeature(
        createTestFeature(),
        "weather.clothing",
        { goal: "assess_item", item, location: "London" },
        context,
      );

      expect(result.text).toContain(
        `Weather recommendation for ${item}: recommended`,
      );
      expect(result.text).not.toContain(`recommend a ${item}`);
      expect(result.text).not.toContain("conditions conditions");
    },
  );

  it("recommends one bounded outfit without requiring an item", async () => {
    const adviser = createAdviser({
      items: ["a T-shirt", "lightweight trousers"],
      kind: "outfit_recommendation",
    });

    const result = await executeFeature(
      createTestFeature(createWeatherProviderFixture(), adviser),
      "weather.clothing",
      {
        goal: "recommend_outfit",
        location: "London",
        occasion: "walking to work",
      },
      context,
    );

    expect(result).toMatchObject({
      data: {
        clothingAdviceGoal: "recommend_outfit",
        clothingOccasion: "walking to work",
        outfitItem0: "a T-shirt",
        outfitItem1: "lightweight trousers",
        outfitItemCount: 2,
      },
      responseRewrite: "disabled",
      text: expect.stringContaining(
        "I recommend a T-shirt and lightweight trousers in London right now",
      ) as string,
    });
  });

  it("requests an item only for an item-assessment goal", async () => {
    await expect(
      executeFeature(
        createTestFeature(),
        "weather.clothing",
        { goal: "assess_item", location: "London" },
        context,
      ),
    ).resolves.toEqual({
      kind: "resumable_clarification",
      parameter: "item",
      text: "Which clothing item would you like me to assess?",
    });
  });

  it("returns weather facts and an internal diagnostic when advice fails", async () => {
    const cause = new Error("provider secret failure");
    const adviser: WeatherClothingAdvisorPort = {
      advise: () => Promise.reject(cause),
    };

    const result = await executeFeature(
      createTestFeature(createWeatherProviderFixture(), adviser),
      "weather.clothing",
      { goal: "recommend_outfit", location: "London" },
      context,
    );

    expect(result).toMatchObject({
      citations: [{ title: "Deterministic weather fixture" }],
      data: { location: "London", selectedCount: 1 },
      failure: { cause, message: "Weather clothing adviser failed." },
      responseRewrite: "disabled",
      text: "I found the weather for London, but clothing advice is temporarily unavailable. Source: Deterministic weather fixture.",
    });
  });
});

function createTestFeature(
  provider = createWeatherProviderFixture(),
  clothingAdviser = createAdviser(),
) {
  return createWeatherFeature(provider, {
    clothingAdviser,
    watchStore: createWeatherWatchStoreFixture({ now: () => now }),
  });
}

function createAdviser(
  advice:
    | Awaited<ReturnType<WeatherClothingAdvisorPort["advise"]>>
    | undefined = {
    kind: "item_assessment",
    recommendation: "recommended",
  },
): WeatherClothingAdvisorPort {
  return { advise: () => Promise.resolve(advice) };
}

function hourly(
  forecastAt: string,
  temperature: number,
): HourlyWeatherForecast {
  return {
    forecastAt,
    precipitation: 0,
    temperature,
    weather: "partly cloudy",
    windSpeed: 12,
  };
}

function providerWithHourly(hourlyForecasts: HourlyWeatherForecast[]) {
  const provider = createWeatherProviderFixture();
  return {
    ...provider,
    getForecast: async (...args: Parameters<typeof provider.getForecast>) => ({
      ...(await provider.getForecast(...args)),
      hourly: hourlyForecasts.filter(
        (item) =>
          item.forecastAt >= args[0].period.startAt &&
          item.forecastAt <= args[0].period.endAt,
      ),
    }),
  };
}
