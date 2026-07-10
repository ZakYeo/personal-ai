import type { LoadedRuntimeConfig } from "./config/config.js";

export function validateGoogleCalendarStartup(
  config: LoadedRuntimeConfig,
  env: Record<string, string | undefined>,
): void {
  const calendar = config.features.calendar;

  if (!calendar?.enabled || calendar.adapter !== "google" || !calendar.google) {
    return;
  }

  if (env[calendar.google.accessTokenEnv]) {
    return;
  }

  const missingRefreshCredential = [
    calendar.google.clientIdEnv,
    calendar.google.clientSecretEnv,
    calendar.google.refreshTokenEnv,
  ].find((envName) => !env[envName]);

  if (!missingRefreshCredential) {
    return;
  }

  throw new Error(
    `Google Calendar is selected but ${missingRefreshCredential} is not set. Run "npm run setup:google-calendar" first, add the printed GOOGLE_CALENDAR_REFRESH_TOKEN line to .env, then start the service again.`,
  );
}
