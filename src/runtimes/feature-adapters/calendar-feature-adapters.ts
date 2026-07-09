import { createGoogleCalendarAdapter } from "../../adapters/google-calendar/google-calendar-adapter.js";
import { createMockCalendar } from "../../adapters/mock/mock-calendar.js";
import { createCalendarFeature } from "../../features/calendar/calendar-feature.js";
import type { GoogleCalendarConfig } from "../../ports/calendar.js";
import { parseCalendarFeatureConfig } from "../config/calendar-feature-config.js";
import {
  defineFeatureAdapterEntry,
  type FeatureRegistryEntry,
} from "../feature-adapter-registry.js";

export function createCalendarFeatureRegistryEntry(): FeatureRegistryEntry {
  return {
    adapters: {
      google: defineFeatureAdapterEntry({
        create: (context) => {
          return createCalendarFeature(
            createGoogleCalendarAdapter({
              config: context.adapterConfig.google,
              env: context.dependencies.env,
              fetch: context.dependencies.fetch,
            }),
          );
        },
        resolveConfig: requireCalendarGoogleAdapterConfig,
      }),
      mock: defineFeatureAdapterEntry({
        create: () => createCalendarFeature(createMockCalendar()),
        resolveConfig: () => {},
      }),
    },
  };
}

interface CalendarGoogleAdapterConfig {
  google: GoogleCalendarConfig;
}

function requireCalendarGoogleAdapterConfig(context: {
  rawFeatureConfig: Record<string, unknown>;
}): CalendarGoogleAdapterConfig {
  const featureConfig = parseCalendarFeatureConfig(context.rawFeatureConfig);

  if (!featureConfig.google) {
    throw new Error('Config feature "calendar".google must be configured.');
  }

  return {
    google: featureConfig.google,
  };
}
