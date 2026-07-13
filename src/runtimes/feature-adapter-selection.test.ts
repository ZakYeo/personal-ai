import type { FeaturePlugin } from "../ports/feature.js";
import { defineCapability, defineFeature } from "../ports/feature.js";
import { disabledCalendarConfig } from "../test-support/deterministic-runtime-fixtures.js";
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
  env: {},
  fetch: vi.fn() as typeof fetch,
};

describe("createConfiguredFeatures", () => {
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
