import type { GoogleCalendarConfig } from "../../ports/calendar.js";
import {
  isRecord,
  parseOptionalNonEmptyString,
  parseOptionalPositiveInteger,
} from "./config-parse-utils.js";

interface CalendarFeatureProviderConfig {
  google?: GoogleCalendarConfig;
}

export function parseCalendarFeatureConfig(
  featureConfig: Record<string, unknown>,
): CalendarFeatureProviderConfig {
  const google = featureConfig.google;

  if (google === undefined) {
    return {};
  }

  if (!isRecord(google)) {
    throw new Error('Config feature "calendar".google must be a JSON object.');
  }

  return {
    google: {
      accessTokenEnv: parseOptionalNonEmptyString(
        google.accessTokenEnv,
        'Config feature "calendar".google.accessTokenEnv must be a non-empty string.',
        "GOOGLE_CALENDAR_ACCESS_TOKEN",
      ),
      baseUrl: parseOptionalNonEmptyString(
        google.baseUrl,
        'Config feature "calendar".google.baseUrl must be a non-empty string.',
        "https://www.googleapis.com/calendar/v3",
      ),
      calendarId: parseOptionalNonEmptyString(
        google.calendarId,
        'Config feature "calendar".google.calendarId must be a non-empty string.',
        "primary",
      ),
      clientIdEnv: parseOptionalNonEmptyString(
        google.clientIdEnv,
        'Config feature "calendar".google.clientIdEnv must be a non-empty string.',
        "GOOGLE_CALENDAR_CLIENT_ID",
      ),
      clientSecretEnv: parseOptionalNonEmptyString(
        google.clientSecretEnv,
        'Config feature "calendar".google.clientSecretEnv must be a non-empty string.',
        "GOOGLE_CALENDAR_CLIENT_SECRET",
      ),
      maxResults: parseOptionalPositiveInteger(
        google.maxResults,
        'Config feature "calendar".google.maxResults must be a positive integer.',
        10,
      ),
      refreshTokenEnv: parseOptionalNonEmptyString(
        google.refreshTokenEnv,
        'Config feature "calendar".google.refreshTokenEnv must be a non-empty string.',
        "GOOGLE_CALENDAR_REFRESH_TOKEN",
      ),
      timeoutMs: parseOptionalPositiveInteger(
        google.timeoutMs,
        'Config feature "calendar".google.timeoutMs must be a positive integer.',
        30_000,
      ),
      tokenUrl: parseOptionalNonEmptyString(
        google.tokenUrl,
        'Config feature "calendar".google.tokenUrl must be a non-empty string.',
        "https://oauth2.googleapis.com/token",
      ),
    },
  };
}
