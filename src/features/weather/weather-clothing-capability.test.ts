import {
  createFeatureContext,
  executeFeature,
  expectCapabilityMetadata,
} from "../../test-support/feature-contract.js";
import { createWeatherProviderFixture } from "../../test-support/weather.js";
import { createWeatherWatchStoreFixture } from "../../test-support/weather-watch-store.js";
import type { HourlyWeatherForecast } from "../../ports/weather.js";
import { weatherClothingCategories } from "../../application/weather-clothing-policy.js";
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
        category: {
          allowedValues: weatherClothingCategories,
          description: expect.any(String) as string,
          required: true,
          type: "string",
        },
        endAt: { description: expect.any(String) as string, type: "string" },
        item: {
          description: expect.any(String) as string,
          required: true,
          type: "string",
        },
        location: { type: "string" },
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

    const result = await executeFeature(
      createTestFeature(provider),
      "weather.clothing",
      {
        category: "light_top",
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
    expect(result.text).toContain("recommend a T-shirt");
    expect(result.data).toMatchObject({
      clothingCategory: "light_top",
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

  it("queries around a future point and selects the nearest hourly forecast", async () => {
    const provider = createWeatherProviderFixture();
    const getForecast = vi.spyOn(provider, "getForecast");

    const result = await executeFeature(
      createTestFeature(provider),
      "weather.clothing",
      {
        category: "rain_protection",
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
    expect(result.text).toContain("recommend an umbrella");
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
        category: "warm_layer",
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
      ),
      "weather.clothing",
      {
        category: "short_legwear",
        endAt: "2026-07-29T10:00:00.000Z",
        item: "shorts",
        location: "London",
        startAt: "2026-07-29T08:00:00.000Z",
      },
      context,
    );

    expect(result.data).toMatchObject({
      clothingRecommendation: "not_recommended",
      decidingWet: true,
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
        category: "warm_layer",
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

  it("returns a bounded limitation for unclassified items", async () => {
    const result = await executeFeature(
      createTestFeature(),
      "weather.clothing",
      {
        category: "other",
        item: "ceremonial sash",
        location: "London",
      },
      context,
    );

    expect(result.data).toMatchObject({ clothingRecommendation: "limited" });
    expect(result.text).toContain("cannot make a dependable recommendation");
  });
});

function createTestFeature(provider = createWeatherProviderFixture()) {
  return createWeatherFeature(provider, {
    watchStore: createWeatherWatchStoreFixture({ now: () => now }),
  });
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
