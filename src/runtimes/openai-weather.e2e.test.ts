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
  it("reuses the previous weather location for generalized coat advice", async () => {
    const assistant = await createConfiguredTextRuntime({
      config: createLiveWeatherConfig("mock", true),
      env: { OPENAI_API_KEY: env.OPENAI_API_KEY },
      fetch: globalThis.fetch,
      now: () => fixtureNow,
    });

    await assistant.handleText("Set my home location to London");
    const current = await assistant.handleText(
      "Check the weather for my home please",
    );
    const coat = await assistant.handleText(
      "Could I wear a coat if I left now?",
    );

    expect(current).toMatchObject({
      status: "ok",
      text: expect.stringContaining(
        "In London, it is 21°C and partly cloudy",
      ) as string,
    });
    expect(current.text).toContain("Source: Deterministic weather fixture.");
    expect(current.citations).toEqual([
      {
        title: "Deterministic weather fixture",
        url: "https://example.test/weather-source",
      },
    ]);
    expect(coat).toMatchObject({
      status: "ok",
      text: expect.stringContaining("a coat in London right now") as string,
    });
    expect(coat.text).not.toContain("Which location");
  }, 60_000);

  it("handles the reported clothing dialogue as a fresh outfit request", async () => {
    const assistant = await createConfiguredTextRuntime({
      config: createLiveWeatherConfig("mock"),
      env: { OPENAI_API_KEY: env.OPENAI_API_KEY },
      fetch: globalThis.fetch,
      now: () => fixtureNow,
    });

    const current = await assistant.handleText(
      "What's the weather like in Eastbourne right now?",
    );
    const hoodie = await assistant.handleText("Should I wear a hoodie today?");
    const outfit = await assistant.handleText(
      "What would you recommend I wear?",
    );

    expect(current).toMatchObject({ status: "ok" });
    expect(hoodie).toMatchObject({
      status: "ok",
      text: expect.stringContaining("hoodie in Eastbourne right now") as string,
    });
    expect(outfit).toMatchObject({
      status: "ok",
      text: expect.stringContaining("I recommend") as string,
    });
    expect(outfit.text).toContain("in Eastbourne right now");
    expect(outfit.text).not.toContain("What details should I use");
  }, 60_000);

  it("assesses an arbitrary named clothing item", async () => {
    const assistant = await createConfiguredTextRuntime({
      config: createLiveWeatherConfig("mock"),
      env: { OPENAI_API_KEY: env.OPENAI_API_KEY },
      fetch: globalThis.fetch,
      now: () => fixtureNow,
    });

    const response = await assistant.handleText(
      "Would you recommend a ceremonial sash in London right now?",
    );

    expect(response).toMatchObject({
      status: "ok",
      text: expect.stringContaining(
        "ceremonial sash in London right now",
      ) as string,
    });
    expect(response.text).not.toContain("Which clothing category");
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
    expect(current.text).toContain("Source: Weather data by Open-Meteo.com.");
    expect(current.citations).toEqual([
      {
        title: "Weather data by Open-Meteo.com",
        url: "https://open-meteo.com/",
      },
    ]);
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
      assistant.handleText("Hey Jarvis, what is the weather in London?"),
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

function createLiveWeatherConfig(
  adapter: "mock" | "openMeteo",
  includeProfile = false,
) {
  return parseAssistantConfig({
    assistant: {
      name: "Jarvis",
      timeZone: "Europe/London",
      wakePhrases: ["hey jarvis"],
    },
    conversation: { provider: "disabled" },
    features: {
      ...(includeProfile
        ? { profile: { adapter: "local", enabled: true } }
        : {}),
      weather: {
        adapter,
        clothingAdvisor: {
          openai: { model: "gpt-5.6-luna", reasoningEffort: "none" },
          provider: "openai",
        },
        enabled: true,
        watches: { adapter: "local" },
      },
    },
    intent: {
      openai: { model: "gpt-5.6-luna", reasoningEffort: "none" },
      provider: "openai",
    },
    responseRewriter: { provider: "disabled" },
  });
}

function createLiveOpenAIWeatherFixtureFetch(): typeof fetch {
  let geocodingRequests = 0;
  return async (input, init) => {
    const url = new URL(
      typeof input === "string" || input instanceof URL ? input : input.url,
    );
    if (url.hostname === "api.openai.com") {
      return globalThis.fetch(input, init);
    }
    if (url.hostname === "geocoding-api.open-meteo.com") {
      geocodingRequests++;
      return jsonResponse(
        geocodingRequests === 1
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
