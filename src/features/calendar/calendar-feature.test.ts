import { createCalendarFeature } from "./calendar-feature.js";
import type {
  CalendarEvent,
  CalendarSearchCriteria,
  CalendarSearchPort,
} from "../../ports/calendar.js";
import type { FeaturePlugin } from "../../ports/feature.js";
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
        startAt: "2026-07-17T10:00:00.000Z",
        startDate: "2026-07-17",
        startTime: "11:00",
        title: "Dentist",
      },
    ];
    const followUpContext = {
      ...context,
      resultReferences: [
        {
          facts: {
            date: "2026-07-17",
            startAt: "2026-07-17T10:00:00.000Z",
            time: "11:00",
            title: "Dentist",
          },
          kind: "calendar_event" as const,
          ordinal: 1,
          reference: "calendar-event-1",
        },
      ],
      selectResultReference: () => ({
        publicReference: {
          facts: {
            date: "2026-07-17",
            time: "11:00",
            title: "Dentist",
          },
          kind: "calendar_event" as const,
          ordinal: 1,
          reference: "calendar-event-1",
        },
        target: {
          kind: "calendar_event" as const,
          providerEventId: "dentist-provider-id",
        },
      }),
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
        toolObservationData: {
          date: "2026-07-17",
          location: "12 High Street",
          title: "Dentist",
        },
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
            facts: { date: "2026-07-17", time: "11:00", title: "One" },
            kind: "calendar_event",
            ordinal: 1,
            reference: "calendar-event-1",
          },
          {
            facts: { date: "2026-07-18", time: "12:00", title: "Two" },
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
        toolObservationData: {
          date: "2026-09-12",
          time: "all day",
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
        text: "You have 1 upcoming calendar event: Upcoming wedding on 2026-09-12, all day.",
        data: {
          eventCount: 1,
          event0Date: "2026-09-12",
          event0Time: "all day",
          event0Title: "Upcoming wedding",
        },
        resultReferences: calendarResultReferences(),
        toolObservationData: { eventCount: 1 },
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
            startAt: "2026-07-17T10:00:00.000Z",
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
          event0StartAt: "2026-07-17T10:00:00.000Z",
          event0Time: "11:00",
          event0Title: ".CLAY Studios: Gents Haircut",
          event1Date: "2026-07-20",
          event1Time: "all day",
          event1Title: "Zak - Onsite Interview - Agentic Engineer",
        },
        resultReferences: calendarResultReferences([
          {
            id: "haircut-2026",
            startAt: "2026-07-17T10:00:00.000Z",
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
        toolObservationData: { eventCount: 2 },
      },
      context,
    );
  });

  it("removes emoji from calendar titles before exposing human-facing facts", async () => {
    const event = {
      id: "wedding-ceremony",
      startAt: "2026-11-13T13:00:00.000Z",
      startDate: "2026-11-13",
      startTime: "13:00",
      title: "💍 Ceremony / 웨딩 세리머니",
    };

    await expectDecodedFeatureExecution(
      createCalendarFeature(createFakeCalendar(undefined, [event])),
      "calendar.search_events",
      {},
      {
        text: "You have 1 upcoming calendar event: Ceremony / 웨딩 세리머니 on 2026-11-13 at 13:00.",
        data: {
          eventCount: 1,
          event0Date: "2026-11-13",
          event0StartAt: "2026-11-13T13:00:00.000Z",
          event0Time: "13:00",
          event0Title: "Ceremony / 웨딩 세리머니",
        },
        resultReferences: calendarResultReferences([
          { ...event, title: "Ceremony / 웨딩 세리머니" },
        ]),
        toolObservationData: { eventCount: 1 },
      },
      context,
    );
  });

  it("summarizes clearly connected same-day entries with key milestones", async () => {
    const events: CalendarEvent[] = [
      calendarEvent(
        "arrival",
        "12:30",
        "💒 Guest Arrival & Welcome Drinks 하객 도착",
      ),
      calendarEvent("ceremony", "13:00", "💍 Ceremony / 웨딩 세리머니"),
      calendarEvent(
        "drinks",
        "13:30",
        "🥂 Drinks Reception & Canapés / 리셉션 & 카나페",
      ),
      calendarEvent(
        "breakfast",
        "15:20",
        "🍽️ Wedding Breakfast & Speeches / 웨딩 만찬 & 축사",
      ),
      calendarEvent(
        "reception",
        "19:10",
        "🎉 Evening Reception / 이브닝 리셉션",
      ),
      calendarEvent("buffet", "21:00", "🍽️ Evening Buffet / 이브닝 뷔페"),
    ];
    const eventGrouper = {
      group: vi.fn(() =>
        Promise.resolve({
          groups: [
            {
              eventIndexes: [0, 1, 2, 3, 4, 5],
              milestones: [
                { eventIndex: 0, label: "guest arrival" },
                { eventIndex: 1, label: "the ceremony" },
                { eventIndex: 3, label: "the wedding breakfast" },
                { eventIndex: 4, label: "the evening reception" },
              ],
              theme: "the wedding",
            },
          ],
        }),
      ),
    };

    const result = await executeCalendarSearch(
      createCalendarFeature(createFakeCalendar(undefined, events), {
        eventGrouper,
      }),
    );

    expect(result).toMatchObject({
      data: {
        eventCount: 6,
        group0Date: "2026-11-13",
        group0Milestone0Label: "guest arrival",
        group0Milestone0Time: "12:30",
        group0Milestone1Label: "the ceremony",
        group0Milestone1Time: "13:00",
        group0Milestone2Label: "the wedding breakfast",
        group0Milestone2Time: "15:20",
        group0Milestone3Label: "the evening reception",
        group0Milestone3Time: "19:10",
        group0Theme: "the wedding",
      },
      text: "Your upcoming calendar includes the wedding on 2026-11-13: guest arrival at 12:30, the ceremony at 13:00, the wedding breakfast at 15:20, and the evening reception at 19:10.",
    });
    expect(eventGrouper.group).toHaveBeenCalledWith(
      {
        events: events.map((event, index) => ({
          index,
          startDate: event.startDate,
          startTime: event.startTime,
          title: event.title.replace(
            /^\p{Extended_Pictographic}\uFE0F?\s*/u,
            "",
          ),
        })),
      },
      {},
    );
    expect(result.resultReferences).toEqual(
      calendarResultReferences(
        events.map((event) => ({
          ...event,
          title: event.title.replace(
            /^\p{Extended_Pictographic}\uFE0F?\s*/u,
            "",
          ),
        })),
      ),
    );
  });

  it("leaves unrelated same-day entries separate when the grouper returns no groups", async () => {
    const events = [
      calendarEvent("dentist", "10:00", "Dentist"),
      calendarEvent("concert", "19:00", "Mac DeMarco"),
    ];
    const eventGrouper = {
      group: vi.fn(() => Promise.resolve({ groups: [] })),
    };

    const result = await executeCalendarSearch(
      createCalendarFeature(createFakeCalendar(undefined, events), {
        eventGrouper,
      }),
    );

    expect(result.text).toBe(
      "You have 2 upcoming calendar events: Dentist on 2026-11-13 at 10:00, Mac DeMarco on 2026-11-13 at 19:00.",
    );
  });

  it("falls back to complete ungrouped results with a non-fatal diagnostic", async () => {
    const events = [
      calendarEvent("arrival", "12:30", "Guest arrival"),
      calendarEvent("ceremony", "13:00", "Ceremony"),
    ];
    const cause = new Error("grouping transport failed");

    const result = await executeCalendarSearch(
      createCalendarFeature(createFakeCalendar(undefined, events), {
        eventGrouper: {
          group: () => Promise.reject(cause),
        },
      }),
    );

    expect(result).toMatchObject({
      diagnostics: [{ cause, message: "Calendar event grouping failed." }],
      resultReferences: calendarResultReferences(events),
      text: "You have 2 upcoming calendar events: Guest arrival on 2026-11-13 at 12:30, Ceremony on 2026-11-13 at 13:00.",
    });
  });

  it("does not call the grouper without same-day candidates", async () => {
    const group = vi.fn(() => Promise.resolve({ groups: [] }));
    const events = [
      calendarEvent("dentist", "10:00", "Dentist"),
      {
        ...calendarEvent("concert", "19:00", "Mac DeMarco"),
        startDate: "2026-11-14",
      },
    ];

    await executeCalendarSearch(
      createCalendarFeature(createFakeCalendar(undefined, events), {
        eventGrouper: { group },
      }),
    );

    expect(group).not.toHaveBeenCalled();
  });

  it("returns a deterministic no-upcoming-events response", async () => {
    await expectDecodedFeatureExecution(
      createFeature(),
      "calendar.search_events",
      { endDate: "2026-08-31", startDate: "2026-08-01" },
      {
        resultReferences: calendarResultReferences([]),
        text: "I could not find any upcoming calendar events.",
        toolObservationData: { eventCount: 0 },
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
        resultReferences: calendarResultReferences([]),
        text: 'I could not find a calendar event matching "dentist".',
        toolObservationData: { eventCount: 0 },
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
        toolObservationData: { eventCount: 1 },
      },
      context,
    );

    expect(calls).toEqual([{ endDate: "2026-09-26" }]);
  });

  it("defaults generic upcoming event searches to the next 14 days", async () => {
    const calls: CalendarSearchCriteria[] = [];
    const feature = createCalendarFeature(createFakeCalendar(calls));

    await feature.execute(
      {
        capability: "calendar.search_events",
        command: {
          capability: "calendar.search_events",
          parameters: {},
          rawText: "check my calendar",
        },
        args: {},
      },
      context,
    );

    expect(calls).toEqual([{ endDate: "2026-07-10" }]);
  });

  it("keeps explicit upcoming search date bounds", async () => {
    const calls: CalendarSearchCriteria[] = [];
    const calendar = createFakeCalendar(calls);

    await expectDecodedFeatureExecution(
      createCalendarFeature(calendar, { upcomingWindowDays: 92 }),
      "calendar.search_events",
      { endDate: "2026-08-31", startDate: "2026-08-01" },
      {
        resultReferences: calendarResultReferences([]),
        text: "I could not find any upcoming calendar events.",
        toolObservationData: { eventCount: 0 },
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
            startAt: "2026-07-06T08:30:00.000Z",
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
          startAt: "2026-07-06T08:30:00.000Z",
          time: "09:30",
          title: "Zak - Onsite Interview - Agentic Engineer",
        },
        resultReferences: calendarResultReferences([
          {
            id: "interview-2026",
            startAt: "2026-07-06T08:30:00.000Z",
            startDate: "2026-07-06",
            startTime: "09:30",
            title: "Zak - Onsite Interview - Agentic Engineer",
          },
        ]),
        toolObservationData: {
          date: "2026-07-06",
          startAt: "2026-07-06T08:30:00.000Z",
          time: "09:30",
          title: "Zak - Onsite Interview - Agentic Engineer",
        },
      },
      createFeatureContext({
        assistant: {
          name: "Jarvis",
          timeZone: "Europe/London",
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
        ...(event.startAt ? { startAt: event.startAt } : {}),
        time: event.startTime ?? "all day",
        title: event.title,
      },
      target: { kind: "calendar_event" as const, providerEventId: event.id },
    })),
    kind: "calendar_events" as const,
  };
}

function calendarEvent(
  id: string,
  startTime: string,
  title: string,
): CalendarEvent {
  return {
    id,
    startAt: `2026-11-13T${startTime}:00.000Z`,
    startDate: "2026-11-13",
    startTime,
    title,
  };
}

function executeCalendarSearch(feature: FeaturePlugin) {
  return feature.execute(
    {
      capability: "calendar.search_events",
      command: {
        capability: "calendar.search_events",
        parameters: {},
        rawText: "check my calendar",
      },
      args: {},
    },
    context,
  );
}
