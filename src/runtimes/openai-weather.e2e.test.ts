// cspell:ignore Londn londn

import { env } from "node:process";

import { jsonResponse } from "../test-support/adapter-contract.js";
import {
  createOpenMeteoForecastResponse,
  createOpenMeteoGeocodingResponse,
} from "../test-support/open-meteo.js";
import { createConfiguredTextRuntime } from "./configured-text-runtime.js";
import { parseAssistantConfig } from "./config/config.js";

const runOpenAIE2E = env.PERSONAL_AI_RUN_OPENAI_E2E === "1";
const fixtureNow = new Date("2026-07-28T12:00:05.000Z");

describe.skipIf(!runOpenAIE2E)("OpenAI weather routing live E2E", () => {
  it("preserves current-condition and coat routing through deterministic weather", async () => {
    const assistant = await createConfiguredTextRuntime({
      config: createLiveWeatherConfig("mock"),
      env: { OPENAI_API_KEY: env.OPENAI_API_KEY },
      fetch: globalThis.fetch,
      now: () => fixtureNow,
    });

    const current = await assistant.handleText(
      "Hey Jarvis, what is the current weather in London?",
    );
    const coat = await assistant.handleText(
      "Hey Jarvis, will I need a coat in London tomorrow morning?",
    );

    expect(current).toMatchObject({
      status: "ok",
      text: expect.stringContaining(
        "In London, it is 21°C and partly cloudy",
      ) as string,
    });
    expect(current.text).toContain(
      "Source: Deterministic weather fixture (https://example.test/weather-source).",
    );
    expect(coat).toMatchObject({
      status: "ok",
      text: expect.stringContaining(
        "Yes, take a coat: the forecast includes rain or cool conditions.",
      ) as string,
    });
    expect(coat.text).toContain(
      "from 2026-07-29T05:00:00.000Z to 2026-07-29T11:00:00.000Z",
    );
    expect(coat.text).toContain("Fetched at 2026-07-28T12:00:05.000Z");
  }, 60_000);

  it("resolves bare London to the ranked capital through live Open-Meteo", async () => {
    const assistant = await createConfiguredTextRuntime({
      config: createLiveWeatherConfig("openMeteo"),
      env: { OPENAI_API_KEY: env.OPENAI_API_KEY },
      fetch: globalThis.fetch,
      now: () => new Date(),
    });

    const current = await assistant.handleText(
      "Hey Jarvis, what is the current weather in London?",
    );
    expect(current).toMatchObject({
      status: "ok",
      text: expect.stringContaining("In London, England") as string,
    });
    expect(current.text).toContain(
      "Source: Weather data by Open-Meteo.com (https://open-meteo.com/).",
    );
    expect(current.expectsFollowUp).not.toBe(true);
  }, 60_000);

  it("resumes an OpenAI weather session after location clarification", async () => {
    const assistant = await createConfiguredTextRuntime({
      config: createLiveWeatherConfig("openMeteo"),
      env: { OPENAI_API_KEY: env.OPENAI_API_KEY },
      fetch: createLiveOpenAIWeatherFixtureFetch(),
      now: () => fixtureNow,
    });

    await expect(
      assistant.handleText("Hey Jarvis, what is the weather in Londn?"),
    ).resolves.toMatchObject({
      expectsFollowUp: true,
      status: "ok",
      text: expect.stringMatching(/Which location/u) as string,
    });
    await expect(
      assistant.handleText("London, United Kingdom"),
    ).resolves.toMatchObject({
      status: "ok",
      text: expect.stringContaining("In London, England") as string,
    });
  }, 60_000);
});

function createLiveWeatherConfig(adapter: "mock" | "openMeteo") {
  return parseAssistantConfig({
    assistant: {
      name: "Jarvis",
      timeZone: "Europe/London",
      wakePhrases: ["hey jarvis"],
    },
    conversation: { provider: "disabled" },
    features: {
      weather: {
        adapter,
        enabled: true,
        watches: { adapter: "local" },
      },
    },
    intent: {
      openai: { model: "gpt-5.4-nano" },
      provider: "openai",
    },
    responseRewriter: { provider: "disabled" },
  });
}

function createLiveOpenAIWeatherFixtureFetch(): typeof fetch {
  return async (input, init) => {
    const url = new URL(
      typeof input === "string" || input instanceof URL ? input : input.url,
    );
    if (url.hostname === "api.openai.com") {
      return globalThis.fetch(input, init);
    }
    if (url.hostname === "geocoding-api.open-meteo.com") {
      return jsonResponse(
        url.searchParams.get("name")?.toLowerCase() === "londn"
          ? { results: [] }
          : createOpenMeteoGeocodingResponse(),
      );
    }
    if (url.hostname === "api.open-meteo.com") {
      return jsonResponse(createOpenMeteoForecastResponse());
    }
    throw new Error(`Unexpected live weather smoke URL: ${url.origin}`);
  };
}
