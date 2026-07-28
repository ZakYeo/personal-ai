import { jsonResponse } from "../../test-support/adapter-contract.js";
import { createLoadedRuntimeConfig } from "../../test-support/core-assistant.js";
import {
  createOpenMeteoForecastResponse,
  createOpenMeteoGeocodingResponse,
} from "../../test-support/open-meteo.js";
import { createConfiguredTextRuntime } from "../configured-text-runtime.js";
import { parseAssistantConfig } from "../config/config.js";
import { validateConfiguredFeatureAdapters } from "../feature-adapter-selection.js";

const weatherNow = new Date("2026-07-28T12:00:05.000Z");
type FetchMock = ReturnType<typeof vi.fn<typeof globalThis.fetch>>;

describe("weather feature adapters", () => {
  it("routes deterministic weather through the configured mock adapter", async () => {
    const assistant = await createConfiguredTextRuntime({
      config: createLoadedRuntimeConfig({
        weather: { adapter: "mock", enabled: true },
      }),
      now: () => weatherNow,
    });

    const response = await assistant.handleText(
      "Hey Jarvis, weather in London",
    );

    expect(response).toMatchObject({
      status: "ok",
    });
    expect(response.text).toContain("In London, it is 21°C and partly cloudy");
    expect(response.text).toContain(
      "Source: Deterministic weather fixture (https://example.test/weather-source).",
    );
  });

  it("composes keyless Open-Meteo geocoding and forecasts", async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(jsonResponse(createOpenMeteoGeocodingResponse()))
      .mockResolvedValueOnce(jsonResponse(createOpenMeteoForecastResponse()));
    const assistant = await createConfiguredTextRuntime({
      config: createLoadedRuntimeConfig({
        weather: { adapter: "openMeteo", enabled: true },
      }),
      env: createEnvThatRejectsReads(),
      fetch,
      now: () => weatherNow,
    });

    const response = await assistant.handleText(
      "Hey Jarvis, weather in London",
    );

    expect(response).toMatchObject({ status: "ok" });
    expect(response.text).toContain("Weather data by Open-Meteo.com");
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(requestedUrl(fetch, 0).origin).toBe(
      "https://geocoding-api.open-meteo.com",
    );
    expect(requestedUrl(fetch, 1).origin).toBe("https://api.open-meteo.com");
    expect(requestedUrl(fetch, 1).searchParams.has("apikey")).toBe(false);
  });

  it("parses selected Open-Meteo config once without exposing it broadly", () => {
    const config = parseAssistantConfig(
      createRawWeatherConfig({
        adapter: "openMeteo",
        enabled: true,
        maxForecastAgeMinutes: 180,
        openMeteo: {
          forecastUrl: "https://api.open-meteo.com/v1/forecast",
          geocodingUrl: "https://geocoding-api.open-meteo.com/v1/search",
          timeoutMs: 12_000,
        },
      }),
    );

    expect(config.features.weather).toMatchObject({
      adapter: "openMeteo",
      enabled: true,
    });
    expect(config.features.weather).not.toHaveProperty("openMeteo");
  });

  it.each([
    [
      "paid customer endpoint",
      {
        forecastUrl:
          "https://customer-api.open-meteo.com/v1/forecast?apikey=secret",
      },
      "must use the official free non-commercial forecast endpoint",
    ],
    [
      "weather credential",
      { apiKeyEnv: "WEATHER_API_KEY" },
      "must not configure credentials",
    ],
    [
      "alternate geocoding endpoint",
      { geocodingUrl: "https://weather.example.test/search" },
      "must use the official free geocoding endpoint",
    ],
    [
      "invalid timeout",
      { timeoutMs: 0 },
      "timeoutMs must be an integer from 1 to 120000",
    ],
  ])("rejects %s config", (_label, openMeteo, message) => {
    expect(() =>
      parseAssistantConfig(
        createRawWeatherConfig({
          adapter: "openMeteo",
          enabled: true,
          openMeteo,
        }),
      ),
    ).toThrow(message);
  });

  it("rejects credential fields outside the selected adapter object", () => {
    expect(() =>
      parseAssistantConfig(
        createRawWeatherConfig({
          adapter: "openMeteo",
          apiKeyEnv: "WEATHER_API_KEY",
          enabled: true,
        }),
      ),
    ).toThrow(
      'Config feature "weather".openMeteo must not configure credentials.',
    );
  });

  it("validates keyless Open-Meteo startup without network or environment reads", () => {
    const config = parseAssistantConfig(
      createRawWeatherConfig({
        adapter: "openMeteo",
        enabled: true,
      }),
    );
    const fetch = vi.fn();

    expect(() =>
      validateConfiguredFeatureAdapters(config, {
        clock: { now: () => weatherNow },
        env: createEnvThatRejectsReads(),
        fetch,
      }),
    ).not.toThrow();
    expect(fetch).not.toHaveBeenCalled();
  });
});

function createRawWeatherConfig(
  weather: Record<string, unknown>,
): Record<string, unknown> {
  return {
    assistant: {
      name: "Jarvis",
      timeZone: "Europe/London",
      wakePhrases: ["hey jarvis"],
    },
    features: { weather },
    intent: { provider: "deterministic" },
  };
}

function createEnvThatRejectsReads(): Record<string, string | undefined> {
  return new Proxy(
    {},
    {
      get() {
        throw new Error("Weather composition must not read credentials.");
      },
    },
  );
}

function requestedUrl(fetch: FetchMock, index: number): URL {
  const target = fetch.mock.calls[index]?.[0];
  if (target instanceof Request) return new URL(target.url);
  if (typeof target === "string" || target instanceof URL) {
    return new URL(target);
  }
  throw new TypeError("Expected a weather provider request URL.");
}
