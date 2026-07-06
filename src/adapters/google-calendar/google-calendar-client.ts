import type { GoogleCalendarConfig } from "../../ports/calendar.js";
import { fetchProviderJson, trimTrailingSlash } from "../http-json-client.js";
import { GoogleCalendarError } from "./google-calendar-error.js";

interface FetchGoogleCalendarEventsOptions {
  accessToken: string;
  config: GoogleCalendarConfig;
  fetch: typeof fetch;
  now: Date;
  query: string;
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
  now,
  query,
}: FetchGoogleCalendarEventsOptions): string {
  const url = new URL(
    `${trimTrailingSlash(config.baseUrl)}/calendars/${encodeURIComponent(
      config.calendarId,
    )}/events`,
  );

  url.searchParams.set("q", query);
  url.searchParams.set("singleEvents", "true");
  url.searchParams.set("orderBy", "startTime");
  url.searchParams.set("timeMin", now.toISOString());
  url.searchParams.set("maxResults", String(config.maxResults));

  return url.toString();
}
