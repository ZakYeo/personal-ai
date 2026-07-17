import type {
  AssistantCommandParameters,
  AssistantContext,
  AssistantResponse,
  ConfirmationDeclaration,
} from "../../ports/assistant.js";
import type { AlarmStore } from "../../ports/alarm-store.js";
import type {
  FeatureExecutionContext,
  FeatureResult,
} from "../../ports/feature.js";
import { resolveLocalDateTime } from "../../ports/local-date-time.js";
import type { AlarmCalendarReminderArgs } from "./alarm-feature-contract.js";

interface CalendarReminderSnapshotFields {
  eventStartAt: string;
  eventTitle: string;
  label: string;
  minutesBefore: number;
  scheduledFor: string;
  snapshot: true;
  timeZone: string;
}

type CalendarReminderSnapshot = AssistantCommandParameters &
  CalendarReminderSnapshotFields;

export function requestCalendarReminderClarification(
  args: AlarmCalendarReminderArgs,
  context: AssistantContext,
): AssistantResponse | undefined {
  const selected = selectCalendarEvent(args, context);
  if (
    !selected ||
    selected.publicReference.kind !== "calendar_event" ||
    selected.publicReference.facts.startAt ||
    args.localTime
  ) {
    return undefined;
  }

  return {
    status: "ok",
    text: `What time should I use for the all-day ${selected.publicReference.facts.title} event?`,
  };
}

export function renderCalendarReminderConfirmation(
  args: AlarmCalendarReminderArgs,
  context: AssistantContext,
): ConfirmationDeclaration {
  const selected = selectCalendarEvent(args, context);
  if (!selected || selected.publicReference.kind !== "calendar_event") {
    throw new Error("The selected calendar event is no longer available.");
  }

  const { facts } = selected.publicReference;
  const timeZone = context.config.assistant.timeZone;
  const eventStart = facts.startAt
    ? parseInstant(facts.startAt)
    : resolveAllDayStart(facts.date, args.localTime, timeZone);
  const scheduledFor = new Date(
    eventStart.getTime() - args.minutesBefore * 60_000,
  );
  if (scheduledFor.getTime() <= context.clock.now().getTime()) {
    throw new Error("The calendar reminder time must be in the future.");
  }

  const label = args.label ?? `${facts.title} reminder`;
  const eventStartAt = eventStart.toISOString();
  return {
    facts: createCalendarReminderSnapshot({
      eventStartAt,
      eventTitle: facts.title,
      label,
      minutesBefore: args.minutesBefore,
      scheduledFor: scheduledFor.toISOString(),
      timeZone,
    }),
    text: `set the ${label} alarm for ${scheduledFor.toISOString()}, ${args.minutesBefore} minutes before ${facts.title}`,
  };
}

function selectCalendarEvent(
  args: AlarmCalendarReminderArgs,
  context: AssistantContext,
) {
  return context.selectResultReference?.({
    rawText: context.trustedInputText ?? "",
    reference: args.reference,
  });
}

export async function createCalendarReminder(
  _args: AlarmCalendarReminderArgs,
  context: FeatureExecutionContext,
  store: AlarmStore,
): Promise<FeatureResult> {
  const snapshot = parseCalendarReminderSnapshot(
    context.validatedConfirmationFacts,
  );

  const alarm = await store.add({
    label: snapshot.label,
    scheduledFor: snapshot.scheduledFor,
  });
  return {
    data: {
      calendarEventTitle: snapshot.eventTitle,
      eventStartAt: snapshot.eventStartAt,
      id: alarm.id,
      label: alarm.label,
      minutesBefore: snapshot.minutesBefore,
      scheduledFor: alarm.scheduledFor,
      snapshot: true,
      timeZone: snapshot.timeZone,
    },
    text: `Alarm set for ${alarm.scheduledFor} (${alarm.label}), using the confirmed ${snapshot.eventTitle} calendar snapshot.`,
  };
}

function createCalendarReminderSnapshot(
  input: Omit<CalendarReminderSnapshotFields, "snapshot">,
): CalendarReminderSnapshot {
  return { ...input, snapshot: true };
}

function parseCalendarReminderSnapshot(
  facts: FeatureExecutionContext["validatedConfirmationFacts"],
): CalendarReminderSnapshot {
  const eventStartAt = requireInstantFact(facts, "eventStartAt");
  const scheduledFor = requireInstantFact(facts, "scheduledFor");
  const eventTitle = requireStringFact(facts, "eventTitle");
  const label = requireStringFact(facts, "label");
  const timeZone = requireStringFact(facts, "timeZone");
  const minutesBefore = facts?.minutesBefore;
  if (
    typeof minutesBefore !== "number" ||
    !Number.isFinite(minutesBefore) ||
    minutesBefore <= 0 ||
    facts?.snapshot !== true
  ) {
    throw incompleteSnapshot();
  }
  return createCalendarReminderSnapshot({
    eventStartAt,
    eventTitle,
    label,
    minutesBefore,
    scheduledFor,
    timeZone,
  });
}

function resolveAllDayStart(
  date: string,
  localTime: string | undefined,
  timeZone: string,
): Date {
  const dateMatch = /^(?<year>\d{4})-(?<month>\d{2})-(?<day>\d{2})$/u.exec(
    date,
  );
  if (!dateMatch?.groups) throw new Error("Calendar event date is invalid.");
  if (!localTime) {
    throw new Error("An all-day calendar reminder requires a local time.");
  }
  const time = parseLocalTime(localTime);
  return resolveLocalDateTime(
    {
      day: Number(dateMatch.groups.day),
      hour: time.hour,
      millisecond: 0,
      minute: time.minute,
      month: Number(dateMatch.groups.month),
      second: 0,
      year: Number(dateMatch.groups.year),
    },
    timeZone,
  );
}

function parseLocalTime(value: string): { hour: number; minute: number } {
  const match =
    /^(?<hour>\d{1,2})(?::(?<minute>\d{2}))?\s*(?<period>am|pm)?$/iu.exec(
      value.trim(),
    );
  if (!match?.groups?.hour) throw new Error("Local reminder time is invalid.");
  let hour = Number(match.groups.hour);
  const minute = Number(match.groups.minute ?? "0");
  const period = match.groups.period?.toLowerCase();
  if (period) {
    if (hour < 1 || hour > 12)
      throw new Error("Local reminder time is invalid.");
    hour = (hour % 12) + (period === "pm" ? 12 : 0);
  }
  if (hour > 23 || minute > 59) {
    throw new Error("Local reminder time is invalid.");
  }
  return { hour, minute };
}

function parseInstant(value: string): Date {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) {
    throw new Error("Calendar event start time is invalid.");
  }
  return date;
}

function requireStringFact(
  facts: FeatureExecutionContext["validatedConfirmationFacts"],
  name: string,
): string {
  const value = facts?.[name];
  if (typeof value !== "string" || value.length === 0) {
    throw incompleteSnapshot();
  }
  return value;
}

function requireInstantFact(
  facts: FeatureExecutionContext["validatedConfirmationFacts"],
  name: string,
): string {
  const value = requireStringFact(facts, name);
  if (!Number.isFinite(new Date(value).getTime())) throw incompleteSnapshot();
  return value;
}

function incompleteSnapshot(): Error {
  return new Error("Calendar reminder confirmation facts are incomplete.");
}
