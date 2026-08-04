import { env } from "node:process";

import { OpenAIIntentInterpreter } from "../adapters/openai/openai-intent-interpreter.js";
import type { AssistantContext } from "../ports/assistant.js";
import { interpretOnce } from "../application/intent.js";
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
      timeZone: "Europe/London",
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
    runtime: { clock: { now: () => new Date() } },
  }),
);

const liveRoutingScenarios = [
  {
    capability: "assistant.capabilities.list",
    parameters: {},
    text: "What are your capabilities?",
  },
  {
    capability: "calendar.search_events",
    parameters: {
      query: expect.stringMatching(/wedding/i) as string,
    },
    text: "Hey Jarvis, can you check my calendar for the date of the upcoming wedding please?",
  },
  {
    capability: "calendar.search_events",
    parameters: {},
    text: "Hey Jarvis, can you check my calendar please? What upcoming events do I have?",
  },
  {
    capability: "messaging.draft_reply",
    parameters: {},
    text: "Hey Jarvis, draft a WhatsApp reply saying thanks for your message and I will get back to you shortly.",
  },
  {
    capability: "internet.search",
    parameters: {
      query: expect.stringMatching(/typescript/i) as string,
    },
    text: "Hey Jarvis, search the internet for the current stable TypeScript release.",
  },
  {
    capability: "internet.search",
    parameters: {
      query: expect.stringMatching(
        /donald trump.*birthday|birthday.*donald trump/i,
      ) as string,
    },
    text: "Could you look online and tell me Donald Trump's birthday?",
  },
  {
    capability: "internet.search",
    parameters: {
      query: expect.stringMatching(
        /typescript.*release|release.*typescript/i,
      ) as string,
    },
    text: "Search the internet for the latest stable TypeScript release number.",
  },
  {
    capability: "alarm.create",
    parameters: {
      minutesFromNow: 10,
    },
    text: "Hey Jarvis, set an alarm called tea in 10 minutes.",
  },
  {
    capability: "alarm.list",
    parameters: {},
    text: "Hey Jarvis, list my alarms",
  },
] as const;

const liveClarificationScenarios = [
  "Can you search?",
  "Can you search the web for me?",
  "Could you look something up online?",
  "Search the web for me.",
] as const;

const liveConversationScenarios = [
  "Thank you.",
  "Thanks, Jarvis.",
  "That was helpful, cheers.",
] as const;

const runOpenAIE2E = env.PERSONAL_AI_RUN_OPENAI_E2E === "1";

describe.skipIf(!runOpenAIE2E)("OpenAI intent routing live E2E", () => {
  it.each(liveRoutingScenarios)(
    "maps $capability through the live Responses API",
    async ({ capability, parameters, text }) => {
      const interpreter = createInterpreter();
      const interpretation = await interpretOnce(interpreter, text, context);
      const command =
        interpretation.kind === "command"
          ? interpretation.command
          : interpretation.kind === "tool_call"
            ? interpretation.call.command
            : undefined;
      const selectedCapability =
        command?.capability ??
        (interpretation.kind === "clarification"
          ? interpretation.clarification.capability
          : undefined);

      expect(
        selectedCapability,
        `Live interpretation: ${JSON.stringify(interpretation)}`,
      ).toBe(capability);
      const expectedParameters = command ? parameters : {};
      expect(command?.parameters ?? {}).toEqual(
        expect.objectContaining(expectedParameters),
      );
      expect(typeof command?.rawText).toBe(command ? "string" : "undefined");
    },
    30_000,
  );

  it.each(liveClarificationScenarios)(
    "asks for the missing search topic: %s",
    async (text) => {
      const interpreter = createInterpreter();
      const interpretation = await interpretOnce(interpreter, text, context);

      expect(["clarification", "rephrase"]).toContain(interpretation.kind);
      if (
        interpretation.kind !== "clarification" &&
        interpretation.kind !== "rephrase"
      ) {
        throw new Error("Expected a safe missing-topic follow-up.");
      }
      expect(interpretation.response.text).toMatch(/\?/u);
    },
    30_000,
  );

  it.each(liveConversationScenarios)(
    "classifies casual acknowledgements as conversation: %s",
    async (text) => {
      const interpreter = createInterpreter();

      await expect(interpretOnce(interpreter, text, context)).resolves.toEqual({
        kind: "conversation",
      });
    },
    30_000,
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
