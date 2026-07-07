import { parseAssistantConfig } from "./config.js";
import { requireIntentConfig } from "./intent-config.js";

describe("intent config parsing", () => {
  it("parses OpenAI intent config with defaults", () => {
    expect(
      parseAssistantConfig(
        createMinimalConfig({
          intent: {
            provider: "openai",
            openai: {
              model: "gpt-5.5",
            },
          },
        }),
      ).intent,
    ).toEqual({
      provider: "openai",
      openai: {
        apiKeyEnv: "OPENAI_API_KEY",
        baseUrl: "https://api.openai.com/v1",
        model: "gpt-5.5",
        timeoutMs: 30_000,
      },
    });
  });

  it("parses OpenAI intent config overrides", () => {
    expect(
      parseAssistantConfig(
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
      ).intent.openai,
    ).toEqual({
      apiKeyEnv: "PERSONAL_AI_OPENAI_API_KEY",
      baseUrl: "https://example.test/v1",
      model: "gpt-5.5",
      timeoutMs: 1000,
    });
  });

  it("parses OpenAI intent provider without provider settings", () => {
    expect(
      parseAssistantConfig(
        createMinimalConfig({
          intent: {
            provider: "openai",
          },
        }),
      ).intent,
    ).toEqual({
      provider: "openai",
    });
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

describe("intent config resolution", () => {
  it("resolves OpenAI intent config with provider settings", () => {
    expect(
      requireIntentConfig(
        parseAssistantConfig(
          createMinimalConfig({
            intent: {
              provider: "openai",
              openai: {
                model: "gpt-5.5",
              },
            },
          }),
        ),
      ),
    ).toEqual({
      provider: "openai",
      openai: {
        apiKeyEnv: "OPENAI_API_KEY",
        baseUrl: "https://api.openai.com/v1",
        model: "gpt-5.5",
        timeoutMs: 30_000,
      },
    });
  });

  it("rejects OpenAI intent provider without provider settings during resolution", () => {
    expect(() =>
      requireIntentConfig(
        parseAssistantConfig(
          createMinimalConfig({
            intent: {
              provider: "openai",
            },
          }),
        ),
      ),
    ).toThrow("Config intent.openai must be configured.");
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
