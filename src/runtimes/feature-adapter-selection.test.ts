import type { AlarmStore } from "../ports/alarm-store.js";
import type { FeaturePlugin } from "../ports/feature.js";
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
  it("passes narrow adapter dependencies and adapter config to registered factories", () => {
    const alarmStore = createFakeAlarmStore();
    let observedContext: FeatureAdapterContext | undefined;
    const registry: FeatureAdapterRegistry = {
      calendar: {
        mock: (context) => {
          observedContext = context;
          return createTestFeature("calendar");
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

  it("resolves Google calendar config before invoking adapter factories", () => {
    const factory = vi.fn(() => createTestFeature("calendar"));
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
          google: factory,
        },
      },
    });

    expect(factory).toHaveBeenCalledWith(
      expect.objectContaining({
        adapterConfig: {
          google: config.features.calendar.google,
        },
      }),
    );
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
