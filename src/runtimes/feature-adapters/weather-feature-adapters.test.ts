import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { jsonResponse } from "../../test-support/adapter-contract.js";
import { createLoadedRuntimeConfig } from "../../test-support/core-assistant.js";
import {
  createOpenMeteoForecastResponse,
  createOpenMeteoGeocodingResponse,
} from "../../test-support/open-meteo.js";
import {
  createConfiguredTextRuntime,
  createConfiguredTextRuntimeComposition,
} from "../configured-text-runtime.js";
import { parseAssistantConfig } from "../config/config.js";
import { createDefaultFeatureAdapterRegistry } from "../default-feature-adapter-registry.js";
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

  it("routes spoken coat advice through only the injected explicit-home reader", async () => {
    const readHomeLocation = vi.fn(() =>
      Promise.resolve({
        place: "London",
        provenance: "user-authored" as const,
      }),
    );
    const featureAdapterRegistry = createDefaultFeatureAdapterRegistry({
      weather: { personalContextReader: { readHomeLocation } },
    });
    const config = parseAssistantConfig(
      createRawWeatherConfig({ adapter: "mock", enabled: true }),
      { featureAdapterRegistry },
    );
    const assistant = await createConfiguredTextRuntime({
      config,
      now: () => weatherNow,
    });

    const response = await assistant.handleText(
      "Hey Jarvis, will I need a coat at home tomorrow morning?",
    );

    expect(response.status).toBe("ok");
    expect(response.text).toContain(
      "Yes, take a coat: the forecast includes rain or cool conditions.",
    );
    expect(response.text).toContain(
      "from 2026-07-29T05:00:00.000Z to 2026-07-29T11:00:00.000Z",
    );
    expect(response.text).toContain("Fetched at 2026-07-28T12:00:05.000Z");
    expect(readHomeLocation).toHaveBeenCalledOnce();
  });

  it("contributes delivery evaluation over the exact composed watch store", async () => {
    const shutdown = new AbortController();
    const delivered: string[] = [];
    const composition = await createConfiguredTextRuntimeComposition({
      config: createLoadedRuntimeConfig({
        weather: { adapter: "mock", enabled: true },
      }),
      notificationDelivery: {
        deliver: (notification) => {
          delivered.push(notification.text);
          shutdown.abort();
          return Promise.resolve();
        },
      },
      now: () => weatherNow,
    });
    await composition.assistant.handleText(
      "Hey Jarvis, watch for rain in London from 2026-07-28T12:00:00.000Z to 2026-07-29T12:00:00.000Z",
    );
    await composition.assistant.handleText("yes");

    expect(composition.backgroundTasks).toEqual([
      expect.objectContaining({
        failureReason: "weather watch evaluation failed",
        id: "weather.watches",
      }),
    ]);
    await composition.backgroundTasks[0]?.run({
      clock: { now: () => weatherNow },
      reportFailure: () => {},
      shutdownSignal: shutdown.signal,
    });

    expect(delivered).toHaveLength(1);
    expect(delivered[0]).toContain(
      "Weather watch weather-watch-1 matched in London",
    );
    const listResponse = await composition.assistant.handleText(
      "Hey Jarvis, list my weather watches",
    );
    expect(listResponse.text).toContain("weather-watch-1: triggered");
  });

  it("does not consume watches when no notification output is composed", async () => {
    const composition = await createConfiguredTextRuntimeComposition({
      config: createLoadedRuntimeConfig({
        weather: { adapter: "mock", enabled: true },
      }),
      now: () => weatherNow,
    });

    expect(composition.backgroundTasks).toEqual([]);
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
    expect(config.features.weather).not.toHaveProperty("watches");
  });

  it("requires a state path for file-backed weather watches", () => {
    expect(() =>
      parseAssistantConfig(
        createRawWeatherConfig({
          adapter: "mock",
          enabled: true,
          watches: { adapter: "file", state: {} },
        }),
      ),
    ).toThrow(
      'Config feature "weather".watches.state.path must be a non-empty string.',
    );
  });

  it("rejects an unregistered weather-watch store adapter", () => {
    expect(() =>
      parseAssistantConfig(
        createRawWeatherConfig({
          adapter: "mock",
          enabled: true,
          watches: { adapter: "cloud" },
        }),
      ),
    ).toThrow(
      'Config feature "weather".watches adapter "cloud" is not registered.',
    );
  });

  it("persists weather watches relative to the selected config file", async () => {
    const directory = await mkdtemp(join(tmpdir(), "personal-ai-weather-"));
    const configPath = join(directory, "config.json");
    const statePath = join(directory, "state", "weather-watches.json");
    await writeFile(
      configPath,
      JSON.stringify(
        createRawWeatherConfig({
          adapter: "mock",
          enabled: true,
          watches: {
            adapter: "file",
            state: { path: "state/weather-watches.json" },
          },
        }),
      ),
    );
    const firstAssistant = await createConfiguredTextRuntime({
      configPath,
      now: () => weatherNow,
    });

    await expect(
      firstAssistant.handleText(
        "Hey Jarvis, watch for rain in London from 2026-07-28T12:00:00.000Z to 2026-07-29T12:00:00.000Z",
      ),
    ).resolves.toEqual({
      expectsFollowUp: true,
      status: "needs_confirmation",
      text: "Please confirm: 1. create a weather watch for precipitation at least 0.1 mm in london from 2026-07-28T12:00:00.000Z to 2026-07-29T12:00:00.000Z. Say yes or no.",
    });
    await expect(firstAssistant.handleText("yes")).resolves.toMatchObject({
      status: "ok",
    });

    const restartedAssistant = await createConfiguredTextRuntime({
      configPath,
      now: () => weatherNow,
    });
    const response = await restartedAssistant.handleText(
      "Hey Jarvis, list my weather watches",
    );
    const state = JSON.parse(await readFile(statePath, "utf8")) as {
      version: number;
      watches: Array<{ id: string }>;
    };

    expect(response.status).toBe("ok");
    expect(response.text).toContain(
      "active precipitation at least 0.1 mm in London",
    );
    expect(state.version).toBe(1);
    expect(state.watches).toHaveLength(1);
    expect(state.watches[0]?.id).toMatch(/^weather-watch-/u);
  });

  it("rejects a relative watch-state path without config source context", async () => {
    const config = createLoadedRuntimeConfig({
      weather: {
        adapter: "mock",
        enabled: true,
        watches: {
          adapter: "file",
          state: { path: "state/weather-watches.json" },
        },
      },
    });

    await expect(createConfiguredTextRuntime({ config })).rejects.toThrow(
      "Relative local state paths require a config directory.",
    );
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

    expect(() => validateConfiguredFeatureAdapters(config)).not.toThrow();
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
