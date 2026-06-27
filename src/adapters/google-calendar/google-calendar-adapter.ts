import type {
  CalendarEvent,
  CalendarSearchOptions,
  CalendarSearchPort,
  GoogleCalendarConfig,
} from "../../ports/calendar.js";
import { fetchGoogleCalendarEvents } from "./google-calendar-client.js";
import { GoogleCalendarError } from "./google-calendar-error.js";
import { parseGoogleCalendarEvents } from "./google-calendar-events-parser.js";

export { GoogleCalendarError } from "./google-calendar-error.js";

interface GoogleCalendarAdapterOptions {
  config: GoogleCalendarConfig;
  env: Record<string, string | undefined>;
  fetch: typeof fetch;
}

export function createGoogleCalendarAdapter(
  options: GoogleCalendarAdapterOptions,
): CalendarSearchPort {
  return {
    searchEvents: (query, searchOptions) =>
      searchEvents(query, searchOptions, options),
  };
}

async function searchEvents(
  query: string,
  searchOptions: CalendarSearchOptions,
  options: GoogleCalendarAdapterOptions,
): Promise<CalendarEvent[]> {
  const accessToken = options.env[options.config.accessTokenEnv];

  if (!accessToken) {
    throw new GoogleCalendarError(
      `Google Calendar access token environment variable ${options.config.accessTokenEnv} is not set.`,
    );
  }

  return parseGoogleCalendarEvents(
    await fetchGoogleCalendarEvents({
      accessToken,
      config: options.config,
      fetch: options.fetch,
      now: searchOptions.now,
      query,
    }),
  );
}
