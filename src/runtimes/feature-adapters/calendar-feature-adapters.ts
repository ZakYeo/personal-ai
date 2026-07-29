import { createGoogleCalendarAdapter } from "../../adapters/google-calendar/google-calendar-adapter.js";
import { resolveGoogleCalendarCredentials } from "../../adapters/google-calendar/google-calendar-credentials.js";
import { createMockCalendar } from "../../adapters/mock/mock-calendar.js";
import { createCalendarFeature } from "../../features/calendar/calendar-feature.js";
import {
  defineFeatureAdapter,
  type FeatureRegistryEntry,
} from "../feature-adapter-registry.js";
import {
  parseCalendarFeatureConfig,
  parseCalendarGoogleAdapterConfig,
  type CalendarGoogleAdapterConfig,
} from "./calendar-feature-adapter-config.js";

interface CalendarFeatureRegistryDependencies {
  env: Record<string, string | undefined>;
  fetch: typeof fetch;
}

const googleCalendarAdapter = defineFeatureAdapter({
  parseConfig: parseCalendarGoogleAdapterConfig,
});
const mockCalendarAdapter = defineFeatureAdapter({
  parseConfig: parseCalendarFeatureConfig,
});

export function createCalendarFeatureRegistryEntry(
  dependencies: CalendarFeatureRegistryDependencies,
): FeatureRegistryEntry {
  return {
    adapters: {
      google: googleCalendarAdapter.bind({
        create: (context) => {
          return createCalendarFeature(
            createGoogleCalendarAdapter({
              config: context.adapterConfig.google,
              env: dependencies.env,
              fetch: dependencies.fetch,
            }),
            {
              upcomingWindowDays: context.adapterConfig.upcomingWindowDays,
            },
          );
        },
        validateStartup: (adapterConfig) =>
          validateGoogleCalendarStartup(adapterConfig, dependencies.env),
      }),
      mock: mockCalendarAdapter.bind({
        create: (context) =>
          createCalendarFeature(createMockCalendar(), {
            upcomingWindowDays: context.adapterConfig.upcomingWindowDays,
          }),
      }),
    },
  };
}

function validateGoogleCalendarStartup(
  config: CalendarGoogleAdapterConfig,
  env: Record<string, string | undefined>,
): void {
  resolveGoogleCalendarCredentials({
    config: config.google,
    createMissingCredentialError: ({ envName }) =>
      new Error(
        `Google Calendar is selected but ${envName} is not set. Run "npm run setup:google-calendar" first, add the printed GOOGLE_CALENDAR_REFRESH_TOKEN line to .env, then start the service again.`,
      ),
    env,
  });
}
