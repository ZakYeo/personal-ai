import { parseAssistantConfig } from "./config.js";
import { requireConversationConfig } from "./conversation-config.js";
import { defineRuntimeProvider } from "../runtime-provider-registry.js";

describe("conversation config parsing", () => {
  it("lets a registry entry parse custom conversation provider config", () => {
    const create = vi.fn((config: { tone: string }): undefined => {
      void config;

      return;
    });
    const conversation = parseAssistantConfig(
      createMinimalConfig({
        conversation: {
          custom: { tone: "brief" },
          provider: "custom",
        },
      }),
      {
        conversationProviderRegistry: {
          custom: defineRuntimeProvider({
            configKey: "custom",
            create,
            parseConfig: (value) => {
              if (
                typeof value !== "object" ||
                value === null ||
                !("tone" in value) ||
                typeof value.tone !== "string"
              ) {
                throw new Error("custom tone required");
              }

              return { tone: value.tone };
            },
          }),
        },
      },
    ).conversation;

    conversation.resolvedProvider.create({
      dependencies: { env: {}, fetch: vi.fn() as typeof fetch },
      features: [],
      history: conversation.history,
    });

    expect(create).toHaveBeenCalledOnce();
    expect(create.mock.calls[0]?.[0]).toEqual({ tone: "brief" });
  });

  it("defaults to disabled conversation with five chats before compaction", () => {
    const conversation = parseAssistantConfig(
      createMinimalConfig(),
    ).conversation;

    expect(conversation).toMatchObject({
      history: {
        maxTurnsBeforeCompaction: 5,
      },
      provider: "disabled",
    });
    expect(typeof conversation.resolvedProvider.create).toBe("function");
  });

  it("parses OpenAI conversation config with defaults", () => {
    const conversation = parseAssistantConfig(
      createMinimalConfig({
        conversation: {
          provider: "openai",
          openai: {
            model: "gpt-5.5",
          },
        },
      }),
    ).conversation;

    expect(conversation).toMatchObject({
      history: {
        maxTurnsBeforeCompaction: 5,
      },
      provider: "openai",
    });
    expect(typeof conversation.resolvedProvider.create).toBe("function");
  });

  it("parses conversation config overrides", () => {
    const conversation = parseAssistantConfig(
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
    ).conversation;

    expect(conversation).toMatchObject({
      history: {
        maxTurnsBeforeCompaction: 7,
      },
      provider: "openai",
    });
    expect(typeof conversation.resolvedProvider.create).toBe("function");
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
    const config = parseAssistantConfig(createMinimalConfig());

    expect(requireConversationConfig(config)).toBe(config.conversation);
  });

  it("resolves OpenAI conversation config with provider settings", () => {
    const config = parseAssistantConfig(
      createMinimalConfig({
        conversation: {
          provider: "openai",
          openai: {
            model: "gpt-5.5",
          },
        },
      }),
    );

    expect(requireConversationConfig(config)).toBe(config.conversation);
  });

  it("rejects OpenAI conversation provider without provider settings", () => {
    expect(() =>
      parseAssistantConfig(
        createMinimalConfig({
          conversation: {
            provider: "openai",
          },
        }),
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
