import type {
  CalendarEvent,
  CalendarSearchCriteria,
} from "../ports/calendar.js";
import { resolveLocalDateTime } from "./local-date-time.js";
import {
  parseCanonicalIsoDate,
  resolveTimeZoneIdentifier,
} from "./temporal-policy.js";

export function calendarLocalDayWindow(criteria: CalendarSearchCriteria) {
  const day = criteria.localDay;
  if (!day) return;
  const dateText = day.date;
  const date = parseCanonicalIsoDate(dateText);
  if (
    !date ||
    !resolveTimeZoneIdentifier(day.timeZone) ||
    criteria.startDate ||
    criteria.endDate
  )
    throw new Error("Calendar local-day criteria are invalid or conflicting.");
  const next = new Date(Date.UTC(date.year, date.month - 1, date.day + 1));
  const midnight = { hour: 0, minute: 0, second: 0, millisecond: 0 };
  const start = resolveLocalDateTime({ ...date, ...midnight }, day.timeZone);
  const end = resolveLocalDateTime(
    {
      year: next.getUTCFullYear(),
      month: next.getUTCMonth() + 1,
      day: next.getUTCDate(),
      ...midnight,
    },
    day.timeZone,
  );
  return Object.freeze({
    date: dateText,
    startAt: start.toISOString(),
    endBefore: end.toISOString(),
    matches: (event: CalendarEvent) =>
      event.startAt
        ? Date.parse(event.startAt) >= start.getTime() &&
          Date.parse(event.startAt) < end.getTime()
        : event.startDate === dateText,
  });
}
