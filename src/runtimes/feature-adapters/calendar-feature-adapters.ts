import { createGoogleCalendarAdapter } from "../../adapters/google-calendar/google-calendar-adapter.js";
import { createMockCalendar } from "../../adapters/mock/mock-calendar.js";
import { createCalendarFeature } from "../../features/calendar/calendar-feature.js";
import type { GoogleCalendarConfig } from "../../ports/calendar.js";
import type { ParsedFeatureConfig } from "../config/feature-config.js";
import {
  defineFeatureAdapterEntry,
  type FeatureRegistryEntry,
} from "../feature-adapter-registry.js";

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
        resolveConfig: (featureConfig): CalendarGoogleAdapterConfig =>
          requireCalendarGoogleAdapterConfig({ featureConfig }),
      }),
      mock: defineFeatureAdapterEntry<CalendarMockAdapterConfig>({
        create: (context) =>
          createCalendarFeature(createMockCalendar(), {
            upcomingWindowDays: context.adapterConfig.upcomingWindowDays,
          }),
        resolveConfig: (featureConfig): CalendarMockAdapterConfig => ({
          upcomingWindowDays: requireUpcomingWindowDays(featureConfig),
        }),
      }),
    },
  };
}

interface CalendarGoogleAdapterConfig {
  google: GoogleCalendarConfig;
  upcomingWindowDays: number;
}

interface CalendarMockAdapterConfig {
  upcomingWindowDays: number;
}

function requireCalendarGoogleAdapterConfig(context: {
  featureConfig: ParsedFeatureConfig;
}): CalendarGoogleAdapterConfig {
  const featureConfig = context.featureConfig;

  if (!featureConfig.google) {
    throw new Error('Config feature "calendar".google must be configured.');
  }

  return {
    google: featureConfig.google,
    upcomingWindowDays: requireUpcomingWindowDays(featureConfig),
  };
}

function requireUpcomingWindowDays(featureConfig: ParsedFeatureConfig): number {
  if (featureConfig.upcomingWindowDays === undefined) {
    throw new Error(
      'Config feature "calendar".upcomingWindowDays must be configured.',
    );
  }

  return featureConfig.upcomingWindowDays;
}
