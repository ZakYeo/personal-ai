import { env } from "node:process";

import { createConfiguredTextRuntime } from "./configured-text-runtime.js";
import { parseAssistantConfig } from "./config/config.js";

const runOpenAIE2E = env.PERSONAL_AI_RUN_OPENAI_E2E === "1";
const now = new Date("2026-07-28T12:00:05.000Z");

describe.skipIf(!runOpenAIE2E)("OpenAI weather routing live E2E", () => {
  it("routes current conditions and coat advice into exact weather responses", async () => {
    const assistant = await createConfiguredTextRuntime({
      config: createLiveWeatherConfig(),
      env: { OPENAI_API_KEY: env.OPENAI_API_KEY },
      fetch: globalThis.fetch,
      now: () => now,
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
});

function createLiveWeatherConfig() {
  return parseAssistantConfig({
    assistant: {
      name: "Jarvis",
      timeZone: "Europe/London",
      wakePhrases: ["hey jarvis"],
    },
    conversation: { provider: "disabled" },
    features: {
      weather: {
        adapter: "mock",
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
