import {
  createAbortingFetchStub,
  createFetchStub,
  jsonResponse,
  malformedJsonResponse,
  providerErrorResponse,
} from "../../test-support/adapter-contract.js";
import {
  createOpenMeteoForecastRequest,
  createOpenMeteoForecastResponse,
  createOpenMeteoGeocodingResponse,
} from "../../test-support/open-meteo.js";
import { OpenMeteoWeatherError } from "./open-meteo-error.js";
import { createOpenMeteoWeatherProvider } from "./open-meteo-weather.js";

const config = {
  forecastUrl: "https://api.open-meteo.com/v1/forecast",
  geocodingUrl: "https://geocoding-api.open-meteo.com/v1/search",
  timeoutMs: 5_000,
};

describe("createOpenMeteoWeatherProvider", () => {
  it("resolves an explicit place through the pinned keyless endpoint", async () => {
    const fetch = createFetchStub(
      jsonResponse(createOpenMeteoGeocodingResponse()),
    );
    const provider = createOpenMeteoWeatherProvider({
      config,
      fetch,
      now: () => new Date("2026-07-28T12:00:05.000Z"),
    });

    await expect(
      provider.findLocations({ place: " London " }, {}),
    ).resolves.toEqual([
      {
        countryCode: "GB",
        latitude: 51.50853,
        longitude: -0.12574,
        name: "London, England",
        timezone: "Europe/London",
      },
    ]);

    const requested = new URL(
      String((fetch as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]),
    );
    expect(requested.origin + requested.pathname).toBe(config.geocodingUrl);
    expect(Object.fromEntries(requested.searchParams)).toEqual({
      count: "5",
      language: "en",
      name: "London",
    });
    expect(requested.searchParams.has("apikey")).toBe(false);
    expect(
      (fetch as ReturnType<typeof vi.fn>).mock.calls[0]?.[1],
    ).toMatchObject({ method: "GET" });
  });

  it("parses exact metric facts and resolves provider-local times to UTC", async () => {
    const fetch = createFetchStub(
      jsonResponse(createOpenMeteoForecastResponse()),
    );
    const provider = createOpenMeteoWeatherProvider({
      config,
      fetch,
      now: () => new Date("2026-07-28T12:00:05.000Z"),
    });
    const request = createOpenMeteoForecastRequest();

    await expect(provider.getForecast(request, {})).resolves.toEqual({
      attribution: {
        name: "Weather data by Open-Meteo.com",
        url: "https://open-meteo.com/",
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
          weather: "slight rain",
          windSpeedMax: 18,
        },
      ],
      fetchedAt: "2026-07-28T12:00:05.000Z",
      hourly: [
        {
          forecastAt: "2026-07-29T09:00:00.000Z",
          precipitation: 0.4,
          temperature: 17,
          weather: "slight rain",
          windSpeed: 14,
        },
      ],
      location: request.location,
      period: request.period,
      units: request.units,
    });

    const requested = new URL(
      String((fetch as ReturnType<typeof vi.fn>).mock.calls[0]?.[0]),
    );
    expect(requested.origin + requested.pathname).toBe(config.forecastUrl);
    expect(Object.fromEntries(requested.searchParams)).toEqual({
      current: "temperature_2m,precipitation,weather_code,wind_speed_10m",
      daily:
        "temperature_2m_max,temperature_2m_min,precipitation_sum,weather_code,wind_speed_10m_max",
      end_date: "2026-07-29",
      hourly: "temperature_2m,precipitation,weather_code,wind_speed_10m",
      latitude: "51.50853",
      longitude: "-0.12574",
      precipitation_unit: "mm",
      start_date: "2026-07-28",
      temperature_unit: "celsius",
      timeformat: "iso8601",
      timezone: "Europe/London",
      wind_speed_unit: "kmh",
    });
    expect(requested.searchParams.has("apikey")).toBe(false);
  });

  it.each([
    [
      "mismatched timezone",
      createOpenMeteoForecastResponse({ timezone: "UTC" }),
    ],
    [
      "mismatched units",
      createOpenMeteoForecastResponse({
        current_units: {
          precipitation: "inch",
          temperature_2m: "°F",
          time: "iso8601",
          weather_code: "wmo code",
          wind_speed_10m: "mph",
        },
      }),
    ],
    [
      "mismatched arrays",
      createOpenMeteoForecastResponse({
        hourly: {
          precipitation: [],
          temperature_2m: [17],
          time: ["2026-07-29T10:00"],
          weather_code: [61],
          wind_speed_10m: [14],
        },
      }),
    ],
    [
      "unknown weather code",
      createOpenMeteoForecastResponse({
        current: {
          precipitation: 0,
          temperature_2m: 21,
          time: "2026-07-28T13:00",
          weather_code: 100,
          wind_speed_10m: 12,
        },
      }),
    ],
  ])("rejects %s forecast data", async (_label, body) => {
    const provider = createOpenMeteoWeatherProvider({
      config,
      fetch: createFetchStub(jsonResponse(body)),
      now: () => new Date("2026-07-28T12:00:05.000Z"),
    });

    await expect(
      provider.getForecast(createOpenMeteoForecastRequest(), {}),
    ).rejects.toThrow("Open-Meteo returned malformed forecast data.");
  });

  it.each([
    [
      "rate limits",
      createFetchStub(providerErrorResponse(429, { reason: "private detail" })),
      "Open-Meteo forecast request failed with status 429.",
    ],
    [
      "malformed JSON",
      createFetchStub(malformedJsonResponse()),
      "Open-Meteo forecast response body was not valid JSON.",
    ],
  ])("preserves diagnostic context for %s", async (_label, fetch, message) => {
    const provider = createOpenMeteoWeatherProvider({
      config,
      fetch,
      now: () => new Date("2026-07-28T12:00:05.000Z"),
    });

    const error = await provider
      .getForecast(createOpenMeteoForecastRequest(), {})
      .catch((cause: unknown) => cause);

    expect(error).toBeInstanceOf(OpenMeteoWeatherError);
    expect(error).toMatchObject({ message });
  });

  it("cancels forecast request and body consumption from the caller signal", async () => {
    const provider = createOpenMeteoWeatherProvider({
      config,
      fetch: createAbortingFetchStub(),
      now: () => new Date("2026-07-28T12:00:05.000Z"),
    });
    const controller = new AbortController();

    const pending = provider.getForecast(createOpenMeteoForecastRequest(), {
      signal: controller.signal,
    });
    controller.abort();

    await expect(pending).rejects.toThrow(
      "Open-Meteo forecast request was cancelled.",
    );
  });

  it("cancels in-progress forecast body consumption", async () => {
    let bodyCancelled = false;
    const fetch = vi.fn<typeof globalThis.fetch>(() =>
      Promise.resolve(
        new Response(
          new ReadableStream<Uint8Array>({
            cancel() {
              bodyCancelled = true;
            },
            start(controller) {
              controller.enqueue(new TextEncoder().encode('{"timezone":'));
            },
          }),
        ),
      ),
    );
    const provider = createOpenMeteoWeatherProvider({
      config,
      fetch,
      now: () => new Date("2026-07-28T12:00:05.000Z"),
    });
    const controller = new AbortController();

    const pending = provider.getForecast(createOpenMeteoForecastRequest(), {
      signal: controller.signal,
    });
    await vi.waitFor(() => expect(fetch).toHaveBeenCalledOnce());
    controller.abort();

    await expect(pending).rejects.toThrow(
      "Open-Meteo forecast request was cancelled.",
    );
    expect(bodyCancelled).toBe(true);
  });

  it("bounds and cancels oversized forecast response bodies", async () => {
    let bodyCancelled = false;
    const fetch = vi.fn<typeof globalThis.fetch>(() =>
      Promise.resolve(
        new Response(
          new ReadableStream<Uint8Array>({
            cancel() {
              bodyCancelled = true;
            },
            start(controller) {
              controller.enqueue(new Uint8Array(512 * 1_024 + 1));
            },
          }),
        ),
      ),
    );
    const provider = createOpenMeteoWeatherProvider({
      config,
      fetch,
      now: () => new Date("2026-07-28T12:00:05.000Z"),
    });

    await expect(
      provider.getForecast(createOpenMeteoForecastRequest(), {}),
    ).rejects.toThrow(
      "Open-Meteo forecast response body exceeded the configured byte limit.",
    );
    expect(bodyCancelled).toBe(true);
  });
});
