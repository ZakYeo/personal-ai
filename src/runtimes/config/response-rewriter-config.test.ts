import { parseAssistantConfig } from "./config.js";
import { requireResponseRewriterConfig } from "./response-rewriter-config.js";

describe("response rewriter config parsing", () => {
  it("defaults to disabled response rewriting", () => {
    expect(
      parseAssistantConfig(createMinimalConfig()).responseRewriter,
    ).toEqual({
      provider: "disabled",
    });
  });

  it("parses OpenAI response rewriter config with defaults", () => {
    expect(
      parseAssistantConfig(
        createMinimalConfig({
          responseRewriter: {
            openai: {
              model: "gpt-5.4-nano",
            },
            provider: "openai",
          },
        }),
      ).responseRewriter,
    ).toEqual({
      openai: {
        apiKeyEnv: "OPENAI_API_KEY",
        baseUrl: "https://api.openai.com/v1",
        model: "gpt-5.4-nano",
        timeoutMs: 30_000,
      },
      provider: "openai",
    });
  });

  it("rejects unknown response rewriter providers during resolution", () => {
    expect(() =>
      requireResponseRewriterConfig({
        responseRewriter: {
          provider: "unknown",
        },
      }),
    ).toThrow('Config responseRewriter.provider "unknown" is not registered.');
  });

  it("rejects OpenAI response rewriter provider without provider settings", () => {
    expect(() =>
      requireResponseRewriterConfig({
        responseRewriter: {
          provider: "openai",
        },
      }),
    ).toThrow("Config responseRewriter.openai must be configured.");
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
