import type { FeaturePlugin } from "../ports/feature.js";
import { defineCapability, defineFeature } from "../ports/feature.js";
import {
  disabledCalendarConfig,
  enabledDeterministicConfig,
} from "../test-support/deterministic-runtime-fixtures.js";
import { parseAssistantConfig } from "./config/config.js";
import {
  createConfiguredFeatureSelection,
  createConfiguredFeatures,
  defineFeatureAdapterEntry,
  type FeatureAdapterDependencies,
  type FeatureAdapterRegistry,
  validateConfiguredFeatureAdapters,
} from "./feature-adapter-selection.js";

const featureAdapterDependencies: FeatureAdapterDependencies = {
  clock: { now: () => new Date("2026-07-14T09:00:00.000Z") },
  env: {},
  fetch: vi.fn() as typeof fetch,
};

describe("createConfiguredFeatures", () => {
  it("collects neutral runtime tasks contributed by selected features", () => {
    const selection = createConfiguredFeatureSelection(
      enabledDeterministicConfig,
      {
        dependencies: {
          ...featureAdapterDependencies,
          notificationDelivery: { deliver: () => Promise.resolve() },
        },
      },
    );

    expect(selection.backgroundTasks).toEqual([
      expect.objectContaining({
        failureReason: "alarm scheduler failed",
        id: "alarms.delivery",
      }),
      expect.objectContaining({
        failureReason: "alarm retention cleanup failed",
        id: "alarms.retention",
      }),
    ]);
    expect(
      selection.features.find((feature) => feature.id === "alarms"),
    ).toBeDefined();
  });

  it("parses selected adapter config through the same typed registry entry that creates it", () => {
    let observedContext:
      | {
          adapterConfig: { endpoint: string };
          dependencies: FeatureAdapterDependencies;
        }
      | undefined;
    const registry: FeatureAdapterRegistry = {
      notes: {
        adapters: {
          remote: defineFeatureAdapterEntry<{ endpoint: string }>({
            create: (context) => {
              observedContext = context;

              return createTestFeature("notes");
            },
            parseConfig: (featureConfig) => {
              if (typeof featureConfig.endpoint !== "string") {
                throw new Error("notes endpoint required");
              }

              return { endpoint: featureConfig.endpoint };
            },
          }),
        },
      },
    };
    const config = parseAssistantConfig(
      createMinimalFeatureConfig({
        notes: {
          adapter: "remote",
          enabled: true,
          endpoint: "https://notes.test",
        },
      }),
      { featureAdapterRegistry: registry },
    );

    expect(config.features.notes).not.toHaveProperty("endpoint");
    expect(
      createConfiguredFeatures(config, {
        dependencies: featureAdapterDependencies,
      }).map((feature) => feature.id),
    ).toEqual(["notes", "assistant"]);
    expect(observedContext).toMatchObject({
      adapterConfig: { endpoint: "https://notes.test" },
      dependencies: featureAdapterDependencies,
    });
  });

  it("ignores disabled features before requiring a registered feature or adapter ID", () => {
    const config = parseAssistantConfig(
      createMinimalFeatureConfig({ notes: { enabled: false } }),
    );

    expect(() =>
      createConfiguredFeatures(config, {
        dependencies: featureAdapterDependencies,
      }),
    ).not.toThrow();
  });

  it("runs startup preflight with the typed config captured by the selected entry", () => {
    const validateStartup = vi.fn();
    const registry: FeatureAdapterRegistry = {
      notes: {
        adapters: {
          remote: defineFeatureAdapterEntry<{ tokenEnv: string }>({
            create: () => createTestFeature("notes"),
            parseConfig: () => ({ tokenEnv: "NOTES_TOKEN" }),
            validateStartup: ({ adapterConfig, dependencies }) => {
              validateStartup(adapterConfig, dependencies.env);
            },
          }),
        },
      },
    };
    const config = parseAssistantConfig(
      createMinimalFeatureConfig({
        notes: { adapter: "remote", enabled: true },
      }),
      { featureAdapterRegistry: registry },
    );
    const dependencies = {
      ...featureAdapterDependencies,
      env: { NOTES_TOKEN: "secret" },
    };

    validateConfiguredFeatureAdapters(config, dependencies);

    expect(validateStartup).toHaveBeenCalledWith(
      { tokenEnv: "NOTES_TOKEN" },
      dependencies.env,
    );
  });

  it("rejects adapters that construct a different feature ID", () => {
    const registry: FeatureAdapterRegistry = {
      notes: {
        adapters: {
          mismatched: defineFeatureAdapterEntry({
            create: () => createTestFeature("calendar"),
            parseConfig: () => ({}),
          }),
        },
      },
    };
    const config = parseAssistantConfig(
      createMinimalFeatureConfig({
        notes: { adapter: "mismatched", enabled: true },
      }),
      { featureAdapterRegistry: registry },
    );

    expect(() =>
      createConfiguredFeatures(config, {
        dependencies: featureAdapterDependencies,
      }),
    ).toThrow(
      'Config feature "notes" adapter created feature "calendar" instead.',
    );
  });

  it("rejects feature capabilities already owned by the built-in assistant", () => {
    const registry: FeatureAdapterRegistry = {
      notes: {
        adapters: {
          mock: defineFeatureAdapterEntry({
            create: () =>
              createTestFeature("notes", "assistant.capabilities.list"),
            parseConfig: () => ({}),
          }),
        },
      },
    };
    const config = parseAssistantConfig(
      createMinimalFeatureConfig({
        notes: { adapter: "mock", enabled: true },
      }),
      { featureAdapterRegistry: registry },
    );

    expect(() =>
      createConfiguredFeatures(config, {
        dependencies: featureAdapterDependencies,
      }),
    ).toThrow(
      'Capability "assistant.capabilities.list" is declared by both "notes" and "assistant".',
    );
  });

  it("does not expose registry-level deterministic rules", () => {
    const selection = createConfiguredFeatureSelection(disabledCalendarConfig, {
      dependencies: featureAdapterDependencies,
    });

    expect(selection.features.map((feature) => feature.id)).toEqual([
      "messaging",
      "alarms",
      "assistant",
    ]);
    expect(selection).not.toHaveProperty("deterministicIntentRules");
  });

  it("rejects enabled features without registered feature adapters during parsing", () => {
    expect(() =>
      parseAssistantConfig(
        createMinimalFeatureConfig({
          notes: { adapter: "mock", enabled: true },
        }),
      ),
    ).toThrow('Config feature "notes" is not registered.');
  });

  it("rejects enabled features without registered adapter IDs during parsing", () => {
    expect(() =>
      parseAssistantConfig(
        createMinimalFeatureConfig({
          calendar: { adapter: "unknown", enabled: true },
        }),
      ),
    ).toThrow('Config feature "calendar" adapter "unknown" is not registered.');
  });

  it("rejects enabled features without adapter IDs during parsing", () => {
    expect(() =>
      parseAssistantConfig(
        createMinimalFeatureConfig({ calendar: { enabled: true } }),
      ),
    ).toThrow(
      'Config feature "calendar".adapter must be set for enabled features.',
    );
  });

  it("rejects Google calendar adapters without provider config", () => {
    expect(() => onlyGoogleCalendarConfig({})).toThrow(
      'Config feature "calendar".google must be configured.',
    );
  });

  it("resolves Google calendar adapter config with defaults when selected", () => {
    const config = onlyGoogleCalendarConfig({ google: {} });

    expect(
      createConfiguredFeatures(config, {
        dependencies: featureAdapterDependencies,
      }).map((feature) => feature.id),
    ).toEqual(["calendar", "assistant"]);
  });

  it("rejects invalid Google calendar adapter config only when selected", () => {
    expect(() =>
      onlyGoogleCalendarConfig({ google: { timeoutMs: 0 } }),
    ).toThrow(
      'Config feature "calendar".google.timeoutMs must be a positive integer.',
    );
  });

  it("does not parse unselected adapter config", () => {
    expect(() =>
      parseAssistantConfig(
        createMinimalFeatureConfig({
          calendar: {
            adapter: "mock",
            enabled: true,
            google: { timeoutMs: 0 },
          },
        }),
      ),
    ).not.toThrow();
  });
});

function createTestFeature(
  id: string,
  capabilityName = "test.noop",
): FeaturePlugin {
  return defineFeature({
    id,
    displayName: "Test Feature",
    capabilities: {
      [capabilityName]: defineCapability({
        risk: "low",
        parameters: {},
        execute: () => ({ text: "ok" }),
      }),
    },
  });
}

function createMinimalFeatureConfig(
  features: Record<string, unknown>,
): Record<string, unknown> {
  return {
    assistant: { name: "Jarvis", wakePhrases: ["hey jarvis"] },
    features,
    intent: { provider: "deterministic" },
  };
}

function onlyGoogleCalendarConfig(calendarOverrides: Record<string, unknown>) {
  return parseAssistantConfig(
    createMinimalFeatureConfig({
      calendar: {
        adapter: "google",
        enabled: true,
        ...calendarOverrides,
      },
    }),
  );
}
