import { parseAssistantConfig } from "./config.js";
import { requireConversationConfig } from "./conversation-config.js";

describe("conversation config parsing", () => {
  it("defaults to disabled conversation with five chats before compaction", () => {
    expect(parseAssistantConfig(createMinimalConfig()).conversation).toEqual({
      history: {
        maxTurnsBeforeCompaction: 5,
      },
      provider: "disabled",
    });
  });

  it("parses OpenAI conversation config with defaults", () => {
    expect(
      parseAssistantConfig(
        createMinimalConfig({
          conversation: {
            provider: "openai",
            openai: {
              model: "gpt-5.5",
            },
          },
        }),
      ).conversation,
    ).toEqual({
      history: {
        maxTurnsBeforeCompaction: 5,
      },
      openai: {
        apiKeyEnv: "OPENAI_API_KEY",
        baseUrl: "https://api.openai.com/v1",
        model: "gpt-5.5",
        timeoutMs: 30_000,
      },
      provider: "openai",
    });
  });

  it("parses conversation config overrides", () => {
    expect(
      parseAssistantConfig(
        createMinimalConfig({
          conversation: {
            history: {
              maxTurnsBeforeCompaction: 7,
            },
            provider: "openai",
            openai: {
              apiKeyEnv: "PERSONAL_AI_OPENAI_API_KEY",
              baseUrl: "https://example.test/v1",
              model: "gpt-5.5",
              timeoutMs: 1000,
            },
          },
        }),
      ).conversation,
    ).toEqual({
      history: {
        maxTurnsBeforeCompaction: 7,
      },
      openai: {
        apiKeyEnv: "PERSONAL_AI_OPENAI_API_KEY",
        baseUrl: "https://example.test/v1",
        model: "gpt-5.5",
        timeoutMs: 1000,
      },
      provider: "openai",
    });
  });

  it("rejects invalid conversation compaction count", () => {
    expect(() =>
      parseAssistantConfig(
        createMinimalConfig({
          conversation: {
            history: {
              maxTurnsBeforeCompaction: 0,
            },
            provider: "disabled",
          },
        }),
      ),
    ).toThrow(
      "Config conversation.history.maxTurnsBeforeCompaction must be a positive integer.",
    );
  });

  it("rejects invalid OpenAI conversation model", () => {
    expect(() =>
      parseAssistantConfig(
        createMinimalConfig({
          conversation: {
            provider: "openai",
            openai: {
              model: "",
            },
          },
        }),
      ),
    ).toThrow("Config conversation.openai.model must be a non-empty string.");
  });
});

describe("conversation config resolution", () => {
  it("resolves disabled conversation config", () => {
    expect(
      requireConversationConfig(parseAssistantConfig(createMinimalConfig())),
    ).toEqual({
      history: {
        maxTurnsBeforeCompaction: 5,
      },
      provider: "disabled",
    });
  });

  it("resolves OpenAI conversation config with provider settings", () => {
    expect(
      requireConversationConfig(
        parseAssistantConfig(
          createMinimalConfig({
            conversation: {
              provider: "openai",
              openai: {
                model: "gpt-5.5",
              },
            },
          }),
        ),
      ),
    ).toEqual({
      history: {
        maxTurnsBeforeCompaction: 5,
      },
      openai: {
        apiKeyEnv: "OPENAI_API_KEY",
        baseUrl: "https://api.openai.com/v1",
        model: "gpt-5.5",
        timeoutMs: 30_000,
      },
      provider: "openai",
    });
  });

  it("rejects OpenAI conversation provider without provider settings during resolution", () => {
    expect(() =>
      requireConversationConfig(
        parseAssistantConfig(
          createMinimalConfig({
            conversation: {
              provider: "openai",
            },
          }),
        ),
      ),
    ).toThrow("Config conversation.openai must be configured.");
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
    features: {},
    intent: {
      provider: "deterministic",
    },
    ...overrides,
  };
}
