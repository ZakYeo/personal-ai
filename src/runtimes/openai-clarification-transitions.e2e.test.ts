import { env } from "node:process";

import { createConfiguredTextRuntime } from "./configured-text-runtime.js";
import { parseAssistantConfig } from "./config/config.js";

const runOpenAIE2E = env.PERSONAL_AI_RUN_OPENAI_E2E === "1";

describe.skipIf(!runOpenAIE2E)(
  "OpenAI clarification transitions live E2E",
  () => {
    it("rephrases an incomplete request before handling the next request afresh", async () => {
      const assistant = await createLiveAssistant();

      await expect(assistant.handleText("Can you do")).resolves.toMatchObject({
        expectsFollowUp: true,
        status: "ok",
      });
      await expect(
        assistant.handleText(
          "What are your capabilities? Can you list them all?",
        ),
      ).resolves.toMatchObject({
        status: "ok",
        text: expect.stringContaining("I can") as string,
      });
    }, 60_000);

    it("replaces a targeted clarification with a different request", async () => {
      const assistant = await createLiveAssistant();

      await expect(
        assistant.handleText("Can you set an alarm for me?"),
      ).resolves.toMatchObject({
        expectsFollowUp: true,
        status: "ok",
      });
      await expect(
        assistant.handleText(
          "Actually, what are your capabilities? Can you list them all?",
        ),
      ).resolves.toMatchObject({
        status: "ok",
        text: expect.stringContaining("I can") as string,
      });
    }, 60_000);
  },
);

function createLiveAssistant() {
  return createConfiguredTextRuntime({
    config: parseAssistantConfig({
      assistant: {
        name: "Jarvis",
        timeZone: "Europe/London",
        wakePhrases: ["hey jarvis"],
      },
      conversation: { provider: "disabled" },
      features: {
        alarms: { adapter: "local", enabled: true },
      },
      intent: {
        openai: { model: "gpt-5.4-nano" },
        provider: "openai",
      },
      responseRewriter: { provider: "disabled" },
    }),
    env: { OPENAI_API_KEY: env.OPENAI_API_KEY },
    fetch: globalThis.fetch,
  });
}
