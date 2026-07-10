import { createCalendarFeature } from "./calendar-feature.js";
import type {
  CalendarSearchCriteria,
  CalendarSearchPort,
} from "../../ports/calendar.js";
import {
  createFeatureContext,
  expectDecodedFeatureExecution,
  expectCapabilityMetadata,
  expectFeatureHandles,
} from "../../test-support/feature-contract.js";

const context = createFeatureContext();

describe("createCalendarFeature", () => {
  const createFeature = () => createCalendarFeature(createFakeCalendar());

  it("declares searchable calendar event metadata", () => {
    expectCapabilityMetadata(createFeature(), {
      name: "calendar.search_events",
      risk: "low",
      parameters: {
        endDate: { type: "string" },
        query: { type: "string" },
        startDate: { type: "string" },
      },
    });
  });

  it("handles calendar search commands", () => {
    expectFeatureHandles(
      createFeature(),
      "calendar.search_events",
      "alarm.create",
    );
  });

  it("returns the fixture wedding date", async () => {
    await expectDecodedFeatureExecution(
      createFeature(),
      "calendar.search_events",
      { query: "upcoming wedding" },
      {
        text: "Upcoming wedding is on September 12, in about three months.",
        data: {
          eventId: "wedding-2026",
          date: "2026-09-12",
          title: "Upcoming wedding",
        },
      },
      context,
    );
  });

  it("returns upcoming events when no query is provided", async () => {
    await expectDecodedFeatureExecution(
      createFeature(),
      "calendar.search_events",
      {},
      {
        text: "Your upcoming calendar events are: Upcoming wedding on September 12, in about three months.",
        data: {
          eventCount: 1,
        },
      },
      context,
    );
  });

  it("returns a deterministic no-upcoming-events response", async () => {
    await expectDecodedFeatureExecution(
      createFeature(),
      "calendar.search_events",
      { endDate: "2026-08-31", startDate: "2026-08-01" },
      {
        text: "I could not find any upcoming calendar events.",
      },
      context,
    );
  });

  it("returns a deterministic no-match response", async () => {
    await expectDecodedFeatureExecution(
      createFeature(),
      "calendar.search_events",
      { query: "dentist" },
      {
        text: 'I could not find a calendar event matching "dentist".',
      },
      context,
    );
  });

  it("adds a default window for generic upcoming event searches", async () => {
    const calls: CalendarSearchCriteria[] = [];
    const calendar = createFakeCalendar(calls);

    await expectDecodedFeatureExecution(
      createCalendarFeature(calendar, { upcomingWindowDays: 92 }),
      "calendar.search_events",
      {},
      {
        text: "Your upcoming calendar events are: Upcoming wedding on September 12, in about three months.",
        data: {
          eventCount: 1,
        },
      },
      context,
    );

    expect(calls).toEqual([{ endDate: "2026-09-26" }]);
  });

  it("keeps explicit upcoming search date bounds", async () => {
    const calls: CalendarSearchCriteria[] = [];
    const calendar = createFakeCalendar(calls);

    await expectDecodedFeatureExecution(
      createCalendarFeature(calendar, { upcomingWindowDays: 92 }),
      "calendar.search_events",
      { endDate: "2026-08-31", startDate: "2026-08-01" },
      {
        text: "I could not find any upcoming calendar events.",
      },
      context,
    );

    expect(calls).toEqual([{ endDate: "2026-08-31", startDate: "2026-08-01" }]);
  });

  it("describes near upcoming events with relative timing", async () => {
    await expectDecodedFeatureExecution(
      createCalendarFeature(
        createFakeCalendar(undefined, {
          id: "interview-2026",
          startDate: "2026-07-06",
          title: "Zak - Onsite Interview - Agentic Engineer",
        }),
      ),
      "calendar.search_events",
      { query: "interview" },
      {
        text: "Zak - Onsite Interview - Agentic Engineer is on July 6, in just over a week.",
        data: {
          eventId: "interview-2026",
          date: "2026-07-06",
          title: "Zak - Onsite Interview - Agentic Engineer",
        },
      },
      createFeatureContext({
        assistant: {
          name: "Jarvis",
          wakePhrases: ["hey jarvis"],
        },
        features: {
          test: { enabled: true },
        },
      }),
    );
  });
});

function createFakeCalendar(
  calls: CalendarSearchCriteria[] = [],
  event = {
    id: "wedding-2026",
    startDate: "2026-09-12",
    title: "Upcoming wedding",
  },
): CalendarSearchPort {
  return {
    searchEvents: (criteria) => {
      calls.push(criteria);

      return Promise.resolve(
        criteria.endDate === "2026-08-31"
          ? []
          : criteria.query === undefined ||
              criteria.query === "upcoming wedding" ||
              criteria.query === "interview"
            ? [event]
            : [],
      );
    },
  };
}
