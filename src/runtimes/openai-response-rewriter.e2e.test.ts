import { env } from "node:process";

import { createConfiguredTextRuntime } from "./configured-text-runtime.js";
import { parseAssistantConfig } from "./config/config.js";

const runOpenAIE2E = env.PERSONAL_AI_RUN_OPENAI_E2E === "1";

describe.skipIf(!runOpenAIE2E)("OpenAI response rewriter live E2E", () => {
  it("preserves exact calendar facts through configured response rewriting", async () => {
    const assistant = await createConfiguredTextRuntime({
      config: createLiveRewriterConfig(),
      env: { OPENAI_API_KEY: env.OPENAI_API_KEY },
      fetch: globalThis.fetch,
      now: () => new Date("2026-06-26T09:00:00.000Z"),
    });

    const outcome = await assistant.handleTextWithDiagnostics(
      "Hey Jarvis, can you check my calendar for the date of the upcoming wedding please?",
    );

    expect(outcome.diagnostics).toBeUndefined();
    expect(outcome.response).toMatchObject({ status: "ok" });
    expect(outcome.response.text).toContain("Upcoming wedding");
    expect(outcome.response.text).toContain("12 September");
    expect(outcome.response.text).toContain("all day");
    expect(outcome.response.text).not.toMatch(
      /__ASSISTANT_PROTECTED_FACT_|2026-09-12/iu,
    );
  }, 30_000);
});

function createLiveRewriterConfig() {
  return parseAssistantConfig({
    assistant: {
      name: "Jarvis",
      timeZone: "Europe/London",
      wakePhrases: ["hey jarvis"],
    },
    conversation: { provider: "disabled" },
    features: {
      calendar: {
        adapter: "mock",
        enabled: true,
        upcomingWindowDays: 92,
      },
    },
    intent: { provider: "deterministic" },
    responseRewriter: {
      openai: { model: "gpt-5.6-luna", reasoningEffort: "none" },
      provider: "openai",
    },
  });
}
