import { env } from "node:process";

import { createConfiguredTextRuntime } from "./configured-text-runtime.js";
import { parseAssistantConfig } from "./config/config.js";

const runOpenAIE2E = env.PERSONAL_AI_RUN_OPENAI_E2E === "1";

describe.skipIf(!runOpenAIE2E)("OpenAI weather routing live E2E", () => {
  it("resolves bare London to the ranked capital through live Open-Meteo", async () => {
    const assistant = await createConfiguredTextRuntime({
      config: createLiveWeatherConfig(),
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
        adapter: "openMeteo",
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
