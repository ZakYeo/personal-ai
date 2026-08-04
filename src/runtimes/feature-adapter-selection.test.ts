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
  type FeatureAdapterRuntimeContext,
  type FeatureAdapterRegistry,
  validateConfiguredFeatureAdapters,
} from "./feature-adapter-selection.js";

import { createDefaultFeatureAdapterRegistry } from "./default-feature-adapter-registry.js";
import {
  defineConfiglessFeatureAdapterEntry,
  defineFeatureAdapter,
} from "./feature-adapter-registry.js";
import { rebindFeatureAdapters } from "./config/feature-config.js";

const featureAdapterRuntime: FeatureAdapterRuntimeContext = {
  clock: { now: () => new Date("2026-07-14T09:00:00.000Z") },
};

describe("createConfiguredFeatures", () => {
  it("collects neutral runtime tasks contributed by selected features", () => {
    const config = parseAssistantConfig(
      createMinimalFeatureConfig({
        alarms: { adapter: "local", enabled: true },
      }),
      {
        featureAdapterRegistry: createDefaultFeatureAdapterRegistry({
          alarms: {
            notificationDelivery: { deliver: () => Promise.resolve() },
          },
        }),
      },
    );
    const selection = createConfiguredFeatureSelection(config, {
      runtime: featureAdapterRuntime,
    });

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

  it("contributes alarm retention without notification delivery", () => {
    const selection = createConfiguredFeatureSelection(
      enabledDeterministicConfig,
      { runtime: featureAdapterRuntime },
    );

    expect(selection.backgroundTasks).toEqual([
      expect.objectContaining({
        failureReason: "alarm retention cleanup failed",
        id: "alarms.retention",
      }),
    ]);
  });

  it("parses selected adapter config through the same typed registry entry that creates it", () => {
    let observedContext:
      | {
          adapterConfig: { endpoint: string };
          runtime: FeatureAdapterRuntimeContext;
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
        runtime: featureAdapterRuntime,
      }).map((feature) => feature.id),
    ).toEqual(["notes", "assistant"]);
    expect(observedContext).toMatchObject({
      adapterConfig: { endpoint: "https://notes.test" },
      runtime: featureAdapterRuntime,
    });
    expect(observedContext?.runtime).not.toHaveProperty("env");
    expect(observedContext?.runtime).not.toHaveProperty("fetch");
  });

  it("ignores disabled features before requiring a registered feature or adapter ID", () => {
    const config = parseAssistantConfig(
      createMinimalFeatureConfig({ notes: { enabled: false } }),
    );

    expect(() =>
      createConfiguredFeatures(config, {
        runtime: featureAdapterRuntime,
      }),
    ).not.toThrow();
  });

  it("runs startup preflight with the typed config captured by the selected entry", () => {
    const validateStartup = vi.fn();
    const providerDependencies = { env: { NOTES_TOKEN: "secret" } };
    const registry: FeatureAdapterRegistry = {
      notes: {
        adapters: {
          remote: defineFeatureAdapterEntry({
            create: () => createTestFeature("notes"),
            parseConfig: () => ({ tokenEnv: "NOTES_TOKEN" }),
            validateStartup: (adapterConfig) => {
              validateStartup(adapterConfig, providerDependencies.env);
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
    validateConfiguredFeatureAdapters(config);

    expect(validateStartup).toHaveBeenCalledWith(
      { tokenEnv: "NOTES_TOKEN" },
      providerDependencies.env,
    );
  });

  it("rebinds dependencies without parsing selected adapter config again", () => {
    const parseConfig = vi.fn(() => ({ endpoint: "https://notes.test" }));
    const adapter = defineFeatureAdapter({ parseConfig });
    const originalCreate = vi.fn(() => createTestFeature("notes"));
    const replacementCreate = vi.fn(() => createTestFeature("notes"));
    const config = parseAssistantConfig(
      createMinimalFeatureConfig({
        notes: { adapter: "remote", enabled: true },
      }),
      {
        featureAdapterRegistry: {
          notes: {
            adapters: {
              remote: adapter.bind({ create: originalCreate }),
            },
          },
        },
      },
    );
    const reboundConfig = {
      ...config,
      features: rebindFeatureAdapters(config.features, {
        notes: {
          adapters: {
            remote: adapter.bind({ create: replacementCreate }),
          },
        },
      }),
    };

    createConfiguredFeatures(reboundConfig, {
      runtime: featureAdapterRuntime,
    });

    expect(parseConfig).toHaveBeenCalledOnce();
    expect(originalCreate).not.toHaveBeenCalled();
    expect(replacementCreate).toHaveBeenCalledWith({
      adapterConfig: { endpoint: "https://notes.test" },
      runtime: featureAdapterRuntime,
    });
  });

  it("rejects rebinding through an independently defined adapter", () => {
    const config = parseAssistantConfig(
      createMinimalFeatureConfig({
        notes: { adapter: "remote", enabled: true },
      }),
      {
        featureAdapterRegistry: {
          notes: {
            adapters: {
              remote: defineFeatureAdapter({
                parseConfig: () => ({ endpoint: "https://notes.test" }),
              }).bind({ create: () => createTestFeature("notes") }),
            },
          },
        },
      },
    );

    expect(() =>
      rebindFeatureAdapters(config.features, {
        notes: {
          adapters: {
            remote: defineFeatureAdapter({
              parseConfig: () => ({ endpoint: "https://notes.test" }),
            }).bind({ create: () => createTestFeature("notes") }),
          },
        },
      }),
    ).toThrow(
      "Feature adapter parsed configuration is incompatible with the selected registry entry.",
    );
  });

  it("rejects rebinding when the selected registry entry is missing", () => {
    const adapter = defineFeatureAdapter({ parseConfig: () => ({}) });
    const config = parseAssistantConfig(
      createMinimalFeatureConfig({
        notes: { adapter: "remote", enabled: true },
      }),
      {
        featureAdapterRegistry: {
          notes: {
            adapters: {
              remote: adapter.bind({
                create: () => createTestFeature("notes"),
              }),
            },
          },
        },
      },
    );

    expect(() => rebindFeatureAdapters(config.features, {})).toThrow(
      'Config feature "notes" is not registered.',
    );
  });

  it("rebinds configless adapter entries without fake parsing", () => {
    const originalCreate = vi.fn(() => createTestFeature("notes"));
    const replacementCreate = vi.fn(() => createTestFeature("notes"));
    const config = parseAssistantConfig(
      createMinimalFeatureConfig({
        notes: { adapter: "local", enabled: true },
      }),
      {
        featureAdapterRegistry: {
          notes: {
            adapters: {
              local: defineConfiglessFeatureAdapterEntry({
                create: originalCreate,
              }),
            },
          },
        },
      },
    );
    const rebound = rebindFeatureAdapters(config.features, {
      notes: {
        adapters: {
          local: defineConfiglessFeatureAdapterEntry({
            create: replacementCreate,
          }),
        },
      },
    });

    createConfiguredFeatures(
      { ...config, features: rebound },
      {
        runtime: featureAdapterRuntime,
      },
    );

    expect(originalCreate).not.toHaveBeenCalled();
    expect(replacementCreate).toHaveBeenCalledWith({
      runtime: featureAdapterRuntime,
    });
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
        runtime: featureAdapterRuntime,
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
        runtime: featureAdapterRuntime,
      }),
    ).toThrow(
      'Capability "assistant.capabilities.list" is declared by both "notes" and "assistant".',
    );
  });

  it("does not expose registry-level deterministic rules", () => {
    const selection = createConfiguredFeatureSelection(disabledCalendarConfig, {
      runtime: featureAdapterRuntime,
    });

    expect(selection.features.map((feature) => feature.id)).toEqual([
      "internetSearch",
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
        runtime: featureAdapterRuntime,
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
    assistant: {
      name: "Jarvis",
      timeZone: "Europe/London",
      wakePhrases: ["hey jarvis"],
    },
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
