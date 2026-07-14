import type {
  FeatureArgsFromParameters,
  FeatureCapabilityParameters,
  FeatureExecutionContext,
  FeaturePlugin,
} from "../../ports/feature.js";
import type {
  CalendarEvent,
  CalendarSearchPort,
} from "../../ports/calendar.js";
import {
  defineDeterministicFeatureRules,
  type DeterministicFeatureRule,
} from "../../ports/deterministic-feature-rules.js";
import { defineCapability, defineFeature } from "../../ports/feature.js";

const calendarSearchEventsParameters = {
  endDate: { type: "string" },
  query: { type: "string" },
  startDate: { type: "string" },
} as const satisfies FeatureCapabilityParameters;

const calendarFollowUpParameters = {
  detail: { type: "string", required: true },
  ordinal: { type: "number" },
  reference: { type: "string" },
} as const satisfies FeatureCapabilityParameters;

type CalendarSearchEventsArgs = FeatureArgsFromParameters<
  typeof calendarSearchEventsParameters
>;
type CalendarFollowUpArgs = FeatureArgsFromParameters<
  typeof calendarFollowUpParameters
>;

interface CalendarFeatureOptions {
  upcomingWindowDays?: number;
}

const calendarDeterministicIntentRules = [
  {
    capability: "calendar.follow_up",
    match: (text) => {
      const ordinal = parseOrdinal(text);
      if (text.includes("where is")) {
        return { detail: "location", ...(ordinal ? { ordinal } : {}) };
      }
      if (text.includes("what comes after") || text.includes("what is after")) {
        return { detail: "next", ...(ordinal ? { ordinal } : {}) };
      }
      return ordinal ? { detail: "summary", ordinal } : undefined;
    },
  },
  {
    capability: "calendar.search_events",
    match: (text) =>
      text.includes("calendar") && text.includes("upcoming wedding")
        ? { query: "upcoming wedding" }
        : undefined,
  },
  {
    capability: "calendar.search_events",
    match: (text) =>
      text.includes("calendar") &&
      text.includes("upcoming") &&
      text.includes("events")
        ? {}
        : undefined,
  },
] as const satisfies readonly DeterministicFeatureRule[];

export function createCalendarFeature(
  calendar: CalendarSearchPort,
  options: CalendarFeatureOptions = {},
): FeaturePlugin {
  const upcomingWindowDays = options.upcomingWindowDays ?? 92;

  return defineDeterministicFeatureRules(
    defineFeature({
      id: "calendar",
      displayName: "Calendar",
      capabilities: {
        "calendar.follow_up": defineCapability({
          description:
            "Answer a read-only question about an opaque event reference from the most recent calendar results.",
          risk: "low",
          summary: "Answer a follow-up about a recent calendar result.",
          spokenSummary: "ask about recent calendar results",
          parameters: calendarFollowUpParameters,
          execute: (request, context) =>
            answerCalendarFollowUp(calendar, request.args, context),
        }),
        "calendar.search_events": defineCapability({
          description:
            "Search configured calendar events by optional natural-language query and optional date range, or list upcoming events when no query is provided.",
          risk: "low",
          summary: "Search configured calendar events or list upcoming events.",
          spokenSummary: "check your calendar",
          parameters: calendarSearchEventsParameters,
          execute: async (request, context) =>
            searchEvents(calendar, request.args, context.clock.now(), {
              upcomingWindowDays,
            }),
        }),
      },
    }),
    calendarDeterministicIntentRules,
  );
}

