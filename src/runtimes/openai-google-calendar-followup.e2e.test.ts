import { env } from "node:process";

import { createConfiguredTextRuntime } from "./configured-text-runtime.js";
import { parseAssistantConfig } from "./config/config.js";

const runLiveFollowUp =
  env.PERSONAL_AI_RUN_OPENAI_E2E === "1" &&
  env.PERSONAL_AI_RUN_GOOGLE_CALENDAR_FOLLOWUP_E2E === "1";

describe.skipIf(!runLiveFollowUp)(
  "OpenAI and Google Calendar follow-up live E2E",
  () => {
    it("searches a real result and resolves a read-only follow-up by opaque reference", async () => {
      const query = requireFixtureQuery();
      const assistant = await createConfiguredTextRuntime({
        config: createLiveConfig(),
        env,
        fetch: globalThis.fetch,
        now: () => new Date(),
      });

      const search = await assistant.handleText(
        `Hey Jarvis, search my calendar for ${query}.`,
      );
      expect(search).toMatchObject({
        expectsFollowUp: true,
        status: "ok",
      });

      const followUp = await assistant.handleText("Where is the first one?");
      expect(followUp).toMatchObject({ status: "ok" });
      expect(followUp.text).not.toMatch(
        /calendar-event-|provider|credential/iu,
      );
    }, 30_000);
  },
);

function requireFixtureQuery(): string {
  const query = env.PERSONAL_AI_GOOGLE_CALENDAR_FOLLOWUP_QUERY?.trim();
  if (!query) {
    throw new Error(
      "PERSONAL_AI_GOOGLE_CALENDAR_FOLLOWUP_QUERY must identify a real calendar fixture.",
    );
  }
  return query;
}

function createLiveConfig() {
  return parseAssistantConfig({
    assistant: { name: "Jarvis", wakePhrases: ["hey jarvis"] },
    conversation: {
      history: { maxTurnsBeforeCompaction: 5 },
      provider: "disabled",
    },
    features: {
      calendar: {
        adapter: "google",
        enabled: true,
        google: {
          accessTokenEnv: "GOOGLE_CALENDAR_ACCESS_TOKEN",
          baseUrl: "https://www.googleapis.com/calendar/v3",
          calendarId: "primary",
          clientIdEnv: "GOOGLE_CALENDAR_CLIENT_ID",
          clientSecretEnv: "GOOGLE_CALENDAR_CLIENT_SECRET",
          maxResults: 10,
          refreshTokenEnv: "GOOGLE_CALENDAR_REFRESH_TOKEN",
          timeoutMs: 30_000,
          tokenUrl: "https://oauth2.googleapis.com/token",
        },
        upcomingWindowDays: 92,
      },
    },
    intent: {
      openai: { model: "gpt-5.4-nano" },
      provider: "openai",
    },
    responseRewriter: { provider: "disabled" },
  });
}
