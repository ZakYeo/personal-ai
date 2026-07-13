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

  return value.items.map(parseEvent);
}

function parseEvent(value: unknown): CalendarEvent {
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

  return {
    id: value.id,
    startDate: parseStartDate(value.start),
    title: value.summary,
  };
}

function parseStartDate(value: unknown): string {
  if (!isRecord(value)) {
    throw new GoogleCalendarError(
      "Google Calendar event start must be an object.",
    );
  }

  if (typeof value.date === "string" && value.date.length > 0) {
    return value.date;
  }

  if (typeof value.dateTime === "string" && value.dateTime.length >= 10) {
    return value.dateTime.slice(0, 10);
  }

  throw new GoogleCalendarError(
    "Google Calendar event start date must be a non-empty string.",
  );
}
