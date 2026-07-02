import type {
  DeterministicFeatureRule,
  FeatureArgsFromParameters,
  FeatureCapabilityParameters,
  FeaturePlugin,
} from "../../ports/feature.js";
import type { CalendarSearchPort } from "../../ports/calendar.js";
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
  return defineFeature({
    id: "calendar",
    displayName: "Calendar",
    capabilities: {
      "calendar.search_events": defineCapability({
        risk: "low",
        parameters: calendarSearchEventsParameters,
        deterministicRules: deterministicRulesFor("calendar.search_events"),
        execute: async (request, context) =>
          searchEvents(calendar, request.args, context.clock.now()),
      }),
    },
  });
}

function deterministicRulesFor(capability: string) {
  return calendarDeterministicIntentRules
    .filter((rule) => rule.capability === capability)
    .map((rule) => rule.match);
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
