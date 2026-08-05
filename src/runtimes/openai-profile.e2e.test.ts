import { env } from "node:process";

import { createConfiguredTextRuntime } from "./configured-text-runtime.js";
import { parseAssistantConfig } from "./config/config.js";

const runOpenAIE2E = env.PERSONAL_AI_RUN_OPENAI_E2E === "1";

describe.skipIf(!runOpenAIE2E)(
  "OpenAI personal profile routing live E2E",
  () => {
    it("routes explicit profile saves and retrieval without conversation memory", async () => {
      const assistant = await createConfiguredTextRuntime({
        config: createLiveProfileConfig(),
        env: { OPENAI_API_KEY: env.OPENAI_API_KEY },
        fetch: globalThis.fetch,
        now: () => new Date(),
      });

      await expect(
        assistant.handleText("Remember that my preferred name is Zak"),
      ).resolves.toMatchObject({
        status: "ok",
        text: "I’ll remember that your preferred name is Zak.",
      });
      await expect(
        assistant.handleText("Set my response style to concise"),
      ).resolves.toMatchObject({
        status: "ok",
        text: "I’ll keep my responses concise.",
      });
      await expect(
        assistant.handleText("What is my preferred name?"),
      ).resolves.toMatchObject({
        status: "ok",
        text: "Your preferred name is Zak.",
      });
    }, 60_000);

    it("captures a missing home location and resumes the original weather request", async () => {
      const assistant = await createConfiguredTextRuntime({
        config: createLiveProfileConfig(true),
        env: { OPENAI_API_KEY: env.OPENAI_API_KEY },
        fetch: globalThis.fetch,
        now: () => new Date("2026-07-28T12:00:05.000Z"),
      });

      await expect(
        assistant.handleText("Can you check what the weather's like at home?"),
      ).resolves.toMatchObject({
        expectsFollowUp: true,
        status: "ok",
        text: expect.stringContaining("What is your home location?") as string,
      });
      await expect(assistant.handleText("London")).resolves.toMatchObject({
        status: "ok",
        text: expect.stringContaining(
          "I’ll remember London as your home location. In London, it is",
        ) as string,
      });
      await expect(
        assistant.handleText("What is my home location?"),
      ).resolves.toMatchObject({
        status: "ok",
        text: "Your home location is London.",
      });
    }, 60_000);
  },
);

function createLiveProfileConfig(includeWeather = false) {
  return parseAssistantConfig({
    assistant: {
      name: "Jarvis",
      timeZone: "Europe/London",
      wakePhrases: ["hey jarvis"],
    },
    conversation: { provider: "disabled" },
    features: {
      profile: { adapter: "local", enabled: true },
      ...(includeWeather
        ? {
            weather: {
              adapter: "mock",
              enabled: true,
              watches: { adapter: "local" },
            },
          }
        : {}),
    },
    intent: {
      openai: { model: "gpt-5.6-luna", reasoningEffort: "none" },
      provider: "openai",
    },
    responseRewriter: { provider: "disabled" },
  });
}
