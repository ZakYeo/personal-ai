import { calendarLocalDayWindow } from "../../application/calendar-local-day.js";
import { containsControlCharacters } from "../../application/text-safety.js";
import type { CalendarEvent } from "../../ports/calendar.js";
import { isRecord } from "../parsing.js";
import {
  fetchGoogleCalendarEvents,
  type FetchGoogleCalendarEventsOptions,
} from "./google-calendar-client.js";
import { parseGoogleCalendarEvents } from "./google-calendar-events-parser.js";
import { GoogleCalendarError } from "./google-calendar-error.js";

/** Google bounds event ends below and starts above; filter starts before capping. */
export async function fetchGoogleCalendarLocalDayEvents(
  options: FetchGoogleCalendarEventsOptions,
): Promise<CalendarEvent[]> {
  const criteria = {
    ...options.criteria,
    ...(options.criteria.localDay
      ? { localDay: { ...options.criteria.localDay } }
      : {}),
  };
  const window = calendarLocalDayWindow(criteria);
  if (!window)
    throw new GoogleCalendarError("Calendar local day was not specified.");
  const events: CalendarEvent[] = [];
  const config = {
    ...options.config,
    maxResults: Math.min(options.config.maxResults, 50),
  };
  const tokens = new Set<string>();
  const ids = new Set<string>();
  let pageToken: string | undefined;
  for (let page = 0; page < 5; page += 1) {
    const raw = await fetchGoogleCalendarEvents({
      ...options,
      criteria,
      config,
      ...(pageToken ? { pageToken } : {}),
    });
    const result = parsePage(raw, config.maxResults);
    for (const event of result.events) {
      if (ids.has(event.id))
        throw new GoogleCalendarError("Calendar pagination repeated an event.");
      ids.add(event.id);
      if (window.matches(event)) events.push(event);
    }
    if (events.length >= config.maxResults || !result.nextPageToken)
      return events.slice(0, config.maxResults);
    if (tokens.has(result.nextPageToken))
      throw new GoogleCalendarError("Calendar pagination repeated a token.");
    tokens.add(result.nextPageToken);
    pageToken = result.nextPageToken;
  }
  throw new GoogleCalendarError(
    "Calendar local-day search exceeded its five-page budget; results are incomplete.",
  );
}

function parsePage(value: unknown, maximum: number) {
  if (
    !isRecord(value) ||
    (value.items !== undefined &&
      (!Array.isArray(value.items) || value.items.length > maximum))
  )
    throw new GoogleCalendarError(
      "Calendar event page is malformed or exceeds its bound.",
    );
  const token = value.nextPageToken;
  if (
    token !== undefined &&
    (typeof token !== "string" ||
      !token.length ||
      token.length > 2048 ||
      containsControlCharacters(token))
  )
    throw new GoogleCalendarError("Calendar continuation token is malformed.");
  return {
    events: parseGoogleCalendarEvents({ items: value.items ?? [] }),
    ...(typeof token === "string" ? { nextPageToken: token } : {}),
  };
}
