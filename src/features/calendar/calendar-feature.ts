import type {
  FeatureArgsFromParameters,
  FeatureCapabilityParameters,
  FeaturePlugin,
} from "../../ports/feature.js";
import type { CalendarSearchPort } from "../../ports/calendar.js";
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

type CalendarSearchEventsArgs = FeatureArgsFromParameters<
  typeof calendarSearchEventsParameters
>;

const calendarDeterministicIntentRules: DeterministicFeatureRule[] = [
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
];

export function createCalendarFeature(
  calendar: CalendarSearchPort,
): FeaturePlugin {
  return defineDeterministicFeatureRules(
    defineFeature({
      id: "calendar",
      displayName: "Calendar",
      capabilities: {
        "calendar.search_events": defineCapability({
          description:
            "Search configured calendar events by optional natural-language query and optional date range, or list upcoming events when no query is provided.",
          risk: "low",
          summary: "Search configured calendar events or list upcoming events.",
          spokenSummary: "check your calendar",
          parameters: calendarSearchEventsParameters,
          execute: async (request, context) =>
            searchEvents(calendar, request.args, context.clock.now()),
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
) {
  const query = normalizeQuery(args.query);
  const events = await calendar.searchEvents(
    {
      ...(args.endDate === undefined ? {} : { endDate: args.endDate }),
      ...(query === undefined ? {} : { query }),
      ...(args.startDate === undefined ? {} : { startDate: args.startDate }),
    },
    { now },
  );
  const event = events[0];

  if (!event) {
    if (query === undefined) {
      return {
        text: "I could not find any upcoming calendar events.",
      };
    }

    return {
      text: `I could not find a calendar event matching "${query}".`,
    };
  }

  if (query === undefined) {
    return {
      text: `Your upcoming calendar events are: ${formatEventList(events)}.`,
      data: {
        eventCount: events.length,
      },
    };
  }

  return {
    text: `The ${event.title.toLowerCase()} is on ${event.startDate}.`,
    data: {
      eventId: event.id,
      date: event.startDate,
      title: event.title,
    },
  };
}

function normalizeQuery(query: string | undefined): string | undefined {
  const normalizedQuery = query?.trim().toLowerCase();

  return normalizedQuery && normalizedQuery.length > 0
    ? normalizedQuery
    : undefined;
}

function formatEventList(
  events: { startDate: string; title: string }[],
): string {
  return events
    .map((event) => `${event.title} on ${event.startDate}`)
    .join(", ");
}
