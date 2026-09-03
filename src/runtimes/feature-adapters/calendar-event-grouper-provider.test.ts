import { jsonResponse } from "../../test-support/adapter-contract.js";
import {
  resolveCalendarEventGrouperProvider,
  type CalendarEventGrouperProviderDependencies,
} from "./calendar-event-grouper-provider.js";

const input = {
  events: [
    { index: 0, startDate: "2026-11-13", startTime: "12:30", title: "Arrival" },
    {
      index: 1,
      startDate: "2026-11-13",
      startTime: "13:00",
      title: "Ceremony",
    },
  ],
};

describe("calendar event grouper provider", () => {
  it("resolves the mock as a configless provider", async () => {
    const provider = resolveCalendarEventGrouperProvider({
      openai: "ignored because mock is configless",
      provider: "mock",
    });
    const resolved = provider.create(createDependencies());

    expect(() => resolved.validateStartup()).not.toThrow();
    await expect(resolved.grouper.group(input)).resolves.toEqual({
      groups: [],
    });
  });

  it("captures parsed OpenAI config for construction and preflight", async () => {
    const fetch = vi.fn(() =>
      Promise.resolve(jsonResponse({ output_text: '{"groups":[]}' })),
    ) as typeof globalThis.fetch;
    const provider = resolveCalendarEventGrouperProvider({
      openai: { apiKeyEnv: "CALENDAR_GROUPING_KEY", model: "gpt-test" },
      provider: "openai",
    });
    const resolved = provider.create(
      createDependencies({ CALENDAR_GROUPING_KEY: "secret" }, fetch),
    );

    expect(() => resolved.validateStartup()).not.toThrow();
    await expect(resolved.grouper.group(input)).resolves.toEqual({
      groups: [],
    });
  });

  it("fails startup when the selected OpenAI credential is absent", () => {
    const provider = resolveCalendarEventGrouperProvider({
      openai: { model: "gpt-test" },
      provider: "openai",
    });
    const resolved = provider.create(createDependencies());

    expect(() => resolved.validateStartup()).toThrow(
      "OpenAI calendar event grouper is selected but OPENAI_API_KEY is not set.",
    );
  });

  it("rejects an unregistered provider", () => {
    expect(() =>
      resolveCalendarEventGrouperProvider({ provider: "unknown" }),
    ).toThrow(
      'Config feature "calendar".eventGrouping.provider "unknown" is not registered.',
    );
  });

  it("requires an explicit provider object", () => {
    expect(() => resolveCalendarEventGrouperProvider(undefined)).toThrow(
      'Config feature "calendar".eventGrouping must be a JSON object.',
    );
  });
});

function createDependencies(
  env: Record<string, string | undefined> = {},
  fetch: typeof globalThis.fetch = vi.fn(),
): CalendarEventGrouperProviderDependencies {
  return { env, fetch };
}
