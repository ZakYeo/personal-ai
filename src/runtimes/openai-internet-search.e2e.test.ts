import { env } from "node:process";

import { createConfiguredTextRuntime } from "./configured-text-runtime.js";
import { parseAssistantConfig } from "./config/config.js";

const runOpenAIE2E = env.PERSONAL_AI_RUN_OPENAI_E2E === "1";

describe.skipIf(!runOpenAIE2E)(
  "OpenAI source-grounded internet search live E2E",
  () => {
    it("routes a current question through live web search with visible citations", async () => {
      const assistant = await createConfiguredTextRuntime({
        config: createLiveSearchConfig(),
        env: { OPENAI_API_KEY: env.OPENAI_API_KEY },
        fetch: globalThis.fetch,
      });

      const outcome = await assistant.handleTextWithDiagnostics(
        "Hey Jarvis, search the internet for the current stable TypeScript release.",
      );
      if (outcome.response.status !== "ok") {
        const diagnosticMessage = outcome.diagnostics
          ?.map((diagnostic) =>
            diagnostic.cause instanceof Error
              ? diagnostic.cause.message
              : diagnostic.message,
          )
          .join("; ");
        throw new Error(
          `Live internet search failed: ${diagnosticMessage ?? "no diagnostic"}`,
        );
      }

      expect(outcome).toMatchObject({
        response: {
          expectsFollowUp: true,
          status: "ok",
        },
      });
      expect(outcome.response.text).toMatch(/https:\/\//u);
      expect(outcome.response.text).not.toContain("OPENAI_API_KEY");
    }, 60_000);
  },
);

function createLiveSearchConfig() {
  return parseAssistantConfig({
    assistant: {
      name: "Jarvis",
      timeZone: "Europe/London",
      wakePhrases: ["hey jarvis"],
    },
    conversation: { provider: "disabled" },
    features: {
      internetSearch: {
        adapter: "openai",
        enabled: true,
        maxResults: 5,
        openai: { model: "gpt-5.4-nano", timeoutMs: 45_000 },
      },
    },
    intent: {
      openai: { model: "gpt-5.4-nano" },
      provider: "openai",
    },
    responseRewriter: { provider: "disabled" },
  });
}
