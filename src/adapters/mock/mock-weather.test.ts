import { createMockWeatherProvider } from "./mock-weather.js";

describe("createMockWeatherProvider", () => {
  it("resolves deterministic places and preserves exact forecast facts", async () => {
    const provider = createMockWeatherProvider();

    const locations = await provider.findLocations({ place: "London" }, {});
    expect(locations).toEqual([
      {
        countryName: "United Kingdom",
        featureCode: "PPLC",
        location: {
          countryCode: "GB",
          latitude: 51.5074,
          longitude: -0.1278,
          name: "London",
          timezone: "Europe/London",
        },
        population: 8_961_989,
        providerRank: 1,
        searchName: "London",
      },
    ]);

    const period = {
      endAt: "2026-07-29T12:00:00.000Z",
      startAt: "2026-07-28T12:00:00.000Z",
    };
    const units = {
      precipitation: "mm" as const,
      temperature: "celsius" as const,
      windSpeed: "km/h" as const,
    };

    const forecast = await provider.getForecast(
      { location: locations[0]!.location, period, units },
      {},
    );

    expect(forecast).toMatchObject({
      attribution: { name: "Deterministic weather fixture" },
      current: { observedAt: "2026-07-28T12:00:00.000Z", temperature: 21 },
      daily: [{ date: "2026-07-29", precipitation: 1.2 }],
      fetchedAt: "2026-07-28T12:00:05.000Z",
      hourly: [
        {
          forecastAt: "2026-07-29T09:00:00.000Z",
          temperature: 17,
        },
      ],
      location: locations[0]!.location,
      period,
      units,
    });
    expect(forecast).toHaveProperty(
      "attribution.url",
      "https://example.test/weather-source",
    );
    expect(forecast.current).toEqual(
      expect.objectContaining({
        precipitation: 0,
        weather: "partly cloudy",
        windSpeed: 12,
      }),
    );
    expect(forecast.daily[0]).toEqual(
      expect.objectContaining({
        temperatureMax: 23,
        temperatureMin: 15,
        weather: "light rain",
        windSpeedMax: 18,
      }),
    );
    expect(forecast.hourly[0]).toEqual(
      expect.objectContaining({
        precipitation: 0.4,
        weather: "light rain",
        windSpeed: 14,
      }),
    );
  });

  it("returns no guessed location for an unknown place", async () => {
    const provider = createMockWeatherProvider();

    await expect(
      provider.findLocations({ place: "Unknown place" }, {}),
    ).resolves.toEqual([]);
  });
});
