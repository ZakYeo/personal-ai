import { createGoogleCalendarAdapter } from "../../adapters/google-calendar/google-calendar-adapter.js";
// cspell:ignore Kiritimati
import {
  createGoogleCalendarConfig,
  createProviderCredentialEnv,
  jsonResponse,
} from "../../test-support/adapter-contract.js";
import { createLoadedRuntimeConfig } from "../../test-support/core-assistant.js";
import { calendarSearchService } from "../feature-source-services.js";
import {
  bindRuntimeService,
  createRuntimeServiceRegistry,
} from "../runtime-service-registry.js";
import { readPresentationProjection } from "./presentation-projection-reader.js";

describe("Google-backed Today projection", () => {
  it("retains an all-day date whose calendar midnight lies outside the assistant's instant window", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>((input) => {
      if (typeof input !== "string") throw new Error("Expected a URL string.");
      const upper = new URL(input).searchParams.get("timeMax")!;
      const included = Date.parse(upper) > Date.parse("2026-03-29T12:00:00Z");
      return Promise.resolve(
        jsonResponse({
          items: included
            ? [
                {
                  id: "all-day",
                  summary: "All day today",
                  start: { date: "2026-03-29" },
                },
              ]
            : [],
        }),
      );
    });
    expect(
      (
        await project(
          fetch,
          new Date("2026-03-29T00:00:00Z"),
          "Pacific/Kiritimati",
        )
      ).today,
    ).toEqual(["All day · All day today"]);
  });
  it("pages past older overlaps and empty pages before applying the result cap", async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockResolvedValueOnce(
        jsonResponse({
          items: Array.from({ length: 10 }, (_, index) => ({
            id: `old-${index}`,
            summary: "Earlier overlap",
            start: { dateTime: "2026-03-28T12:00:00Z" },
          })),
          nextPageToken: "second",
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({ items: [], nextPageToken: "third" }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          items: [
            {
              id: "today",
              summary: "Today meeting",
              start: { dateTime: "2026-03-29T12:00:00Z" },
            },
            {
              id: "all-day",
              summary: "All day today",
              start: { date: "2026-03-29" },
            },
          ],
        }),
      );
    const projection = await project(fetch);
    expect(projection.today).toEqual([
      "29 Mar, 13:00 · Today meeting",
      "All day · All day today",
    ]);
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(fetch.mock.calls[2]?.[0]).toEqual(
      expect.stringContaining("pageToken=third"),
    );
  });

  it.each([
    ["2026-03-29", "2026-03-28T00:00:00.000Z", "2026-03-31T00:00:00.000Z"],
    ["2026-10-25", "2026-10-24T00:00:00.000Z", "2026-10-27T00:00:00.000Z"],
  ])(
    "discovers date-only events across calendar timezones on %s",
    async (day, start, end) => {
      const fetch = vi
        .fn<typeof globalThis.fetch>()
        .mockResolvedValue(jsonResponse({ items: [] }));
      await project(fetch, new Date(`${day}T12:00:00Z`));
      const input = fetch.mock.calls[0]?.[0];
      const url = new URL(
        typeof input === "string" ? input : "https://unexpected.test",
      );
      expect(url.searchParams.get("timeMin")).toBe(start);
      expect(url.searchParams.get("timeMax")).toBe(end);
    },
  );

  it("marks an exhausted page budget degraded instead of claiming an empty day", async () => {
    let page = 0;
    const fetch = vi.fn<typeof globalThis.fetch>(() =>
      Promise.resolve(
        jsonResponse({ items: [], nextPageToken: `page-${++page}` }),
      ),
    );
    const projection = await project(fetch);
    expect(fetch).toHaveBeenCalledTimes(5);
    expect(projection.integrations).toEqual([
      { label: "Calendar", status: "degraded", lastCheck: "29 Mar, 13:00" },
    ]);
  });

  it.each(["", 7, "token\ncontrol", "x".repeat(2049)])(
    "rejects an invalid continuation token",
    async (nextPageToken) => {
      const fetch = vi
        .fn<typeof globalThis.fetch>()
        .mockResolvedValue(jsonResponse({ items: [], nextPageToken }));
      expect((await project(fetch)).integrations[0]?.status).toBe("degraded");
      expect(fetch).toHaveBeenCalledOnce();
    },
  );

  it("rejects repeated continuation tokens even when pages omit items", async () => {
    const fetch = vi
      .fn<typeof globalThis.fetch>()
      .mockImplementation(() =>
        Promise.resolve(jsonResponse({ nextPageToken: "same" })),
      );
    expect((await project(fetch)).integrations[0]?.status).toBe("degraded");
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});

function project(
  fetch: typeof globalThis.fetch,
  now = new Date("2026-03-29T12:00:00Z"),
  timeZone = "Europe/London",
) {
  const calendar = createGoogleCalendarAdapter({
    config: createGoogleCalendarConfig(),
    fetch,
    env: createProviderCredentialEnv(
      "GOOGLE_CALENDAR_ACCESS_TOKEN",
      "test-google-token",
    ),
  });
  const config = createLoadedRuntimeConfig({
    calendar: { adapter: "mock", enabled: true },
  });
  config.assistant.timeZone = timeZone;
  return readPresentationProjection({
    config,
    now,
    projectProfile: () => [],
    reportFailure: vi.fn(),
    services: createRuntimeServiceRegistry([
      bindRuntimeService(calendarSearchService, calendar),
    ]),
  });
}
