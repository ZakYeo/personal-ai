import { createMockWeatherProvider } from "./mock-weather.js";

describe("createMockWeatherProvider", () => {
  it("resolves deterministic places and preserves exact forecast facts", async () => {
    const provider = createMockWeatherProvider();

    const locations = await provider.findLocations({ place: "London" }, {});
    expect(locations).toEqual([
      {
        countryCode: "GB",
        latitude: 51.5074,
        longitude: -0.1278,
        name: "London",
        timezone: "Europe/London",
      },
    ]);

    await expect(
      provider.getForecast(
        {
          location: locations[0]!,
          period: {
            endAt: "2026-07-29T12:00:00.000Z",
            startAt: "2026-07-28T12:00:00.000Z",
          },
          units: {
            precipitation: "mm",
            temperature: "celsius",
            windSpeed: "km/h",
          },
        },
        {},
      ),
    ).resolves.toEqual({
      attribution: {
        name: "Deterministic weather fixture",
        url: "https://example.test/weather-source",
      },
      current: {
        observedAt: "2026-07-28T12:00:00.000Z",
        precipitation: 0,
        temperature: 21,
        weather: "partly cloudy",
        windSpeed: 12,
      },
      daily: [
        {
          date: "2026-07-29",
          precipitation: 1.2,
          temperatureMax: 23,
          temperatureMin: 15,
          weather: "light rain",
          windSpeedMax: 18,
        },
      ],
      fetchedAt: "2026-07-28T12:00:05.000Z",
      generatedAt: "2026-07-28T12:00:00.000Z",
      hourly: [
        {
          forecastAt: "2026-07-29T09:00:00.000Z",
          precipitation: 0.4,
          temperature: 17,
          weather: "light rain",
          windSpeed: 14,
        },
      ],
      location: locations[0],
      period: {
        endAt: "2026-07-29T12:00:00.000Z",
        startAt: "2026-07-28T12:00:00.000Z",
      },
      units: {
        precipitation: "mm",
        temperature: "celsius",
        windSpeed: "km/h",
      },
    });
  });

  it("returns no guessed location for an unknown place", async () => {
    const provider = createMockWeatherProvider();

    await expect(
      provider.findLocations({ place: "Unknown place" }, {}),
    ).resolves.toEqual([]);
  });
});
