import type { AlarmStore } from "../ports/alarm-store.js";
import type { FeaturePlugin } from "../ports/feature.js";
import type { LoadedRuntimeConfig } from "./config/config.js";
import { defineCapability, defineFeature } from "../ports/feature.js";
import { enabledDeterministicConfig } from "../test-support/deterministic-runtime-fixtures.js";
import {
  withFeatureAdapterId,
  withFeatureEnabled,
  withoutFeatureAdapterId,
} from "../test-support/runtime-composition.js";
import {
  createConfiguredFeatures,
  type FeatureAdapterContext,
  type FeatureAdapterRegistry,
} from "./feature-adapter-selection.js";

describe("createConfiguredFeatures", () => {
  it("passes narrow adapter dependencies and selected feature config to registered entries", () => {
    const alarmStore = createFakeAlarmStore();
    let observedContext: FeatureAdapterContext | undefined;
    const registry: FeatureAdapterRegistry = {
      calendar: {
        mock: {
          create: (context) => {
            observedContext = context;
            return createTestFeature("calendar");
          },
        },
      },
    };
    const config = withFeatureEnabled(
      "alarms",
      false,
      withFeatureEnabled("messaging", false, enabledDeterministicConfig),
    );

    const features = createConfiguredFeatures(config, {
      dependencies: { alarmStore },
      registry,
    });

    expect(features.map((feature) => feature.id)).toEqual(["calendar"]);
    expect(observedContext).toMatchObject({
      dependencies: {
        alarmStore,
        env: expect.any(Object) as Record<string, string | undefined>,
        fetch: expect.any(Function) as typeof fetch,
      },
      featureConfig: config.features.calendar,
    });
  });

  it("ignores disabled features before requiring a registered feature or adapter ID", () => {
    expect(() =>
      createConfiguredFeatures(
        withoutFeatureAdapterId(
          "notes",
          withFeatureEnabled("notes", false, enabledDeterministicConfig),
        ),
      ),
    ).not.toThrow();
  });

  it("rejects enabled features without registered feature adapters", () => {
    expect(() =>
      createConfiguredFeatures(withFeatureAdapterId("notes", "mock")),
    ).toThrow('Config feature "notes" is not registered.');
  });

  it("rejects enabled features without registered adapter IDs", () => {
    expect(() =>
      createConfiguredFeatures(withFeatureAdapterId("calendar", "unknown")),
    ).toThrow('Config feature "calendar" adapter "unknown" is not registered.');
  });

  it("rejects enabled features without adapter IDs", () => {
    expect(() =>
      createConfiguredFeatures(withoutFeatureAdapterId("calendar")),
    ).toThrow(
      'Config feature "calendar".adapter must be set for enabled features.',
    );
  });

  it("rejects Google calendar adapters without provider config", () => {
    expect(() =>
      createConfiguredFeatures(withFeatureAdapterId("calendar", "google")),
    ).toThrow('Config feature "calendar".google must be configured.');
  });

  it("lets registered entries resolve their selected adapter config", () => {
    const resolvedConfigs: TestGoogleConfig[] = [];
    const factory = vi.fn((adapterConfig: TestGoogleConfig) => {
      resolvedConfigs.push(adapterConfig);

      return createTestFeature("calendar");
    });
    const googleCalendarConfig = withFeatureEnabled(
      "alarms",
      false,
      withFeatureEnabled(
        "messaging",
        false,
        withFeatureAdapterId("calendar", "google"),
      ),
    );
    const config = {
      ...googleCalendarConfig,
      features: {
        ...googleCalendarConfig.features,
        calendar: {
          enabled: true,
          adapter: "google",
          google: {
            accessTokenEnv: "GOOGLE_CALENDAR_ACCESS_TOKEN",
            baseUrl: "https://calendar.example.test/v3",
            calendarId: "primary",
            maxResults: 10,
            timeoutMs: 30_000,
          },
        },
      },
    };

    createConfiguredFeatures(config, {
      registry: {
        calendar: {
          google: {
            create: (context) => {
              const adapterConfig = requireTestGoogleConfig(
                context.featureConfig,
              );

              return factory(adapterConfig);
            },
          },
        },
      },
    });

    expect(factory).toHaveBeenCalledWith({
      google: {
        accessTokenEnv: config.features.calendar.google.accessTokenEnv,
      },
    });
    expect(resolvedConfigs).toEqual([
      {
        google: {
          accessTokenEnv: config.features.calendar.google.accessTokenEnv,
        },
      },
    ]);
  });
});

function createTestFeature(id: string): FeaturePlugin {
  return defineFeature({
    id,
    displayName: "Test Feature",
    capabilities: {
      "test.noop": defineCapability({
        risk: "low",
        parameters: {},
        execute: () => ({ text: "ok" }),
      }),
    },
  });
}

function createFakeAlarmStore(): AlarmStore {
  return {
    add: vi.fn(),
    list: vi.fn(() => []),
  };
}

interface TestGoogleConfig {
  google: {
    accessTokenEnv: string;
  };
}

function requireTestGoogleConfig(
  featureConfig: LoadedRuntimeConfig["features"][string],
): TestGoogleConfig {
  const googleConfig = featureConfig.google;

  if (
    typeof googleConfig !== "object" ||
    googleConfig === null ||
    !("accessTokenEnv" in googleConfig) ||
    typeof googleConfig.accessTokenEnv !== "string"
  ) {
    throw new Error('Config feature "calendar".google must be configured.');
  }

  return {
    google: {
      accessTokenEnv: googleConfig.accessTokenEnv,
    },
  };
}
