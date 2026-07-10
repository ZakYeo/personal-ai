import type {
  CalendarEvent,
  CalendarSearchCriteria,
  CalendarSearchOptions,
  CalendarSearchPort,
  GoogleCalendarConfig,
} from "../../ports/calendar.js";
import { fetchGoogleCalendarEvents } from "./google-calendar-client.js";
import { GoogleCalendarError } from "./google-calendar-error.js";
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
  const accessToken = options.env[options.config.accessTokenEnv];

  if (accessToken) {
    return accessToken;
  }

  const clientId = requireEnv(options, "clientIdEnv", "client ID");
  const clientSecret = requireEnv(options, "clientSecretEnv", "client secret");
  const refreshToken = requireEnv(options, "refreshTokenEnv", "refresh token");

  return fetchGoogleCalendarAccessToken({
    clientId,
    clientSecret,
    config: options.config,
    fetch: options.fetch,
    refreshToken,
  });
}

function requireEnv(
  options: GoogleCalendarAdapterOptions,
  configKey: "clientIdEnv" | "clientSecretEnv" | "refreshTokenEnv",
  label: string,
): string {
  const envName = options.config[configKey];
  const value = options.env[envName];

  if (!value) {
    throw new GoogleCalendarError(
      `Google Calendar ${label} environment variable ${envName} is not set.`,
    );
  }

  return value;
}
