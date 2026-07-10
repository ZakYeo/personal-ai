import {
  createAbortingFetchStub,
  createFetchStub,
  createMissingProviderCredentialEnv,
  createProviderCredentialEnv,
  createProviderTransportFailureFetchStub,
  jsonResponse,
  malformedJsonResponse,
  providerErrorResponse,
} from "../../test-support/adapter-contract.js";
import { deterministicTestNow } from "../../test-support/primitives.js";
import {
  createGoogleCalendarAdapter,
  type GoogleCalendarError,
} from "./google-calendar-adapter.js";

describe("createGoogleCalendarAdapter", () => {
  it("returns normalized events from Google Calendar output", async () => {
    const fetch = createFetchStub(
      jsonResponse({
        items: [
          {
            id: "event-1",
            summary: "Upcoming wedding",
            start: { date: "2026-09-12" },
          },
          {
            id: "event-2",
            summary: "Dinner",
            start: { dateTime: "2026-09-13T18:30:00Z" },
          },
        ],
      }),
    );
    const calendar = createAdapter({ fetch });

    await expect(
      calendar.searchEvents(
        { query: "upcoming wedding" },
        { now: deterministicTestNow },
      ),
    ).resolves.toEqual([
      {
        id: "event-1",
        startDate: "2026-09-12",
        title: "Upcoming wedding",
      },
      {
        id: "event-2",
        startDate: "2026-09-13",
        title: "Dinner",
      },
    ]);

    expect(fetch).toHaveBeenCalledWith(
      "https://calendar.example.test/v3/calendars/primary/events?q=upcoming+wedding&singleEvents=true&orderBy=startTime&timeMin=2026-06-26T09%3A00%3A00.000Z&maxResults=10",
      expect.objectContaining({
        headers: {
          authorization: "Bearer test-google-token",
        },
        method: "GET",
      }),
    );
  });

  it("returns an empty list when no Google events match", async () => {
    const calendar = createAdapter({
      fetch: createFetchStub(jsonResponse({ items: [] })),
    });

    await expect(
      calendar.searchEvents(
        { query: "dentist" },
        { now: deterministicTestNow },
      ),
    ).resolves.toEqual([]);
  });

  it("omits the Google text query for generic upcoming event searches", async () => {
    const fetch = createFetchStub(jsonResponse({ items: [] }));
    const calendar = createAdapter({ fetch });

    await expect(
      calendar.searchEvents({}, { now: deterministicTestNow }),
    ).resolves.toEqual([]);

    expect(fetch).toHaveBeenCalledWith(
      "https://calendar.example.test/v3/calendars/primary/events?singleEvents=true&orderBy=startTime&timeMin=2026-06-26T09%3A00%3A00.000Z&maxResults=10",
      expect.objectContaining({
        method: "GET",
      }),
    );
  });

  it("uses explicit date bounds for Google Calendar searches", async () => {
    const fetch = createFetchStub(jsonResponse({ items: [] }));
    const calendar = createAdapter({ fetch });

    await expect(
      calendar.searchEvents(
        { endDate: "2026-08-31", startDate: "2026-08-01" },
        { now: deterministicTestNow },
      ),
    ).resolves.toEqual([]);

    expect(fetch).toHaveBeenCalledWith(
      "https://calendar.example.test/v3/calendars/primary/events?singleEvents=true&orderBy=startTime&timeMin=2026-08-01T00%3A00%3A00.000Z&timeMax=2026-08-31T23%3A59%3A59.999Z&maxResults=10",
      expect.objectContaining({
        method: "GET",
      }),
    );
  });

  it("rejects missing access tokens before calling the provider", async () => {
    const fetch = vi.fn();
    const calendar = createAdapter({
      env: createMissingProviderCredentialEnv(),
      fetch,
    });

    await expect(
      calendar.searchEvents(
        { query: "upcoming wedding" },
        { now: deterministicTestNow },
      ),
    ).rejects.toThrow(
      "Google Calendar access token environment variable GOOGLE_CALENDAR_ACCESS_TOKEN is not set.",
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects non-2xx provider responses with status diagnostics", async () => {
    const calendar = createAdapter({
      fetch: createFetchStub(
        providerErrorResponse(
          401,
          { error: { message: "invalid token" } },
          "Unauthorized",
        ),
      ),
    });

    await expect(
      calendar.searchEvents(
        { query: "upcoming wedding" },
        { now: deterministicTestNow },
      ),
    ).rejects.toMatchObject({
      message: "Google Calendar events request failed with status 401.",
      responseBody: '{"error":{"message":"invalid token"}}',
      status: 401,
    } satisfies Partial<GoogleCalendarError>);
  });

  it("rejects provider response bodies that are not JSON with diagnostics", async () => {
    const calendar = createAdapter({
      fetch: createFetchStub(malformedJsonResponse("{not-json")),
    });

    await expect(
      calendar.searchEvents(
        { query: "upcoming wedding" },
        { now: deterministicTestNow },
      ),
    ).rejects.toMatchObject({
      message: "Google Calendar events response body was not valid JSON.",
      responseBody: "{not-json",
      status: 200,
    } satisfies Partial<GoogleCalendarError>);
  });

  it("rejects malformed provider event payloads", async () => {
    const calendar = createAdapter({
      fetch: createFetchStub(
        jsonResponse({
          items: [
            {
              id: "event-1",
              summary: "Upcoming wedding",
              start: {},
            },
          ],
        }),
      ),
    });

    await expect(
      calendar.searchEvents(
        { query: "upcoming wedding" },
        { now: deterministicTestNow },
      ),
    ).rejects.toThrow(
      "Google Calendar event start date must be a non-empty string.",
    );
  });

  it("rejects transport failures without replacing the provider diagnostic", async () => {
    const error = new TypeError("network unavailable");
    const calendar = createAdapter({
      fetch: createProviderTransportFailureFetchStub(error),
    });

    await expect(
      calendar.searchEvents(
        { query: "upcoming wedding" },
        { now: deterministicTestNow },
      ),
    ).rejects.toBe(error);
  });

  it("aborts requests that exceed the configured timeout", async () => {
    const calendar = createAdapter({
      fetch: createAbortingFetchStub(),
      timeoutMs: 1,
    });

    await expect(
      calendar.searchEvents(
        { query: "upcoming wedding" },
        { now: deterministicTestNow },
      ),
    ).rejects.toThrow("Google Calendar events request timed out after 1ms.");
  });
});

interface CreateAdapterOptions {
  env?: Record<string, string | undefined>;
  fetch?: typeof fetch;
  timeoutMs?: number;
}

function createAdapter(options: CreateAdapterOptions = {}) {
  return createGoogleCalendarAdapter({
    config: {
      accessTokenEnv: "GOOGLE_CALENDAR_ACCESS_TOKEN",
      baseUrl: "https://calendar.example.test/v3",
      calendarId: "primary",
      maxResults: 10,
      timeoutMs: options.timeoutMs ?? 30_000,
    },
    env:
      options.env ??
      createProviderCredentialEnv(
        "GOOGLE_CALENDAR_ACCESS_TOKEN",
        "test-google-token",
      ),
    fetch: options.fetch ?? vi.fn(),
  });
}
