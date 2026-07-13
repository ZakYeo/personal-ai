import { defineRuntimeProvider } from "../runtime-provider-registry.js";
import { parseAssistantConfig } from "./config.js";

describe("response rewriter config parsing", () => {
  it("defaults to disabled response rewriting", () => {
    const responseRewriter = parseAssistantConfig(
      createMinimalConfig(),
    ).responseRewriter;

    expect(responseRewriter.provider).toBe("disabled");
    expect(typeof responseRewriter.resolvedProvider.create).toBe("function");
  });

  it("parses and captures OpenAI response rewriter config", () => {
    const responseRewriter = parseAssistantConfig(
      createMinimalConfig({
        responseRewriter: {
          openai: {
            model: "gpt-5.4-nano",
          },
          provider: "openai",
        },
      }),
    ).responseRewriter;

    expect(responseRewriter.provider).toBe("openai");
    expect(typeof responseRewriter.resolvedProvider.create).toBe("function");
  });

  it("lets a registry entry parse custom response rewriter config", () => {
    const create = vi.fn((config: { style: string }): undefined => {
      void config;

      return;
    });
    const responseRewriter = parseAssistantConfig(
      createMinimalConfig({
        responseRewriter: {
          custom: { style: "brief" },
          provider: "custom",
        },
      }),
      {
        responseRewriterProviderRegistry: {
          custom: defineRuntimeProvider({
            configKey: "custom",
            create,
            parseConfig: (value) => {
              if (
                typeof value !== "object" ||
                value === null ||
                !("style" in value) ||
                typeof value.style !== "string"
              ) {
                throw new Error("custom style required");
              }

              return { style: value.style };
            },
          }),
        },
      },
    ).responseRewriter;

    responseRewriter.resolvedProvider.create({
      env: {},
      fetch: vi.fn() as typeof fetch,
    });

    expect(create.mock.calls[0]?.[0]).toEqual({ style: "brief" });
  });

  it("rejects unknown response rewriter providers", () => {
    expect(() =>
      parseAssistantConfig(
        createMinimalConfig({
          responseRewriter: { provider: "unknown" },
        }),
      ),
    ).toThrow('Config responseRewriter.provider "unknown" is not registered.');
  });

  it("rejects OpenAI response rewriter without provider settings", () => {
    expect(() =>
      parseAssistantConfig(
        createMinimalConfig({
          responseRewriter: { provider: "openai" },
        }),
      ),
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