async function searchEvents(
  calendar: CalendarSearchPort,
  args: CalendarSearchEventsArgs,
  now: Date,
  options: Required<CalendarFeatureOptions>,
) {
  const query = normalizeQuery(args.query);
  const endDate =
    args.endDate ??
    (query === undefined && args.startDate === undefined
      ? formatDate(addUtcDays(now, options.upcomingWindowDays))
      : undefined);
  const events = (
    await calendar.searchEvents(
      {
        ...(endDate === undefined ? {} : { endDate }),
        ...(query === undefined ? {} : { query }),
        ...(args.startDate === undefined ? {} : { startDate: args.startDate }),
      },
      { now },
    )
  ).slice(0, 10);
  const event = events[0];

  if (!event) {
    if (query === undefined) {
      return {
        resultReferences: createResultReferences([]),
        text: "I could not find any upcoming calendar events.",
      };
    }

    return {
      resultReferences: createResultReferences([]),
      text: `I could not find a calendar event matching "${query}".`,
    };
  }

  if (query === undefined) {
    const eventLabel = events.length === 1 ? "event" : "events";

    return {
      expectsFollowUp: true,
      text: `You have ${events.length} upcoming calendar ${eventLabel}: ${formatEventList(events)}.`,
      data: createUpcomingEventFacts(events),
      resultReferences: createResultReferences(events),
    };
  }

  return {
    expectsFollowUp: true,
    text: `${event.title} is ${formatEventStart(event)}.`,
    data: {
      date: event.startDate,
      time: event.startTime ?? "all day",
      title: event.title,
    },
    resultReferences: createResultReferences([event]),
  };
}

async function answerCalendarFollowUp(
  calendar: CalendarSearchPort,
  args: CalendarFollowUpArgs,
  context: FeatureExecutionContext,
) {
  const selected = context.selectResultReference?.({
    ...(args.detail === "next" ? { next: true } : {}),
    ...(args.ordinal === undefined ? {} : { ordinal: args.ordinal }),
    rawText: context.trustedInputText ?? "",
    ...(args.reference === undefined ? {} : { reference: args.reference }),
  });

  if (!selected) {
    return clarify(
      args.detail === "next"
        ? "I could not determine a later event from those recent results."
        : "I am not sure which recent calendar event you mean.",
    );
  }

  const event = await calendar.getEvent(selected.target.providerEventId, {
    now: context.clock.now(),
  });
  if (!event) {
    return clarify("I could not find that calendar event anymore.");
  }

  if (args.detail === "location") {
    return {
      data: {
        date: event.startDate,
        location: event.location ?? "not provided",
        title: event.title,
      },
      text: event.location
        ? `${event.title} is at ${event.location}.`
        : `${event.title} does not include a location.`,
    };
  }

  return {
    data: {
      date: event.startDate,
      time: event.startTime ?? "all day",
      title: event.title,
    },
    text: `${event.title} is ${formatEventStart(event)}.`,
  };
}

function clarify(text: string) {
  return { expectsFollowUp: true, text };
}

function createResultReferences(events: readonly CalendarEvent[]) {
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

function parseOrdinal(text: string): number | undefined {
  const word = text.match(
    /\b(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)\b/u,
  )?.[1];
  return word
    ? [
        "first",
        "second",
        "third",
        "fourth",
        "fifth",
        "sixth",
        "seventh",
        "eighth",
        "ninth",
        "tenth",
      ].indexOf(word) + 1
    : undefined;
}

function createUpcomingEventFacts(
  events: readonly CalendarEvent[],
): Record<string, string | number> {
  const facts: Record<string, string | number> = {
    eventCount: events.length,
  };

  events.forEach((event, index) => {
    facts[`event${index}Date`] = event.startDate;
    facts[`event${index}Time`] = event.startTime ?? "all day";
    facts[`event${index}Title`] = event.title;
  });

  return facts;
}

function normalizeQuery(query: string | undefined): string | undefined {
  const normalizedQuery = query?.trim().toLowerCase();

  return normalizedQuery && normalizedQuery.length > 0
    ? normalizedQuery
    : undefined;
}

function formatEventList(events: CalendarEvent[]): string {
  return events
    .map((event) => `${event.title} ${formatEventStart(event)}`)
    .join(", ");
}

function formatEventStart(event: CalendarEvent): string {
  return event.startTime === undefined
    ? `on ${event.startDate}, all day`
    : `on ${event.startDate} at ${event.startTime}`;
}

function addUtcDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);

  return next;
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}
