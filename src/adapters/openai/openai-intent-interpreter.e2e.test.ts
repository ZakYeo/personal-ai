import { env } from "node:process";

import type { AssistantContext } from "../../ports/assistant.js";
import type { OpenAIIntentCapability } from "./openai-intent-interpreter.js";
import { OpenAIIntentInterpreter } from "./openai-intent-interpreter.js";

const openAIApiKeyEnv = "OPENAI_API_KEY";

const context = {
  clock: {
    now: () => new Date("2026-06-26T09:00:00.000Z"),
  },
  config: {
    assistant: {
      name: "Jarvis",
      wakePhrases: ["hey jarvis"],
    },
    features: {
      alarms: { enabled: true },
    },
  },
} satisfies AssistantContext;

const alarmListCapability = {
  capability: {
    name: "alarm.list",
    parameters: {},
    risk: "low",
  },
  featureId: "alarms",
  featureName: "Local Alarms",
} satisfies OpenAIIntentCapability;

const runOpenAIE2E = env.PERSONAL_AI_RUN_OPENAI_E2E === "1";

describe.skipIf(!runOpenAIE2E)("OpenAIIntentInterpreter live E2E", () => {
  it("maps a simple alarm request through the live Responses API", async () => {
    const interpreter = new OpenAIIntentInterpreter({
      capabilityCatalog: [alarmListCapability],
      config: {
        apiKeyEnv: openAIApiKeyEnv,
        baseUrl: "https://api.openai.com/v1",
        model: "gpt-5.4-nano",
        timeoutMs: 30_000,
      },
      env: {
        [openAIApiKeyEnv]: env[openAIApiKeyEnv],
      },
      fetch: globalThis.fetch,
    });

    await expect(
      interpreter.interpret("Hey Jarvis, list my alarms", context),
    ).resolves.toEqual({
      command: {
        capability: "alarm.list",
        parameters: {},
        rawText: expect.any(String) as string,
      },
    });
  });
});
