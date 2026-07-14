import type { CalendarEvent } from "../../ports/calendar.js";
import { GoogleCalendarError } from "./google-calendar-error.js";
import { isRecord } from "../parsing.js";

export function parseGoogleCalendarEvents(value: unknown): CalendarEvent[] {
  if (!isRecord(value)) {
    throw new GoogleCalendarError(
      "Google Calendar events response must be an object.",
    );
  }

  if (!Array.isArray(value.items)) {
    throw new GoogleCalendarError(
      "Google Calendar events response items must be an array.",
    );
  }

  return value.items.map(parseGoogleCalendarEvent);
}

export function parseGoogleCalendarEvent(value: unknown): CalendarEvent {
  if (!isRecord(value)) {
    throw new GoogleCalendarError(
      "Google Calendar event response item must be an object.",
    );
  }

  if (typeof value.id !== "string" || value.id.length === 0) {
    throw new GoogleCalendarError(
      "Google Calendar event id must be a non-empty string.",
    );
  }

  if (typeof value.summary !== "string" || value.summary.length === 0) {
    throw new GoogleCalendarError(
      "Google Calendar event summary must be a non-empty string.",
    );
  }

  const start = parseEventStart(value.start);

  return {
    id: value.id,
    ...(typeof value.location === "string" && value.location.length > 0
      ? { location: value.location }
      : {}),
    ...start,
    title: value.summary,
  };
}

function parseEventStart(
  value: unknown,
): Pick<CalendarEvent, "startDate" | "startTime"> {
  if (!isRecord(value)) {
    throw new GoogleCalendarError(
      "Google Calendar event start must be an object.",
    );
  }

  if (typeof value.date === "string") {
    if (!isValidIsoDate(value.date)) {
      throw new GoogleCalendarError(
        "Google Calendar event start date must be a valid ISO date.",
      );
    }

    return { startDate: value.date };
  }

  if (typeof value.dateTime === "string") {
    const match = rfc3339DateTimePattern.exec(value.dateTime);
    const date = match?.groups?.date;
    const hour = match?.groups?.hour;
    const minute = match?.groups?.minute;

    if (!date || !hour || !minute || !isValidIsoDate(date)) {
      throw new GoogleCalendarError(
        "Google Calendar event start dateTime must be a valid RFC3339 string.",
      );
    }

    return {
      startDate: date,
      startTime: `${hour}:${minute}`,
    };
  }

  throw new GoogleCalendarError(
    "Google Calendar event start date must be a non-empty string.",
  );
}

function isValidIsoDate(value: string): boolean {
  const match = isoDatePattern.exec(value);

  if (!match?.groups) {
    return false;
  }

  const year = Number(match.groups.year);
  const month = Number(match.groups.month);
  const day = Number(match.groups.day);
  const parsed = new Date(Date.UTC(year, month - 1, day));

  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
}

const isoDatePattern = /^(?<year>\d{4})-(?<month>\d{2})-(?<day>\d{2})$/u;
const rfc3339DateTimePattern =
  /^(?<date>\d{4}-\d{2}-\d{2})T(?<hour>[01]\d|2[0-3]):(?<minute>[0-5]\d):[0-5]\d(?:\.\d+)?(?:Z|[+-](?:(?:0\d|1[0-3]):[0-5]\d|14:00))$/u;
