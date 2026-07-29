import { parseAssistantConfig } from "../config/config.js";
import { createConfiguredTextRuntime } from "../configured-text-runtime.js";
import { createDefaultFeatureAdapterRegistry } from "../default-feature-adapter-registry.js";
import { validateConfiguredFeatureAdapters } from "../feature-adapter-selection.js";
import { createLoadedRuntimeConfig } from "../../test-support/core-assistant.js";
import { deterministicTestNow } from "../../test-support/primitives.js";

describe("internet search feature adapters", () => {
  it("routes deterministic searches through the configured mock adapter", async () => {
    const assistant = await createConfiguredTextRuntime({
      config: createLoadedRuntimeConfig({
        internetSearch: {
          adapter: "mock",
          enabled: true,
          maxResults: 5,
        },
      }),
      now: () => deterministicTestNow,
    });

    await expect(
      assistant.handleText(
        "Hey Jarvis, search the internet for TypeScript 5.7",
      ),
    ).resolves.toEqual({
      citations: [
        {
          title: "Announcing TypeScript 5.7",
          url: "https://devblogs.microsoft.com/typescript/announcing-typescript-5-7/",
        },
      ],
      expectsFollowUp: true,
      status: "ok",
      text: "TypeScript 5.7 adds checks for variables that have never been initialized. Source: Announcing TypeScript 5.7.",
    });
  });

  it("answers a follow-up against only the retained search source", async () => {
    const assistant = await createConfiguredTextRuntime({
      config: createLoadedRuntimeConfig({
        internetSearch: { adapter: "mock", enabled: true },
      }),
      now: () => deterministicTestNow,
    });
    await assistant.handleText("Hey Jarvis, search the web for TypeScript 5.7");

    await expect(
      assistant.handleText("What did the first source say?"),
    ).resolves.toEqual({
      citations: [
        {
          title: "Announcing TypeScript 5.7",
          url: "https://devblogs.microsoft.com/typescript/announcing-typescript-5-7/",
        },
      ],
      status: "ok",
      text: "Announcing TypeScript 5.7: TypeScript 5.7 adds checks for variables that have never been initialized.",
    });
  });

  it("clears prior sources when the latest search has no results", async () => {
    const assistant = await createConfiguredTextRuntime({
      config: createLoadedRuntimeConfig({
        internetSearch: { adapter: "mock", enabled: true },
      }),
      now: () => deterministicTestNow,
    });
    await assistant.handleText("Hey Jarvis, search the web for TypeScript 5.7");
    await assistant.handleText(
      "Hey Jarvis, search the web for an unmatched subject",
    );

    await expect(
      assistant.handleText("What did the first source say?"),
    ).resolves.toEqual({
      expectsFollowUp: true,
      status: "ok",
      text: "I am not sure which recent internet source you mean.",
    });
  });

  it("parses and captures narrow OpenAI search config", () => {
    const config = parseAssistantConfig(
      createRawSearchConfig({
        adapter: "openai",
        enabled: true,
        maxResults: 3,
        openai: {
          apiKeyEnv: "SEARCH_OPENAI_KEY",
          baseUrl: "https://api.openai.example.test/v1",
          model: "search-model",
          timeoutMs: 12_000,
        },
      }),
    );

    expect(config.features.internetSearch).toMatchObject({
      adapter: "openai",
      enabled: true,
    });
    expect(config.features.internetSearch).not.toHaveProperty("openai");
  });

  it("rejects missing provider config and out-of-bound result limits", () => {
    expect(() =>
      parseAssistantConfig(
        createRawSearchConfig({
          adapter: "openai",
          enabled: true,
        }),
      ),
    ).toThrow('Config feature "internetSearch".openai must be configured.');
    expect(() =>
      parseAssistantConfig(
        createRawSearchConfig({
          adapter: "mock",
          enabled: true,
          maxResults: 11,
        }),
      ),
    ).toThrow(
      'Config feature "internetSearch".maxResults must be an integer from 1 to 10.',
    );
  });

  it("validates the selected OpenAI credential without making a request", () => {
    const fetch = vi.fn<typeof globalThis.fetch>();
    const config = parseAssistantConfig(
      createRawSearchConfig({
        adapter: "openai",
        enabled: true,
        openai: { model: "search-model" },
      }),
      {
        featureAdapterRegistry: createDefaultFeatureAdapterRegistry({
          internetSearch: { env: {}, fetch },
        }),
      },
    );

    expect(() => validateConfiguredFeatureAdapters(config)).toThrow(
      "OpenAI web search is selected but OPENAI_API_KEY is not set.",
    );
    expect(fetch).not.toHaveBeenCalled();
  });
});

function createRawSearchConfig(
  searchConfig: Record<string, unknown>,
): Record<string, unknown> {
  return {
    assistant: {
      name: "Jarvis",
      timeZone: "Europe/London",
      wakePhrases: ["hey jarvis"],
    },
    features: { internetSearch: searchConfig },
    intent: { provider: "deterministic" },
  };
}
