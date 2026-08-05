import { env } from "node:process";

import { createConfiguredTextRuntime } from "./configured-text-runtime.js";
import { parseAssistantConfig } from "./config/config.js";

const runOpenAIE2E = env.PERSONAL_AI_RUN_OPENAI_E2E === "1";

const liveSearchScenarios = [
  "Hey Jarvis, search the internet for the current stable TypeScript release.",
  "Search the web for Donald Trump's birthday.",
  "What are today's major public technology headlines?",
] as const;

describe.skipIf(!runOpenAIE2E)(
  "OpenAI source-grounded internet search live E2E",
  () => {
    it.each(liveSearchScenarios)(
      "returns bounded, humanized citations for: %s",
      async (text) => {
        const assistant = await createConfiguredTextRuntime({
          config: createLiveSearchConfig(),
          env: { OPENAI_API_KEY: env.OPENAI_API_KEY },
          fetch: globalThis.fetch,
        });

        const outcome = await assistant.handleTextWithDiagnostics(text);
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
            citations: expect.any(Array) as unknown[],
            status: "ok",
          },
        });
        expect(outcome.response.citations!.length).toBeGreaterThan(0);
        expect(outcome.response.citations!.length).toBeLessThanOrEqual(5);
        for (const citation of outcome.response.citations!) {
          expect(["http:", "https:"]).toContain(new URL(citation.url).protocol);
          expect(outcome.response.text).toContain(citation.title);
        }
        expect(outcome.response.text).not.toMatch(
          /https?:\/\/|\bwww\.|\[[^\]]+\]\([^)]+\)|\[\d+\]/iu,
        );
        expect(outcome.response.text).not.toContain("OPENAI_API_KEY");
      },
      60_000,
    );
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
        openai: {
          model: "gpt-5.6-luna",
          reasoningEffort: "none",
          timeoutMs: 45_000,
        },
      },
    },
    intent: {
      openai: { model: "gpt-5.6-luna", reasoningEffort: "none" },
      provider: "openai",
    },
    responseRewriter: { provider: "disabled" },
  });
}
