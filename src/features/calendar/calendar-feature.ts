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
  query: { type: "string", required: true },
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
            "Search configured calendar events for a natural-language query and return the best matching event date.",
          risk: "low",
          summary: "Search configured calendar events.",
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
  const query = args.query.toLowerCase();
  const events = await calendar.searchEvents(query, { now });
  const event = events[0];

  if (!event) {
    return {
      text: `I could not find a calendar event matching "${query}".`,
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
