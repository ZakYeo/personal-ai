import type { AssistantCommand } from "../../ports/assistant.js";
import type {
  FeatureArguments,
  FeaturePlugin,
  FeatureResult,
} from "../../ports/feature.js";

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

export function createCalendarFeature(): FeaturePlugin {
  return {
    id: "calendar",
    displayName: "Mock Calendar",
    capabilities: [
      {
        name: "calendar.search_events",
        risk: "low",
        parameters: {
          query: { type: "string", required: true },
        },
      },
    ],
    execute: (_command: AssistantCommand, args: FeatureArguments) =>
      Promise.resolve(searchEvents(args)),
  };
}

function searchEvents(args: FeatureArguments): FeatureResult {
  const query = String(args.query).toLowerCase();
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
