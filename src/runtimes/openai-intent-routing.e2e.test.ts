import { env } from "node:process";

import { OpenAIIntentInterpreter } from "../adapters/openai/openai-intent-interpreter.js";
import type { AssistantContext } from "../ports/assistant.js";
import { enabledDeterministicConfig } from "../test-support/deterministic-runtime-fixtures.js";
import { createConfiguredFeatures } from "./feature-adapter-selection.js";
import { createProviderCapabilityCatalog } from "./provider-capability-catalog.js";

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
      calendar: { enabled: true },
      messaging: { enabled: true },
      alarms: { enabled: true },
    },
  },
} satisfies AssistantContext;

const capabilityCatalog = createProviderCapabilityCatalog(
  createConfiguredFeatures(enabledDeterministicConfig, {
    dependencies: {
      env,
      fetch: globalThis.fetch,
    },
  }),
);

const liveRoutingScenarios = [
  {
    capability: "calendar.search_events",
    parameters: {
      query: expect.stringMatching(/wedding/i) as string,
    },
    text: "Hey Jarvis, can you check my calendar for the date of the upcoming wedding please?",
  },
  {
    capability: "messaging.draft_reply",
    parameters: {},
    text: "Hey Jarvis, draft a generic WhatsApp reply for me.",
  },
  {
    capability: "alarm.create",
    parameters: {
      minutesFromNow: 10,
    },
    text: "Hey Jarvis, set an alarm to ping me in 10 minutes.",
  },
  {
    capability: "alarm.list",
    parameters: {},
    text: "Hey Jarvis, list my alarms",
  },
] as const;

const runOpenAIE2E = env.PERSONAL_AI_RUN_OPENAI_E2E === "1";

describe.skipIf(!runOpenAIE2E)("OpenAI intent routing live E2E", () => {
  it.each(liveRoutingScenarios)(
    "maps $capability through the live Responses API",
    async ({ capability, parameters, text }) => {
      const interpreter = createInterpreter();

      await expect(interpreter.interpret(text, context)).resolves.toEqual({
        command: {
          capability,
          parameters: expect.objectContaining(parameters) as Record<
            string,
            boolean | number | string | null
          >,
          rawText: expect.any(String) as string,
        },
      });
    },
  );
});

function createInterpreter(): OpenAIIntentInterpreter {
  return new OpenAIIntentInterpreter({
    capabilityCatalog,
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
}
