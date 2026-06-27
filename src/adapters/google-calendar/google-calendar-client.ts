import type { GoogleCalendarConfig } from "../../ports/calendar.js";
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
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    options.config.timeoutMs,
  );

  try {
    const response = await options.fetch(createEventsUrl(options), {
      headers: {
        authorization: `Bearer ${options.accessToken}`,
      },
      method: "GET",
      signal: controller.signal,
    });
    const responseBody = await response.text();

    if (!response.ok) {
      throw new GoogleCalendarError(
        `Google Calendar events request failed with status ${response.status}.`,
        response.status,
        responseBody,
      );
    }

    try {
      return JSON.parse(responseBody) as unknown;
    } catch (error) {
      throw new GoogleCalendarError(
        "Google Calendar events response body was not valid JSON.",
        response.status,
        responseBody,
        { cause: error },
      );
    }
  } catch (error) {
    if (isAbortError(error)) {
      throw new GoogleCalendarError(
        `Google Calendar events request timed out after ${options.config.timeoutMs}ms.`,
        undefined,
        undefined,
        { cause: error },
      );
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
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

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/u, "");
}
