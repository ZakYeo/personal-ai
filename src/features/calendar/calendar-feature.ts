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
import type {
  CalendarEventGroup,
  CalendarEventGrouperPort,
  CalendarEventGrouping,
  CalendarEventGroupingInput,
} from "../../ports/calendar-event-grouper.js";
import {
  defineDeterministicFeatureRules,
  type DeterministicFeatureRule,
} from "../../application/deterministic-feature-rules.js";
import { defineCapability, defineFeature } from "../../application/feature.js";
import { sanitizeCalendarEventTitle } from "../../application/calendar-presentation-policy.js";
import { parseSpokenOrdinal } from "../../application/spoken-ordinal.js";

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
  eventGrouper?: CalendarEventGrouperPort;
  upcomingWindowDays?: number;
}

const calendarDeterministicIntentRules = [
  {
    capability: "calendar.follow_up",
    match: (text) => {
      const ordinal = parseSpokenOrdinal(text);
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
  const upcomingWindowDays = options.upcomingWindowDays ?? 14;

  return defineDeterministicFeatureRules(
    defineFeature({
      id: "calendar",
      displayName: "Calendar",
      spokenSummary: "check your calendar",
      capabilities: {
        "calendar.follow_up": defineCapability({
          description:
            "Answer a read-only question about an opaque event reference from the most recent calendar results.",
          risk: "low",
          summary: "Answer a follow-up about a recent calendar result.",
          spokenSummary: "ask about recent calendar results",
          toolChain: "read",
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
          toolChain: "read",
          parameters: calendarSearchEventsParameters,
          execute: async (request, context) =>
            searchEvents(calendar, request.args, context, {
              ...(options.eventGrouper
                ? { eventGrouper: options.eventGrouper }
                : {}),
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
  context: FeatureExecutionContext,
  options: CalendarFeatureOptions & { upcomingWindowDays: number },
) {
  const now = context.clock.now();
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
  )
    .slice(0, 10)
    .map(withSafeCalendarTitle);
  const event = events[0];

  if (!event) {
    if (query === undefined) {
      return {
        resultReferences: createResultReferences([]),
        text: "I could not find any upcoming calendar events.",
        toolObservationData: { eventCount: 0 },
      };
    }

    return {
      resultReferences: createResultReferences([]),
      text: `I could not find a calendar event matching "${query}".`,
      toolObservationData: { eventCount: 0 },
    };
  }

  if (query === undefined) {
    return presentUpcomingEvents(events, options.eventGrouper, context);
  }

  const eventFacts = {
    date: event.startDate,
    ...(event.startAt ? { startAt: event.startAt } : {}),
    time: event.startTime ?? "all day",
    title: event.title,
  };
  return {
    text: `${event.title} is ${formatEventStart(event)}.`,
    data: eventFacts,
    resultReferences: createResultReferences([event]),
    toolObservationData: eventFacts,
  };
}

async function presentUpcomingEvents(
  events: CalendarEvent[],
  eventGrouper: CalendarEventGrouperPort | undefined,
  context: FeatureExecutionContext,
) {
  const baseResult = {
    data: createUpcomingEventFacts(events),
    resultReferences: createResultReferences(events),
    toolObservationData: { eventCount: events.length },
  };
  if (!eventGrouper) {
    return { ...baseResult, text: formatUngroupedEventList(events) };
  }

  const input = createGroupingInput(events);
  if (input.events.length < 2) {
    return { ...baseResult, text: formatUngroupedEventList(events) };
  }
  try {
    const grouping = await eventGrouper.group(
      input,
      context.signal ? { signal: context.signal } : {},
    );
    if (grouping.groups.length === 0) {
      return { ...baseResult, text: formatUngroupedEventList(events) };
    }
    return {
      ...baseResult,
      data: {
        ...baseResult.data,
        ...createGroupingFacts(events, grouping),
      },
      text: formatGroupedEventList(events, grouping),
    };
  } catch (cause) {
    return {
      ...baseResult,
      diagnostics: [{ cause, message: "Calendar event grouping failed." }],
      text: formatUngroupedEventList(events),
    };
  }
}

async function answerCalendarFollowUp(
  calendar: CalendarSearchPort,
  args: CalendarFollowUpArgs,
  context: FeatureExecutionContext,
) {
  const selected = context.selectResultReference?.({
    expectedKind: "calendar_event",
    ...(args.detail === "next" ? { next: true } : {}),
    ...(args.ordinal === undefined ? {} : { ordinal: args.ordinal }),
    ordinalParsing: "enabled",
    rawText: context.trustedInputText ?? "",
    ...(args.reference === undefined ? {} : { reference: args.reference }),
  });

  if (
    !selected ||
    selected.publicReference.kind !== "calendar_event" ||
    selected.target?.kind !== "calendar_event"
  ) {
    return clarify(
      args.detail === "next"
        ? "I could not determine a later event from those recent results."
        : "I am not sure which recent calendar event you mean.",
    );
  }

  const rawEvent = await calendar.getEvent(selected.target.providerEventId, {
    now: context.clock.now(),
  });
  if (!rawEvent) {
    return clarify("I could not find that calendar event anymore.");
  }
  const event = withSafeCalendarTitle(rawEvent);

  if (args.detail === "location") {
    const eventFacts = {
      date: event.startDate,
      location: event.location ?? "not provided",
      title: event.title,
    };
    return {
      data: eventFacts,
      text: event.location
        ? `${event.title} is at ${event.location}.`
        : `${event.title} does not include a location.`,
      toolObservationData: eventFacts,
    };
  }

  const eventFacts = {
    date: event.startDate,
    ...(event.startAt ? { startAt: event.startAt } : {}),
    time: event.startTime ?? "all day",
    title: event.title,
  };
  return {
    data: eventFacts,
    text: `${event.title} is ${formatEventStart(event)}.`,
    toolObservationData: eventFacts,
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
        ...(event.startAt ? { startAt: event.startAt } : {}),
        time: event.startTime ?? "all day",
        title: event.title,
      },
      target: { kind: "calendar_event" as const, providerEventId: event.id },
    })),
    kind: "calendar_events" as const,
  };
}

function createUpcomingEventFacts(
  events: readonly CalendarEvent[],
): Record<string, string | number> {
  const facts: Record<string, string | number> = {
    eventCount: events.length,
  };

  events.forEach((event, index) => {
    facts[`event${index}Date`] = event.startDate;
    if (event.startAt) facts[`event${index}StartAt`] = event.startAt;
    facts[`event${index}Time`] = event.startTime ?? "all day";
    facts[`event${index}Title`] = event.title;
  });

  return facts;
}

function createGroupingInput(
  events: readonly CalendarEvent[],
): CalendarEventGroupingInput {
  const dateCounts = new Map<string, number>();
  for (const event of events) {
    dateCounts.set(event.startDate, (dateCounts.get(event.startDate) ?? 0) + 1);
  }
  return {
    events: events.flatMap((event, index) =>
      dateCounts.get(event.startDate) === 1
        ? []
        : [
            {
              index,
              startDate: event.startDate,
              ...(event.startTime ? { startTime: event.startTime } : {}),
              title: event.title,
            },
          ],
    ),
  };
}

function createGroupingFacts(
  events: readonly CalendarEvent[],
  grouping: CalendarEventGrouping,
): Record<string, string | number> {
  const facts: Record<string, string | number> = {};
  grouping.groups.forEach((group, groupIndex) => {
    facts[`group${groupIndex}Date`] = events[group.eventIndexes[0]!]!.startDate;
    facts[`group${groupIndex}Theme`] = group.theme;
    group.milestones.forEach((milestone, milestoneIndex) => {
      const event = events[milestone.eventIndex]!;
      facts[`group${groupIndex}Milestone${milestoneIndex}Label`] =
        milestone.label;
      facts[`group${groupIndex}Milestone${milestoneIndex}Time`] =
        event.startTime ?? "all day";
    });
  });
  return facts;
}

function normalizeQuery(query: string | undefined): string | undefined {
  const normalizedQuery = query?.trim().toLowerCase();

  return normalizedQuery && normalizedQuery.length > 0
    ? normalizedQuery
    : undefined;
}

function withSafeCalendarTitle(event: CalendarEvent): CalendarEvent {
  return { ...event, title: sanitizeCalendarEventTitle(event.title) };
}

function formatEventList(events: CalendarEvent[]): string {
  return events
    .map((event) => `${event.title} ${formatEventStart(event)}`)
    .join(", ");
}

function formatUngroupedEventList(events: CalendarEvent[]): string {
  const eventLabel = events.length === 1 ? "event" : "events";
  return `You have ${events.length} upcoming calendar ${eventLabel}: ${formatEventList(events)}.`;
}

function formatGroupedEventList(
  events: CalendarEvent[],
  grouping: CalendarEventGrouping,
): string {
  const groupByFirstIndex = new Map(
    grouping.groups.map((group) => [group.eventIndexes[0]!, group]),
  );
  const groupedIndexes = new Set(
    grouping.groups.flatMap(({ eventIndexes }) => eventIndexes),
  );
  const items = events.flatMap((event, index) => {
    const group = groupByFirstIndex.get(index);
    if (group) return [formatEventGroup(events, group)];
    return groupedIndexes.has(index)
      ? []
      : [`${event.title} ${formatEventStart(event)}`];
  });
  return `Your upcoming calendar includes ${formatNaturalList(items)}.`;
}

function formatEventGroup(
  events: readonly CalendarEvent[],
  group: CalendarEventGroup,
): string {
  const date = events[group.eventIndexes[0]!]!.startDate;
  const milestones = group.milestones.map((milestone) => {
    const event = events[milestone.eventIndex]!;
    return event.startTime
      ? `${milestone.label} at ${event.startTime}`
      : `${milestone.label}, all day`;
  });
  return `${group.theme} on ${date}: ${formatNaturalList(milestones)}`;
}

function formatNaturalList(values: readonly string[]): string {
  if (values.length < 2) return values[0] ?? "";
  if (values.length === 2) return `${values[0]} and ${values[1]}`;
  return `${values.slice(0, -1).join(", ")}, and ${values.at(-1)}`;
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
