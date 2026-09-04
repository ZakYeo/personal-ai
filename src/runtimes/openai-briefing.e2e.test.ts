import { env } from "node:process";

import { createConfiguredTextRuntime } from "./configured-text-runtime.js";
import { parseAssistantConfig } from "./config/config.js";

const runOpenAIE2E = env.PERSONAL_AI_RUN_OPENAI_E2E === "1";

describe.skipIf(!runOpenAIE2E)("OpenAI daily briefing live E2E", () => {
  it("routes and aggregates a bounded briefing through the live intent provider", async () => {
    const assistant = await createConfiguredTextRuntime({
      config: parseAssistantConfig({
        assistant: {
          name: "Jarvis",
          timeZone: "Europe/London",
          wakePhrases: ["hey jarvis"],
        },
        conversation: { provider: "disabled" },
        features: {
          briefing: { adapter: "local", enabled: true },
          calendar: {
            adapter: "mock",
            enabled: true,
            eventGrouping: { provider: "mock" },
            upcomingWindowDays: 14,
          },
        },
        intent: {
          openai: { model: "gpt-5.6-luna", reasoningEffort: "none" },
          provider: "openai",
        },
        responseRewriter: { provider: "disabled" },
      }),
      env: { OPENAI_API_KEY: env.OPENAI_API_KEY },
      fetch: globalThis.fetch,
      now: () => new Date("2026-09-04T07:00:00.000Z"),
    });

    const response = await assistant.handleText(
      "Give me a concise briefing for my day.",
    );

    expect(response).toMatchObject({
      status: "ok",
      text: expect.stringContaining("calendar") as string,
    });
    expect(response.text.length).toBeLessThanOrEqual(900);
  }, 60_000);
});
