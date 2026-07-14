import { createCalendarFeature } from "./calendar-feature.js";
import type {
  CalendarEvent,
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

  it("answers an ordinal location follow-up through an opaque reference", async () => {
    const events: CalendarEvent[] = [
      {
        id: "dentist-provider-id",
        location: "12 High Street",
        startDate: "2026-07-17",
        startTime: "11:00",
        title: "Dentist",
      },
    ];
    const followUpContext = {
      ...context,
      resultReferences: [
        {
          facts: { title: "Dentist" },
          kind: "calendar_event" as const,
          ordinal: 1,
          reference: "calendar-event-1",
        },
      ],
      resolveResultReference: (reference: string) =>
        reference === "calendar-event-1"
          ? {
              kind: "calendar_event" as const,
              providerEventId: "dentist-provider-id",
            }
          : undefined,
    };

    await expectDecodedFeatureExecution(
      createCalendarFeature(createFakeCalendar(undefined, events)),
      "calendar.follow_up",
      { detail: "location", ordinal: 1 },
      {
        data: {
          date: "2026-07-17",
          location: "12 High Street",
          title: "Dentist",
        },
        text: "Dentist is at 12 High Street.",
      },
      followUpContext,
    );
  });

  it("asks for clarification rather than guessing an ambiguous event", async () => {
    await expectDecodedFeatureExecution(
      createFeature(),
      "calendar.follow_up",
      { detail: "location" },
      {
        expectsFollowUp: true,
        text: "I am not sure which recent calendar event you mean.",
      },
      {
        ...context,
        resultReferences: [
          {
            facts: { title: "One" },
            kind: "calendar_event",
            ordinal: 1,
            reference: "calendar-event-1",
          },
          {
            facts: { title: "Two" },
            kind: "calendar_event",
            ordinal: 2,
            reference: "calendar-event-2",
          },
        ],
      },
    );
  });

  it("returns the fixture wedding date", async () => {
    await expectDecodedFeatureExecution(
      createFeature(),
      "calendar.search_events",
      { query: "upcoming wedding" },
      {
        text: "Upcoming wedding is on 2026-09-12, all day.",
        data: {
          date: "2026-09-12",
          time: "all day",
          title: "Upcoming wedding",
        },
        resultReferences: calendarResultReferences([
          {
            id: "wedding-2026",
            startDate: "2026-09-12",
            title: "Upcoming wedding",
          },
        ]),
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
        text: "You have 1 upcoming calendar event: Upcoming wedding on 2026-09-12, all day.",
        data: {
          eventCount: 1,
          event0Date: "2026-09-12",
          event0Time: "all day",
          event0Title: "Upcoming wedding",
        },
        resultReferences: calendarResultReferences(),
      },
      context,
    );
  });

  it("returns every displayed upcoming event as protected response facts", async () => {
    await expectDecodedFeatureExecution(
      createCalendarFeature(
        createFakeCalendar(undefined, [
          {
            id: "haircut-2026",
            startDate: "2026-07-17",
            startTime: "11:00",
            title: ".CLAY Studios: Gents Haircut",
          },
          {
            id: "interview-2026",
            startDate: "2026-07-20",
            title: "Zak - Onsite Interview - Agentic Engineer",
          },
        ]),
      ),
      "calendar.search_events",
      {},
      {
        text: "You have 2 upcoming calendar events: .CLAY Studios: Gents Haircut on 2026-07-17 at 11:00, Zak - Onsite Interview - Agentic Engineer on 2026-07-20, all day.",
        data: {
          eventCount: 2,
          event0Date: "2026-07-17",
          event0Time: "11:00",
          event0Title: ".CLAY Studios: Gents Haircut",
          event1Date: "2026-07-20",
          event1Time: "all day",
          event1Title: "Zak - Onsite Interview - Agentic Engineer",
        },
        resultReferences: calendarResultReferences([
          {
            id: "haircut-2026",
            startDate: "2026-07-17",
            startTime: "11:00",
            title: ".CLAY Studios: Gents Haircut",
          },
          {
            id: "interview-2026",
            startDate: "2026-07-20",
            title: "Zak - Onsite Interview - Agentic Engineer",
          },
        ]),
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
        text: "You have 1 upcoming calendar event: Upcoming wedding on 2026-09-12, all day.",
        data: {
          eventCount: 1,
          event0Date: "2026-09-12",
          event0Time: "all day",
          event0Title: "Upcoming wedding",
        },
        resultReferences: calendarResultReferences(),
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

  it("returns exact provider dates without conversational timing policy", async () => {
    await expectDecodedFeatureExecution(
      createCalendarFeature(
        createFakeCalendar(undefined, [
          {
            id: "interview-2026",
            startDate: "2026-07-06",
            startTime: "09:30",
            title: "Zak - Onsite Interview - Agentic Engineer",
          },
        ]),
      ),
      "calendar.search_events",
      { query: "interview" },
      {
        text: "Zak - Onsite Interview - Agentic Engineer is on 2026-07-06 at 09:30.",
        data: {
          date: "2026-07-06",
          time: "09:30",
          title: "Zak - Onsite Interview - Agentic Engineer",
        },
        resultReferences: calendarResultReferences([
          {
            id: "interview-2026",
            startDate: "2026-07-06",
            startTime: "09:30",
            title: "Zak - Onsite Interview - Agentic Engineer",
          },
        ]),
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
  events: CalendarEvent[] = [
    {
      id: "wedding-2026",
      startDate: "2026-09-12",
      title: "Upcoming wedding",
    },
  ],
): CalendarSearchPort {
  return {
    getEvent: (id) => Promise.resolve(events.find((event) => event.id === id)),
    searchEvents: (criteria) => {
      calls.push(criteria);

      return Promise.resolve(
        criteria.endDate === "2026-08-31"
          ? []
          : criteria.query === undefined ||
              criteria.query === "upcoming wedding" ||
              criteria.query === "interview"
            ? events
            : [],
      );
    },
  };
}

function calendarResultReferences(
  events: CalendarEvent[] = [
    {
      id: "wedding-2026",
      startDate: "2026-09-12",
      title: "Upcoming wedding",
    },
  ],
) {
  return {
    items: events.map((event) => ({
      facts: {
        date: event.startDate,
        time: event.startTime ?? "all day",
        title: event.title,
      },
      target: { kind: "calendar_event" as const, providerEventId: event.id },
    })),
    kind: "calendar_events" as const,
  };
}
