import { parseAssistantConfig } from "./config.js";
import { createDefaultIntentProviderRegistry } from "../intent-provider-selection.js";
import { parseIntentConfig } from "./intent-config.js";

describe("intent config parsing", () => {
  it("rejects non-object intent config at the intent parser boundary", () => {
    expect(() =>
      parseIntentConfig(undefined, createDefaultIntentProviderRegistry()),
    ).toThrow("Config intent section must be a JSON object.");
  });

  it("rejects missing providers at the intent parser boundary", () => {
    expect(() =>
      parseIntentConfig({}, createDefaultIntentProviderRegistry()),
    ).toThrow("Config intent.provider must be a non-empty string.");
  });

  it("parses OpenAI intent config with defaults", () => {
    const intent = parseAssistantConfig(
      createMinimalConfig({
        intent: {
          provider: "openai",
          openai: {
            model: "gpt-5.5",
          },
        },
      }),
    ).intent;

    expect(intent.provider).toBe("openai");
    expect(typeof intent.resolvedProvider.create).toBe("function");
  });

  it("parses OpenAI intent config overrides", () => {
    const intent = parseAssistantConfig(
      createMinimalConfig({
        intent: {
          provider: "openai",
          openai: {
            apiKeyEnv: "PERSONAL_AI_OPENAI_API_KEY",
            baseUrl: "https://example.test/v1",
            model: "gpt-5.5",
            timeoutMs: 1000,
          },
        },
      }),
    ).intent;

    expect(intent.provider).toBe("openai");
    expect(typeof intent.resolvedProvider.create).toBe("function");
  });

  it("rejects OpenAI intent provider without provider settings", () => {
    expect(() =>
      parseAssistantConfig(
        createMinimalConfig({
          intent: {
            provider: "openai",
          },
        }),
      ),
    ).toThrow("Config intent.openai must be configured.");
  });

  it("rejects invalid OpenAI intent model", () => {
    expect(() =>
      parseAssistantConfig(
        createMinimalConfig({
          intent: {
            provider: "openai",
            openai: {
              model: "",
            },
          },
        }),
      ),
    ).toThrow("Config intent.openai.model must be a non-empty string.");
  });

  it("rejects invalid OpenAI intent API key env", () => {
    expect(() =>
      parseAssistantConfig(
        createMinimalConfig({
          intent: {
            provider: "openai",
            openai: {
              apiKeyEnv: "",
              model: "gpt-5.5",
            },
          },
        }),
      ),
    ).toThrow("Config intent.openai.apiKeyEnv must be a non-empty string.");
  });

  it("rejects invalid OpenAI intent timeout", () => {
    expect(() =>
      parseAssistantConfig(
        createMinimalConfig({
          intent: {
            provider: "openai",
            openai: {
              model: "gpt-5.5",
              timeoutMs: 0,
            },
          },
        }),
      ),
    ).toThrow("Config intent.openai.timeoutMs must be a positive integer.");
  });
});

function createMinimalConfig(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    assistant: {
      name: "Jarvis",
      wakePhrases: ["hey jarvis"],
    },
    intent: {
      provider: "deterministic",
    },
    features: {},
    ...overrides,
  };
}
