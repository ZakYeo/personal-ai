import type { FeaturePlugin } from "../ports/feature.js";
import type { LoadedRuntimeConfig } from "./config/config.js";
import { defineCapability, defineFeature } from "../ports/feature.js";
import {
  disabledCalendarConfig,
  enabledDeterministicConfig,
} from "../test-support/deterministic-runtime-fixtures.js";
import {
  withFeatureAdapterId,
  withFeatureEnabled,
  withoutFeatureAdapterId,
} from "../test-support/runtime-composition.js";
import {
  createConfiguredFeatureSelection,
  createConfiguredFeatures,
  defineFeatureAdapterEntry,
  type FeatureAdapterDependencies,
  type FeatureAdapterRegistry,
} from "./feature-adapter-selection.js";

describe("createConfiguredFeatures", () => {
  it("passes narrow adapter dependencies and selected adapter config to registered entries", () => {
    let observedContext:
      | {
          adapterConfig: void;
          dependencies: FeatureAdapterDependencies;
        }
      | undefined;
    const registry: FeatureAdapterRegistry = {
      calendar: {
        adapters: {
          mock: defineFeatureAdapterEntry({
            create: (context) => {
              observedContext = context;
              return createTestFeature("calendar");
            },
            resolveConfig: () => {},
          }),
        },
      },
    };
    const config = withFeatureEnabled(
      "alarms",
      false,
      withFeatureEnabled("messaging", false, enabledDeterministicConfig),
    );

    const features = createConfiguredFeatures(config, {
      registry,
    });

    expect(features.map((feature) => feature.id)).toEqual(["calendar"]);
    expect(Object.keys(observedContext?.dependencies ?? {}).sort()).toEqual([
      "env",
      "fetch",
    ]);
    expect(observedContext).toMatchObject({
      dependencies: {
        env: expect.any(Object) as Record<string, string | undefined>,
        fetch: expect.any(Function) as typeof fetch,
      },
      adapterConfig: undefined,
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

  it("does not expose registry-level deterministic rules", () => {
    const selection = createConfiguredFeatureSelection(disabledCalendarConfig);

    expect(selection.features.map((feature) => feature.id)).toEqual([
      "messaging",
      "alarms",
    ]);
    expect(selection).not.toHaveProperty("deterministicIntentRules");
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

  it("resolves Google calendar adapter config with defaults when selected", () => {
    const config = onlyGoogleCalendarConfig({
      google: {},
    });

    const features = createConfiguredFeatures(config);

    expect(features.map((feature) => feature.id)).toEqual(["calendar"]);
  });

  it("rejects invalid Google calendar adapter config only when selected", () => {
    const config = onlyGoogleCalendarConfig({
      google: {
        timeoutMs: 0,
      },
    });

    expect(() => createConfiguredFeatures(config)).toThrow(
      'Config feature "calendar".google.timeoutMs must be a positive integer.',
    );
  });

  it("lets registered entries resolve their selected adapter config", () => {
    const resolvedConfigs: TestGoogleConfig[] = [];
    const factory = vi.fn((adapterConfig: TestGoogleConfig) => {
      resolvedConfigs.push(adapterConfig);

      return createTestFeature("calendar");
    });
    const config = onlyGoogleCalendarConfig({
      google: {
        accessTokenEnv: "GOOGLE_CALENDAR_ACCESS_TOKEN",
        baseUrl: "https://calendar.example.test/v3",
        calendarId: "primary",
        maxResults: 10,
        timeoutMs: 30_000,
      },
    });

    createConfiguredFeatures(config, {
      registry: {
        calendar: {
          adapters: {
            google: defineFeatureAdapterEntry({
              resolveConfig: (featureConfig) =>
                requireTestGoogleConfig(featureConfig),
              create: (context) => {
                return factory(context.adapterConfig);
              },
            }),
          },
        },
      },
    });

    expect(factory).toHaveBeenCalledWith({
      google: {
        accessTokenEnv: "GOOGLE_CALENDAR_ACCESS_TOKEN",
      },
    });
    expect(resolvedConfigs).toEqual([
      {
        google: {
          accessTokenEnv: "GOOGLE_CALENDAR_ACCESS_TOKEN",
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

function onlyGoogleCalendarConfig(
  calendarOverrides: Record<string, unknown>,
): LoadedRuntimeConfig {
  const config = withFeatureEnabled(
    "alarms",
    false,
    withFeatureEnabled(
      "messaging",
      false,
      withFeatureAdapterId("calendar", "google"),
    ),
  );

  return {
    ...config,
    features: {
      ...config.features,
      calendar: {
        enabled: config.features.calendar?.enabled ?? true,
        ...(config.features.calendar?.adapter
          ? { adapter: config.features.calendar.adapter }
          : {}),
        ...calendarOverrides,
      },
    },
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
