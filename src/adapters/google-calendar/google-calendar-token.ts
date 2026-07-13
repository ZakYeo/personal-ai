import { fetchProviderJson } from "../http-json-client.js";
import type { GoogleCalendarConfig } from "./google-calendar-config.js";
import { GoogleCalendarError } from "./google-calendar-error.js";
import { isRecord } from "../parsing.js";

interface FetchGoogleCalendarAccessTokenOptions {
  clientId: string;
  clientSecret: string;
  config: GoogleCalendarConfig;
  fetch: typeof fetch;
  refreshToken: string;
}

export async function fetchGoogleCalendarAccessToken(
  options: FetchGoogleCalendarAccessTokenOptions,
): Promise<string> {
  return parseGoogleCalendarTokenResponse(
    await fetchProviderJson({
      createError: ({ cause, message, responseBody, status }) =>
        new GoogleCalendarError(message, status, responseBody, { cause }),
      fetch: options.fetch,
      invalidJsonMessage:
        "Google Calendar token response body was not valid JSON.",
      nonOkMessage: (status) =>
        `Google Calendar token request failed with status ${status}.`,
      request: {
        body: new URLSearchParams({
          client_id: options.clientId,
          client_secret: options.clientSecret,
          grant_type: "refresh_token",
          refresh_token: options.refreshToken,
        }),
        headers: {
          "content-type": "application/x-www-form-urlencoded",
        },
        method: "POST",
      },
      timeoutMessage: `Google Calendar token request timed out after ${options.config.timeoutMs}ms.`,
      timeoutMs: options.config.timeoutMs,
      url: options.config.tokenUrl,
    }),
  );
}

function parseGoogleCalendarTokenResponse(value: unknown): string {
  if (!isRecord(value)) {
    throw new GoogleCalendarError(
      "Google Calendar token response body must be an object.",
    );
  }

  if (
    typeof value.access_token !== "string" ||
    value.access_token.length === 0
  ) {
    throw new GoogleCalendarError(
      "Google Calendar token response access_token must be a non-empty string.",
    );
  }

  return value.access_token;
}
