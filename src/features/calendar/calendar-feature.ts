import type {
  FeatureArgsFromParameters,
  FeatureCapabilityParameters,
  FeaturePlugin,
  FeatureResult,
} from "../../ports/feature.js";
import { defineCapability, defineFeature } from "../../ports/feature.js";

interface CalendarEventFixture {
  id: string;
  title: string;
  date: string;
}

const calendarEvents: CalendarEventFixture[] = [
  {
    id: "wedding-2026",
    title: "Upcoming wedding",
    date: "2026-09-12",
  },
];

const calendarSearchEventsParameters = {
  query: { type: "string", required: true },
} as const satisfies FeatureCapabilityParameters;

type CalendarSearchEventsArgs = FeatureArgsFromParameters<
  typeof calendarSearchEventsParameters
>;

export function createCalendarFeature(): FeaturePlugin {
  return defineFeature({
    id: "calendar",
    displayName: "Mock Calendar",
    capabilities: {
      "calendar.search_events": defineCapability({
        risk: "low",
        parameters: calendarSearchEventsParameters,
        execute: (request) => searchEvents(request.args),
      }),
    },
  });
}

function searchEvents(args: CalendarSearchEventsArgs): FeatureResult {
  const query = args.query.toLowerCase();
  const event = calendarEvents.find((candidate) =>
    candidate.title.toLowerCase().includes(query),
  );

  if (!event) {
    return {
      text: `I could not find a calendar event matching "${query}".`,
    };
  }

  return {
    text: `The upcoming wedding is on ${event.date}.`,
    data: {
      eventId: event.id,
      date: event.date,
      title: event.title,
    },
  };
}
