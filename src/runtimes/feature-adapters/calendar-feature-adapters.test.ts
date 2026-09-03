import { jsonResponse } from "../../test-support/adapter-contract.js";
import { createConfiguredTextRuntime } from "../configured-text-runtime.js";
import { parseAssistantConfig } from "../config/config.js";
import { createDefaultFeatureAdapterRegistry } from "../default-feature-adapter-registry.js";

const now = new Date("2026-09-03T09:00:00.000Z");
const request = "Hey Jarvis, what upcoming calendar events do I have?";

describe("calendar feature adapters", () => {
  it("composes configured Google events through the OpenAI grouper", async () => {
    const fetch = createCalendarFetch({
      groups: [
        {
          eventIndexes: [0, 1],
          milestones: [
            { eventIndex: 0, label: "guest arrival" },
            { eventIndex: 1, label: "the ceremony" },
          ],
          theme: "the wedding",
        },
      ],
    });
    const assistant = await createCalendarRuntime(fetch);

    const response = await assistant.handleText(request);

    expect(response.status).toBe("ok");
    expect(response.text).toContain("the wedding on this Saturday the 5th");
    expect(response.text).toContain("guest arrival at 6pm");
    expect(response.text).toContain("the ceremony at 7pm");
    expect(response.text).not.toMatch(/[💒💍]/u);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls.map(([url]) => requestUrl(url))).toEqual([
      expect.stringContaining("www.googleapis.com/calendar/v3"),
      "https://api.openai.test/v1/responses",
    ]);
  });

  it("preserves the ungrouped response and diagnostic when grouping is invalid", async () => {
    const fetch = createCalendarFetch({
      groups: [
        {
          eventIndexes: [0, 9],
          milestones: [
            { eventIndex: 0, label: "guest arrival" },
            { eventIndex: 9, label: "the ceremony" },
          ],
          theme: "the wedding",
        },
      ],
    });
    const assistant = await createCalendarRuntime(fetch);

    const outcome = await assistant.handleTextWithDiagnostics(request);

    expect(outcome.response.status).toBe("ok");
    expect(outcome.response.text).toContain(
      "You have 2 upcoming calendar events",
    );
    expect(outcome.response.text).toContain("Guest Arrival on this Saturday");
    expect(outcome.response.text).not.toMatch(/[💒💍]/u);
    expect(outcome.diagnostics).toMatchObject([
      {
        capability: "calendar.search_events",
        category: "feature_failure",
        message: "Calendar event grouping failed.",
      },
    ]);
  });
});

function createCalendarRuntime(fetch: ReturnType<typeof createCalendarFetch>) {
  const env = {
    GOOGLE_CALENDAR_ACCESS_TOKEN: "google-token",
    OPENAI_API_KEY: "openai-token",
  };
  const featureAdapterRegistry = createDefaultFeatureAdapterRegistry({
    calendar: { env, fetch },
  });
  const config = parseAssistantConfig(
    {
      assistant: {
        name: "Jarvis",
        timeZone: "Europe/London",
        wakePhrases: ["hey jarvis"],
      },
      conversation: {
        history: { maxTurnsBeforeCompaction: 5 },
        provider: "disabled",
      },
      features: {
        calendar: {
          adapter: "google",
          enabled: true,
          eventGrouping: {
            openai: {
              baseUrl: "https://api.openai.test/v1",
              model: "gpt-test",
              reasoningEffort: "none",
            },
            provider: "openai",
          },
          google: {},
          upcomingWindowDays: 14,
        },
      },
      intent: { provider: "deterministic" },
      responseRewriter: { provider: "disabled" },
    },
    { featureAdapterRegistry },
  );
  return createConfiguredTextRuntime({ config, now: () => now });
}

function createCalendarFetch(grouping: unknown) {
  return vi.fn<typeof globalThis.fetch>((input) => {
    const url = requestUrl(input);
    if (url.startsWith("https://www.googleapis.com/calendar/v3")) {
      return Promise.resolve(
        jsonResponse({
          items: [
            {
              id: "arrival",
              start: { dateTime: "2026-09-05T18:00:00+01:00" },
              summary: "💒 Guest Arrival",
            },
            {
              id: "ceremony",
              start: { dateTime: "2026-09-05T19:00:00+01:00" },
              summary: "💍 Ceremony",
            },
          ],
        }),
      );
    }
    if (url === "https://api.openai.test/v1/responses") {
      return Promise.resolve(
        jsonResponse({ output_text: JSON.stringify(grouping) }),
      );
    }
    throw new Error(`Unexpected request to ${url}`);
  });
}

function requestUrl(input: Parameters<typeof globalThis.fetch>[0]): string {
  if (typeof input === "string") return input;
  return input instanceof URL ? input.href : input.url;
}
