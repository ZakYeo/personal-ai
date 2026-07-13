import type {
  CalendarEvent,
  CalendarSearchCriteria,
  CalendarSearchOptions,
  CalendarSearchPort,
} from "../../ports/calendar.js";
import type { GoogleCalendarConfig } from "./google-calendar-config.js";
import { fetchGoogleCalendarEvents } from "./google-calendar-client.js";
import { resolveGoogleCalendarCredentials } from "./google-calendar-credentials.js";
import { fetchGoogleCalendarAccessToken } from "./google-calendar-token.js";
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
    searchEvents: (criteria, searchOptions) =>
      searchEvents(criteria, searchOptions, options),
  };
}

async function searchEvents(
  criteria: CalendarSearchCriteria,
  searchOptions: CalendarSearchOptions,
  options: GoogleCalendarAdapterOptions,
): Promise<CalendarEvent[]> {
  const accessToken = await resolveAccessToken(options);

  return parseGoogleCalendarEvents(
    await fetchGoogleCalendarEvents({
      accessToken,
      config: options.config,
      criteria,
      fetch: options.fetch,
      now: searchOptions.now,
    }),
  );
}

async function resolveAccessToken(
  options: GoogleCalendarAdapterOptions,
): Promise<string> {
  const credentials = resolveGoogleCalendarCredentials(options);

  if (credentials.kind === "access-token") {
    return credentials.accessToken;
  }

  return fetchGoogleCalendarAccessToken({
    clientId: credentials.clientId,
    clientSecret: credentials.clientSecret,
    config: options.config,
    fetch: options.fetch,
    refreshToken: credentials.refreshToken,
  });
}
