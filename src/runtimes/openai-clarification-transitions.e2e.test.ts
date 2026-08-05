import { env } from "node:process";

import { createConfiguredTextRuntime } from "./configured-text-runtime.js";
import { parseAssistantConfig } from "./config/config.js";

const runOpenAIE2E = env.PERSONAL_AI_RUN_OPENAI_E2E === "1";

describe.skipIf(!runOpenAIE2E)(
  "OpenAI clarification transitions live E2E",
  () => {
    it("rephrases an incomplete request before handling the next request afresh", async () => {
      const { assistant, requestBodies } = await createLiveAssistant();

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

      expect(requestBodies).toHaveLength(2);
      expect(readRequestBody(requestBodies, 1)).not.toHaveProperty(
        "previous_response_id",
      );
    }, 60_000);

    it("replaces a targeted clarification with a different request", async () => {
      const { assistant, requestBodies } = await createLiveAssistant();

      await expect(
        assistant.handleText(
          "Set an alarm tomorrow; I still need to tell you the time.",
        ),
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

      expect(requestBodies).toHaveLength(3);
      expect(readRequestBody(requestBodies, 1)).toHaveProperty(
        "previous_response_id",
      );
      expect(readRequestBody(requestBodies, 2)).not.toHaveProperty(
        "previous_response_id",
      );
    }, 60_000);
  },
);

function createLiveAssistant() {
  const requestBodies: string[] = [];
  const recordingFetch: typeof globalThis.fetch = (input, init) => {
    if (typeof init?.body === "string") requestBodies.push(init.body);
    return globalThis.fetch(input, init);
  };
  const assistant = createConfiguredTextRuntime({
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
        openai: { model: "gpt-5.6-luna", reasoningEffort: "none" },
        provider: "openai",
      },
      responseRewriter: { provider: "disabled" },
    }),
    env: { OPENAI_API_KEY: env.OPENAI_API_KEY },
    fetch: recordingFetch,
  });
  return assistant.then((configuredAssistant) => ({
    assistant: configuredAssistant,
    requestBodies,
  }));
}

function readRequestBody(
  requestBodies: readonly string[],
  index: number,
): unknown {
  return JSON.parse(requestBodies[index]!);
}
