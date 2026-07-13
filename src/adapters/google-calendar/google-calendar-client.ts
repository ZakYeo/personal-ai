import type { CalendarSearchCriteria } from "../../ports/calendar.js";
import { fetchProviderJson, trimTrailingSlash } from "../http-json-client.js";
import type { GoogleCalendarConfig } from "./google-calendar-config.js";
import { GoogleCalendarError } from "./google-calendar-error.js";

interface FetchGoogleCalendarEventsOptions {
  accessToken: string;
  config: GoogleCalendarConfig;
  criteria: CalendarSearchCriteria;
  fetch: typeof fetch;
  now: Date;
}

export async function fetchGoogleCalendarEvents(
  options: FetchGoogleCalendarEventsOptions,
): Promise<unknown> {
  return fetchProviderJson({
    createError: ({ cause, message, responseBody, status }) =>
      new GoogleCalendarError(message, status, responseBody, { cause }),
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

function createEventsUrl({
  config,
  criteria,
  now,
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
  url.searchParams.set("timeMin", formatTimeMin(criteria.startDate, now));

  if (criteria.endDate) {
    url.searchParams.set("timeMax", formatEndOfDay(criteria.endDate));
  }

  url.searchParams.set("maxResults", String(config.maxResults));

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
