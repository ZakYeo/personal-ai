import { parseOptionalOpenAIResponsesConfig } from "./openai-responses-config.js";

describe("OpenAI Responses config parsing", () => {
  it("parses shared defaults with a caller-owned config path", () => {
    expect(
      parseOptionalOpenAIResponsesConfig(
        { model: "gpt-test" },
        "Config conversation.openai",
      ),
    ).toEqual({
      apiKeyEnv: "OPENAI_API_KEY",
      baseUrl: "https://api.openai.com/v1",
      model: "gpt-test",
      timeoutMs: 30_000,
    });
  });

  it("returns undefined when the optional provider section is absent", () => {
    expect(
      parseOptionalOpenAIResponsesConfig(
        undefined,
        "Config responseRewriter.openai",
      ),
    ).toBeUndefined();
  });

  it("parses an explicit reasoning effort", () => {
    expect(
      parseOptionalOpenAIResponsesConfig(
        { model: "gpt-5.6-luna", reasoningEffort: "none" },
        "Config intent.openai",
      ),
    ).toMatchObject({
      model: "gpt-5.6-luna",
      reasoningEffort: "none",
    });
  });

  it("rejects an unsupported reasoning effort", () => {
    expect(() =>
      parseOptionalOpenAIResponsesConfig(
        { model: "gpt-5.6-luna", reasoningEffort: "minimal" },
        "Config intent.openai",
      ),
    ).toThrow(
      'Config intent.openai.reasoningEffort must be one of "none", "low", "medium", "high", "xhigh", or "max".',
    );
  });

  it("uses the caller-owned path in validation failures", () => {
    expect(() =>
      parseOptionalOpenAIResponsesConfig({}, "Config intent.openai"),
    ).toThrow("Config intent.openai.model must be a non-empty string.");
  });
});
