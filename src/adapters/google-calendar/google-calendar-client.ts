import type { CalendarSearchCriteria } from "../../ports/calendar.js";
import { calendarLocalDayWindow } from "../../application/calendar-local-day.js";
import { fetchProviderJson, trimTrailingSlash } from "../http-json-client.js";
import type { GoogleCalendarConfig } from "./google-calendar-config.js";
import { GoogleCalendarError } from "./google-calendar-error.js";

export interface FetchGoogleCalendarEventsOptions {
  accessToken: string;
  config: GoogleCalendarConfig;
  criteria: CalendarSearchCriteria;
  fetch: typeof fetch;
  now: Date;
  pageToken?: string;
}

export async function fetchGoogleCalendarEvents(
  options: FetchGoogleCalendarEventsOptions,
): Promise<unknown> {
  return fetchProviderJson({
    createError: ({ cause, message, requestId, responseBody, status }) =>
      new GoogleCalendarError(message, status, responseBody, {
        cause,
        ...(requestId ? { requestId } : {}),
      }),
    fetch: options.fetch,
    invalidJsonMessage:
      "Google Calendar events response body was not valid JSON.",
    nonOkMessage: (status) =>
      `Google Calendar events request failed with status ${status}.`,
    request: {
      headers: {
        authorization: `Bearer ${options.accessToken}`,
      },
      method: "GET",
    },
    timeoutMessage: `Google Calendar events request timed out after ${options.config.timeoutMs}ms.`,
    timeoutMs: options.config.timeoutMs,
    url: createEventsUrl(options),
  });
}

export async function fetchGoogleCalendarEvent(options: {
  accessToken: string;
  config: GoogleCalendarConfig;
  fetch: typeof fetch;
  id: string;
}): Promise<unknown> {
  return fetchProviderJson({
    createError: ({ cause, message, requestId, responseBody, status }) =>
      new GoogleCalendarError(message, status, responseBody, {
        cause,
        ...(requestId ? { requestId } : {}),
      }),
    fetch: options.fetch,
    invalidJsonMessage:
      "Google Calendar event response body was not valid JSON.",
    nonOkMessage: (status) =>
      `Google Calendar event request failed with status ${status}.`,
    request: {
      headers: { authorization: `Bearer ${options.accessToken}` },
      method: "GET",
    },
    timeoutMessage: `Google Calendar event request timed out after ${options.config.timeoutMs}ms.`,
    timeoutMs: options.config.timeoutMs,
    url: `${trimTrailingSlash(options.config.baseUrl)}/calendars/${encodeURIComponent(
      options.config.calendarId,
    )}/events/${encodeURIComponent(options.id)}`,
  });
}

function createEventsUrl({
  config,
  criteria,
  now,
  pageToken,
}: FetchGoogleCalendarEventsOptions): string {
  const url = new URL(
    `${trimTrailingSlash(config.baseUrl)}/calendars/${encodeURIComponent(
      config.calendarId,
    )}/events`,
  );

  const query = criteria.query?.trim();

  if (query) {
    url.searchParams.set("q", query);
  }

  url.searchParams.set("singleEvents", "true");
  url.searchParams.set("orderBy", "startTime");
  const localDay = calendarLocalDayWindow(criteria);
  // Date-only events use the calendar's timezone, which can differ from the
  // assistant's. Discover adjacent dates, then paginate/filter before capping.
  const dateStart = localDay
    ? Date.parse(`${localDay.date}T00:00:00Z`)
    : undefined;
  url.searchParams.set(
    "timeMin",
    dateStart === undefined
      ? formatTimeMin(criteria.startDate, now)
      : new Date(dateStart - 86_400_000).toISOString(),
  );

  if (localDay || criteria.endDate) {
    url.searchParams.set(
      "timeMax",
      dateStart === undefined
        ? formatEndOfDay(criteria.endDate!)
        : new Date(dateStart + 2 * 86_400_000).toISOString(),
    );
  }

  url.searchParams.set("maxResults", String(config.maxResults));
  if (pageToken) url.searchParams.set("pageToken", pageToken);

  return url.toString();
}

function formatTimeMin(startDate: string | undefined, now: Date): string {
  return startDate ? formatStartOfDay(startDate) : now.toISOString();
}

function formatStartOfDay(date: string): string {
  return `${date}T00:00:00.000Z`;
}

function formatEndOfDay(date: string): string {
  return `${date}T23:59:59.999Z`;
}
