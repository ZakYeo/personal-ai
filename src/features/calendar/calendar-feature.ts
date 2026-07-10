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

interface CalendarFeatureOptions {
  upcomingWindowDays?: number;
}

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
  options: CalendarFeatureOptions = {},
): FeaturePlugin {
  const upcomingWindowDays = options.upcomingWindowDays ?? 92;

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
  const events = await calendar.searchEvents(
    {
      ...(endDate === undefined ? {} : { endDate }),
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
      text: `Your upcoming calendar events are: ${formatEventList(events, now)}.`,
      data: {
        eventCount: events.length,
      },
    };
  }

  return {
    text: `${event.title} is on ${formatEventDate(event.startDate, now)}.`,
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
  now: Date,
): string {
  return events
    .map(
      (event) => `${event.title} on ${formatEventDate(event.startDate, now)}`,
    )
    .join(", ");
}

function formatEventDate(startDate: string, now: Date): string {
  const date = parseDateOnly(startDate);

  if (!date) {
    return startDate;
  }

  return `${formatHumanDate(date, now)}${formatRelativeTiming(date, now)}`;
}

function formatHumanDate(date: Date, now: Date): string {
  const sameYear = date.getUTCFullYear() === now.getUTCFullYear();
  const month = date.toLocaleString("en-US", {
    month: "long",
    timeZone: "UTC",
  });
  const day = date.getUTCDate();

  return sameYear
    ? `${month} ${day}`
    : `${month} ${day}, ${date.getUTCFullYear()}`;
}

function formatRelativeTiming(date: Date, now: Date): string {
  const days = differenceInUtcDays(date, now);

  if (days < 0) {
    return "";
  }

  if (days === 0) {
    return ", today";
  }

  if (days === 1) {
    return ", tomorrow";
  }

  if (days < 7) {
    return `, in ${days} days`;
  }

  if (days === 7) {
    return ", in a week";
  }

  if (days <= 10) {
    return ", in just over a week";
  }

  if (days <= 17) {
    return ", in about two weeks";
  }

  if (days <= 24) {
    return ", in about three weeks";
  }

  const months = Math.max(1, Math.round(days / 30));

  return months === 1
    ? ", in about a month"
    : `, in about ${formatSmallNumber(months)} months`;
}

function formatSmallNumber(value: number): string {
  const words = [
    "zero",
    "one",
    "two",
    "three",
    "four",
    "five",
    "six",
    "seven",
    "eight",
    "nine",
    "ten",
    "eleven",
    "twelve",
  ];

  return words[value] ?? String(value);
}

function differenceInUtcDays(date: Date, now: Date): number {
  const dateMidnight = Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
  );
  const nowMidnight = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
  );

  return Math.round((dateMidnight - nowMidnight) / 86_400_000);
}

function addUtcDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);

  return next;
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function parseDateOnly(value: string): Date | undefined {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);

  if (!match) {
    return undefined;
  }

  const [, year, month, day] = match;

  return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
}
