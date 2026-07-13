import { createGoogleCalendarAdapter } from "../../adapters/google-calendar/google-calendar-adapter.js";
import { createMockCalendar } from "../../adapters/mock/mock-calendar.js";
import { createCalendarFeature } from "../../features/calendar/calendar-feature.js";
import {
  defineFeatureAdapterEntry,
  type FeatureRegistryEntry,
} from "../feature-adapter-registry.js";
import {
  parseCalendarFeatureConfig,
  parseCalendarGoogleAdapterConfig,
  type CalendarFeatureConfig,
  type CalendarGoogleAdapterConfig,
} from "./calendar-feature-adapter-config.js";

export function createCalendarFeatureRegistryEntry(): FeatureRegistryEntry {
  return {
    adapters: {
      google: defineFeatureAdapterEntry<CalendarGoogleAdapterConfig>({
        create: (context) => {
          return createCalendarFeature(
            createGoogleCalendarAdapter({
              config: context.adapterConfig.google,
              env: context.dependencies.env,
              fetch: context.dependencies.fetch,
            }),
            {
              upcomingWindowDays: context.adapterConfig.upcomingWindowDays,
            },
          );
        },
        parseConfig: parseCalendarGoogleAdapterConfig,
        validateStartup: ({ adapterConfig, dependencies }) =>
          validateGoogleCalendarStartup(adapterConfig, dependencies.env),
      }),
      mock: defineFeatureAdapterEntry<CalendarFeatureConfig>({
        create: (context) =>
          createCalendarFeature(createMockCalendar(), {
            upcomingWindowDays: context.adapterConfig.upcomingWindowDays,
          }),
        parseConfig: parseCalendarFeatureConfig,
      }),
    },
  };
}

function validateGoogleCalendarStartup(
  config: CalendarGoogleAdapterConfig,
  env: Record<string, string | undefined>,
): void {
  if (env[config.google.accessTokenEnv]) {
    return;
  }

  const missingRefreshCredential = [
    config.google.clientIdEnv,
    config.google.clientSecretEnv,
    config.google.refreshTokenEnv,
  ].find((envName) => !env[envName]);

  if (missingRefreshCredential) {
    throw new Error(
      `Google Calendar is selected but ${missingRefreshCredential} is not set. Run "npm run setup:google-calendar" first, add the printed GOOGLE_CALENDAR_REFRESH_TOKEN line to .env, then start the service again.`,
    );
  }
}
